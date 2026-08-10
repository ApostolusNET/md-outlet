import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync, watch, existsSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import { resolve, dirname, join, sep, basename, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProfile } from "./load-profile.js";
import { renderHtml } from "./render-html.js";
import { resolveDocument } from "./resolve-document.js";
import { listBuiltInProfiles } from "./init-profile.js";
import { listBuiltInThemes } from "./list-themes.js";
import { openBrowser, openExternal } from "./open-browser.js";
import {
  profileFromPayload,
  profileToObject,
  saveProfileFile,
} from "./serialize-profile.js";
import { exportPdf } from "./export-pdf.js";
import { PKG_ROOT, PROFILES_DIR } from "./paths.js";
import type { Profile } from "./types.js";
import { resolveUiSavePath } from "./ui-save-path.js";
import { listLibraryDocs } from "./library-docs.js";
import {
  DEFAULT_LANG,
  LOCALES_DIR,
  normalizeLang,
  t,
  type Lang,
} from "./i18n.js";
import {
  assertMarkdownSize,
  assetRootFromMarkdownPath,
  guessAssetMime,
  resolveSafeAssetPath,
} from "./assets.js";
import {
  browseMarkdownDir,
  browseRootFrom,
  listBrowseRoots,
} from "./browse-md.js";
import {
  listRecent,
  rememberRecent,
  removeRecent,
  setRecentPinned,
} from "./recent-files.js";
import { resolveMarkdownOpenLink } from "./resolve-md-link.js";
import { resolveDroppedMarkdownPath } from "./resolve-drop.js";
import {
  dataPreviewHtml,
  detectDocKind,
  fallbackDataDocName,
  isDataDocKind,
  isDataDocPath,
  normalizeOpenDocPath,
  type DataDocKind,
} from "./file-kind.js";
import {
  activeTab,
  closeActiveTab,
  closeTab,
  emptyTabState,
  legacyDocFields,
  openInTabs,
  setActiveText,
  switchTab,
  updateActiveTab,
  type UiTabState,
} from "./ui-tabs.js";
import { createUiMsg, type UiMsgBag } from "./ui-messages.js";
import { readDocNote, writeDocNote } from "./doc-notes.js";

const UI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "ui");

export interface UiServerOptions {
  /** Document to open (Markdown or XML). If omitted, starts empty with recent-file list. */
  mdPath?: string;
  profileRef: string;
  /** Where Save writes. Absolute or cwd-relative. */
  savePath: string;
  port: number;
  host?: string;
  /** Open the default browser after listen (default true). */
  open?: boolean;
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}

/** MIME for the UI's own static assets (styles.css / js/*). */
function uiAssetMime(abs: string): string {
  if (abs.endsWith(".css")) return "text/css; charset=utf-8";
  if (abs.endsWith(".mjs") || abs.endsWith(".js"))
    return "text/javascript; charset=utf-8";
  if (abs.endsWith(".map")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function isBundledProfile(sourcePath?: string): boolean {
  if (!sourcePath) return false;
  const src = resolve(sourcePath);
  const root = resolve(PROFILES_DIR);
  return src === root || src.startsWith(root + sep);
}

function stripSource(profile: Profile): Profile {
  const { __sourcePath: _, ...rest } = profile;
  return rest as Profile;
}

export async function startUiServer(opts: UiServerOptions): Promise<void> {
  /** Document tabs (max 3). Legacy mdPath/markdown are derived from the active tab. */
  let tabState: UiTabState = emptyTabState();
  if (opts.mdPath?.trim()) {
    const initial = resolve(process.cwd(), opts.mdPath.trim());
    if (!existsSync(initial)) {
      throw new Error(`File not found: ${initial}`);
    }
    const text = readFileSync(initial, "utf8");
    const opened = openInTabs(tabState, initial, text, {
      replaceWhenFull: true,
    });
    if (!opened.ok) {
      throw new Error(opened.error);
    }
    tabState = opened.state;
    rememberRecent(initial);
  }
  const saveAbsInitial = resolve(process.cwd(), opts.savePath);

  let profileRef = opts.profileRef;
  let baseProfile = loadProfile(profileRef);
  let saveAbs = saveAbsInitial;
  /** Last PDF written by Export — served at GET /api/pdf */
  let lastPdfPath: string | null = null;
  const browseRoots = listBrowseRoots(PKG_ROOT);
  /** Last language chosen by the open UI (header X-MD-Outlet-Lang). Default ja. */
  let uiLang: Lang = DEFAULT_LANG;

  const activePath = (): string | null => activeTab(tabState)?.path ?? null;

  const msgFor = (lang: Lang = uiLang): UiMsgBag => createUiMsg(lang);

  const adoptLangFromReq = (req: IncomingMessage): Lang => {
    const raw = req.headers["x-md-outlet-lang"];
    if (raw != null && String(raw).trim()) {
      uiLang = normalizeLang(raw);
    }
    return uiLang;
  };

  /**
   * Open a path into tabs.
   * - replaceWhenFull=true: legacy open-md (swap active when full)
   * - replaceWhenFull=false: strict tab open (409 when full)
   */
  const openDocPath = (
    absPath: string,
    options: { replaceWhenFull: boolean; msg?: UiMsgBag }
  ):
    | { ok: true; tabState: UiTabState; kind: string; text: string }
    | { ok: false; status: number; error: string } => {
    const msg = options.msg ?? msgFor();
    if (!existsSync(absPath)) {
      removeRecent(absPath);
      return {
        ok: false,
        status: 404,
        error: msg.fileNotFound(absPath),
      };
    }
    const kind = detectDocKind(absPath);
    if (kind === "unknown") {
      return {
        ok: false,
        status: 400,
        error: msg.unsupportedFile(absPath),
      };
    }
    const text = readFileSync(absPath, "utf8");
    const opened = openInTabs(tabState, absPath, text, {
      replaceWhenFull: options.replaceWhenFull,
      msg,
    });
    if (!opened.ok) {
      return {
        ok: false,
        status: opened.code === "full" ? 409 : 400,
        error: opened.error,
      };
    }
    tabState = opened.state;
    rememberRecent(absPath);
    return { ok: true, tabState, kind, text };
  };

  /** Render body from client markdown (or disk) through the same pipeline. */
  const bodyFromMarkdown = (markdown: string): string => {
    const resolved = resolveDocument({
      markdown,
      profileRef,
      profileExplicit: true,
    });
    return resolved.body;
  };

  const activeAssetRoot = () =>
    assetRootFromMarkdownPath(activePath() ?? PKG_ROOT);

  /** Short-lived notice for the open browser UI (SendTo / second CLI). */
  let flashSeq = 0;
  let uiFlash: {
    id: number;
    kind: "ok" | "err";
    message: string;
    at: number;
  } | null = null;

  const setUiFlash = (kind: "ok" | "err", message: string): void => {
    flashSeq += 1;
    uiFlash = { id: flashSeq, kind, message, at: Date.now() };
  };

  const noteSnapshot = () => {
    const mdAbs = activePath();
    const note = mdAbs ? readDocNote(mdAbs) : { path: "", text: "" };
    return {
      docNote: note.text,
      docNotePath: note.path || null,
    };
  };

  const snapshotState = () => {
    return {
      ...legacyDocFields(tabState),
      recent: listRecent(),
      profileRef,
      savePath: saveAbs,
      /** Scratch note for the active file (never written into the document). */
      ...noteSnapshot(),
      /** “Home” jump target for the open picker (package root). */
      workspaceRoot: PKG_ROOT,
      /** Default ceiling hint (local drive of the package). */
      browseRoot: browseRootFrom(PKG_ROOT),
      /** Quick jumps: md-outlet, drive root, WSL distros (when available). */
      browseRoots,
      bundledSource: isBundledProfile(baseProfile.__sourcePath),
      builtins: listBuiltInProfiles(),
      themes: listBuiltInThemes(),
      locale: uiLang,
      library: listLibraryDocs(uiLang),
      profile: profileToObject(baseProfile),
      /** Present for ~20s so the open page can toast without a new browser tab. */
      uiFlash:
        uiFlash && Date.now() - uiFlash.at < 20_000
          ? {
              id: uiFlash.id,
              kind: uiFlash.kind,
              message: uiFlash.message,
            }
          : null,
    };
  };

  /** Delayed exit when the UI tab closes (cancelled if the page reloads). */
  let shutdownTimer: ReturnType<typeof setTimeout> | null = null;
  const allowAutoExit = process.env.MD_OUTLET_NO_AUTO_EXIT !== "1";

  const cancelScheduledShutdown = (): void => {
    if (shutdownTimer) {
      clearTimeout(shutdownTimer);
      shutdownTimer = null;
    }
  };

  const scheduleShutdown = (delayMs = 1500): void => {
    if (!allowAutoExit) {
      console.log("UI close ignored (MD_OUTLET_NO_AUTO_EXIT=1)");
      return;
    }
    cancelScheduledShutdown();
    shutdownTimer = setTimeout(() => {
      console.log("UI tab closed — stopping (same as Ctrl+C).");
      try {
        server.close(() => process.exit(0));
      } catch {
        /* ignore */
      }
      setTimeout(() => process.exit(0), 800);
    }, delayMs);
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", `http://${opts.host ?? "127.0.0.1"}`);
      const path = url.pathname;
      const reqLang = adoptLangFromReq(req);
      const msg = msgFor(reqLang);

      // Tab refresh reconnects quickly — cancel a pending auto-exit.
      if (path !== "/api/shutdown") {
        cancelScheduledShutdown();
      }

      if (req.method === "GET" && (path === "/" || path === "/index.html")) {
        const html = readFileSync(resolve(UI_DIR, "index.html"), "utf8");
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(html);
        return;
      }

      // Locale catalogs (shared with the browser UI).
      if (req.method === "GET" && path.startsWith("/locales/")) {
        const name = path.slice("/locales/".length);
        if (!/^(ja|en)\.json$/.test(name)) {
          res.writeHead(404).end("Not found");
          return;
        }
        const abs = resolve(LOCALES_DIR, name);
        const rootSep = LOCALES_DIR.endsWith(sep) ? LOCALES_DIR : LOCALES_DIR + sep;
        if (!abs.startsWith(rootSep) || !existsSync(abs)) {
          res.writeHead(404).end("Not found");
          return;
        }
        res.writeHead(200, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(readFileSync(abs));
        return;
      }

      // Static UI assets (styles.css / js/*). Sandbox to UI_DIR to block traversal.
      if (
        req.method === "GET" &&
        (path === "/styles.css" || path.startsWith("/js/"))
      ) {
        const rel = path.replace(/^\/+/, "");
        const abs = resolve(UI_DIR, rel);
        const uiRootSep = UI_DIR.endsWith(sep) ? UI_DIR : UI_DIR + sep;
        if (!abs.startsWith(uiRootSep) || !existsSync(abs)) {
          res.writeHead(404).end("Not found");
          return;
        }
        const mime = uiAssetMime(abs);
        res.writeHead(200, {
          "Content-Type": mime,
          "Cache-Control": "no-store",
        });
        res.end(readFileSync(abs));
        return;
      }

      /**
       * Browser tab closed (sendBeacon / fetch keepalive).
       * Grace period so F5 refresh can cancel before process.exit.
       */
      if (
        (req.method === "POST" || req.method === "GET") &&
        path === "/api/shutdown"
      ) {
        json(res, 200, { ok: true, shuttingDown: true });
        scheduleShutdown(1500);
        return;
      }

      if (req.method === "GET" && path === "/api/state") {
        baseProfile = loadProfile(profileRef);
        json(res, 200, snapshotState());
        return;
      }

      if (req.method === "POST" && path === "/api/use-template") {
        const raw = JSON.parse(await readBody(req)) as { profile?: string };
        const name = raw.profile?.trim();
        if (!name) {
          json(res, 400, { error: "Missing profile name" });
          return;
        }
        baseProfile = loadProfile(name);
        profileRef = name;
        // Built-in → suggest ./<name>.yaml; file profiles keep their path.
        if (isBundledProfile(baseProfile.__sourcePath)) {
          saveAbs = resolveUiSavePath(name);
        } else if (baseProfile.__sourcePath) {
          saveAbs = baseProfile.__sourcePath;
        }
        json(res, 200, snapshotState());
        return;
      }

      if (req.method === "GET" && path === "/api/asset") {
        const rel = url.searchParams.get("p") || "";
        const assetRoot = activeAssetRoot();
        const abs = resolveSafeAssetPath(assetRoot, decodeURIComponent(rel));
        if (!abs || !existsSync(abs)) {
          res.writeHead(404).end("Not found");
          return;
        }
        const buf = readFileSync(abs);
        res.writeHead(200, {
          "Content-Type": guessAssetMime(abs),
          "Cache-Control": "no-store",
        });
        res.end(buf);
        return;
      }

      if (req.method === "POST" && path === "/api/preview") {
        const raw = JSON.parse(await readBody(req)) as {
          profile?: Record<string, unknown>;
          markdown?: string;
        };
        const mdAbs = activePath();
        const text =
          typeof raw.markdown === "string"
            ? raw.markdown
            : activeTab(tabState)?.text ??
              (mdAbs && existsSync(mdAbs) ? readFileSync(mdAbs, "utf8") : "");

        // Data docs (xml/json/yaml/txt/log/csv): scan-only preview (not MD→HTML).
        {
          const kind = detectDocKind(mdAbs);
          if (isDataDocKind(kind)) {
            assertMarkdownSize(text);
            // Keep in-memory text in sync when the client sends editor contents.
            if (typeof raw.markdown === "string") {
              tabState = setActiveText(tabState, raw.markdown);
            }
            const html = dataPreviewHtml(
              kind as DataDocKind,
              text,
              mdAbs
                ? basename(mdAbs)
                : fallbackDataDocName(kind as DataDocKind),
              reqLang
            );
            res.writeHead(200, {
              "Content-Type": "text/html; charset=utf-8",
              "Cache-Control": "no-store",
            });
            res.end(html);
            return;
          }
        }

        if (!raw.profile || typeof raw.profile !== "object") {
          json(res, 400, { error: "Missing profile object" });
          return;
        }
        assertMarkdownSize(text);
        const body = bodyFromMarkdown(text);
        const profile = profileFromPayload(baseProfile, raw.profile);
        const host = req.headers.host || `${opts.host ?? "127.0.0.1"}:${opts.port}`;
        const apiOrigin = `${url.protocol}//${host}`;
        const { html } = renderHtml(body, stripSource(profile), {
          assetRoot: activeAssetRoot(),
          assetMode: "api",
          apiOrigin,
        });
        // Screen chrome only (not used for PDF): readable measure + side/bottom padding.
        // <base> helps any remaining root-relative URLs inside iframe srcdoc.
        const pageBreakCss = JSON.stringify(
          t(reqLang, "preview.pageBreakLabel")
        );
        const withChrome = html.replace(
          "</head>",
          `<base href="${apiOrigin}/" />
<style data-md-outlet="preview-chrome">
html {
  --md-outlet-page-break-label: ${pageBreakCss};
  background: #fff;
}
body {
  max-width: 46rem;
  margin: 0 auto;
  padding: 1.75rem 2rem 3rem;
  box-sizing: border-box;
}
img { max-width: 100%; height: auto; }
</style></head>`
        );
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(withChrome);
        return;
      }

      if (req.method === "POST" && path === "/api/save") {
        const raw = JSON.parse(await readBody(req)) as {
          profile?: Record<string, unknown>;
          savePath?: string;
        };
        if (!raw.profile || typeof raw.profile !== "object") {
          json(res, 400, { error: "Missing profile object" });
          return;
        }
        const target = resolve(
          process.cwd(),
          raw.savePath?.trim() || saveAbs
        );
        if (isBundledProfile(target)) {
          json(res, 400, {
            error:
              "Refusing to overwrite a bundled profile. Choose a path outside md-outlet/profiles/.",
          });
          return;
        }
        const profile = profileFromPayload(baseProfile, raw.profile);
        const written = saveProfileFile(stripSource(profile), target, {
          force: true,
        });
        if (resolve(written) === resolve(saveAbs) || raw.savePath) {
          try {
            baseProfile = loadProfile(written);
          } catch {
            /* keep previous base */
          }
        }
        json(res, 200, { ok: true, path: written });
        return;
      }

      if (req.method === "POST" && path === "/api/save-md") {
        const raw = JSON.parse(await readBody(req)) as {
          markdown?: string;
          /** Optional: write here and switch the active Markdown path */
          path?: string;
        };
        if (typeof raw.markdown !== "string") {
          json(res, 400, { error: "Missing markdown string" });
          return;
        }
        const mdAbs = activePath();
        {
          const kind = detectDocKind(mdAbs);
          if (isDataDocKind(kind)) {
            json(res, 400, {
              error: msg.saveViewOnly(kind.toUpperCase()),
            });
            return;
          }
        }
        let requested = raw.path?.trim() || "";
        if (!requested) {
          if (!mdAbs) {
            json(res, 400, {
              error: msg.noSaveTarget,
            });
            return;
          }
          writeFileSync(mdAbs, raw.markdown, "utf8");
          tabState = setActiveText(tabState, raw.markdown);
          rememberRecent(mdAbs);
          json(res, 200, {
            ...legacyDocFields(tabState),
            ok: true,
            path: mdAbs,
            switched: false,
            recent: listRecent(),
          });
          return;
        }
        if (isDataDocPath(requested)) {
          json(res, 400, {
            error:
              "XML / JSON / YAML / TXT / LOG / CSV への保存は未対応です（閲覧のみ）。",
          });
          return;
        }
        if (!/\.md$/i.test(requested)) {
          requested = requested + ".md";
        }
        const out = resolve(process.cwd(), requested);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, raw.markdown, "utf8");
        const switched = out !== mdAbs;
        tabState = updateActiveTab(tabState, {
          path: out,
          text: raw.markdown,
        });
        rememberRecent(out);
        console.log(`Markdown saved: ${out}${switched ? " (active file switched)" : ""}`);
        json(res, 200, {
          ...legacyDocFields(tabState),
          ok: true,
          path: out,
          switched,
          recent: listRecent(),
        });
        return;
      }

      if (req.method === "GET" && path === "/api/browse-md") {
        try {
          const dir = url.searchParams.get("dir") || undefined;
          // ext=md|pdf|md,pdf — comma list without dots. Empty = dirs only.
          const extRaw = url.searchParams.get("ext");
          let extensions: string[] | undefined;
          if (extRaw !== null) {
            const parts = extRaw
              .split(",")
              .map((s) => s.trim().toLowerCase())
              .filter(Boolean)
              .map((s) => (s.startsWith(".") ? s : `.${s}`));
            if (parts.includes(".md") && !parts.includes(".markdown")) {
              parts.push(".markdown");
            }
            extensions = parts;
          }
          // Ceiling follows the place being listed (C:\ vs \\wsl.localhost\…).
          const listing = browseMarkdownDir(dir, {
            home: PKG_ROOT,
            extensions,
          });
          json(res, 200, listing);
        } catch (err) {
          json(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === "POST" && path === "/api/close-md") {
        // Close the active tab only (phase 1 multi-tab). Empty when none left.
        tabState = closeActiveTab(tabState);
        lastPdfPath = null;
        console.log(
          tabState.activeId
            ? `Tab closed — active: ${activePath()}`
            : "All tabs closed (back to empty / recent)"
        );
        json(res, 200, {
          ok: true,
          ...snapshotState(),
        });
        return;
      }

      /** Strict open: add/activate tab; 409 when already at max 3. */
      if (req.method === "POST" && path === "/api/tabs/open") {
        const raw = JSON.parse(await readBody(req)) as {
          path?: string;
          /** Preserve in-progress editor text on the current active tab. */
          markdown?: string;
        };
        let requested = raw.path?.trim() || "";
        if (!requested) {
          json(res, 400, { error: "Missing path" });
          return;
        }
        // Sync active tab text before opening another (no client tab-id required).
        if (typeof raw.markdown === "string" && activeTab(tabState)) {
          tabState = setActiveText(tabState, raw.markdown);
        }
        requested = normalizeOpenDocPath(requested);
        const next = isAbsolute(requested)
          ? resolve(requested)
          : resolve(process.cwd(), requested);
        const result = openDocPath(next, { replaceWhenFull: false, msg });
        if (!result.ok) {
          console.log(`Tab open failed (${result.status}): ${result.error}`);
          if (result.status === 409) {
            setUiFlash("err", result.error);
          }
          json(res, result.status, {
            error: result.error,
            recent: listRecent(),
            ...legacyDocFields(tabState),
            uiFlash,
          });
          return;
        }
        const kindLabel =
          result.kind === "md" ? "Markdown" : String(result.kind).toUpperCase();
        console.log(`${kindLabel} opened (tab): ${next}`);
        setUiFlash(
          "ok",
          t(reqLang, "toast.opened", { path: basename(next) })
        );
        json(res, 200, {
          ...legacyDocFields(tabState),
          ...noteSnapshot(),
          ok: true,
          path: next,
          recent: listRecent(),
          uiFlash,
        });
        return;
      }

      /** Sync editor text onto the server active tab (no tab id needed). */
      if (req.method === "POST" && path === "/api/tabs/sync") {
        const raw = JSON.parse(await readBody(req)) as { markdown?: string };
        if (typeof raw.markdown !== "string") {
          json(res, 400, { error: "Missing markdown" });
          return;
        }
        if (activeTab(tabState)) {
          tabState = setActiveText(tabState, raw.markdown);
        }
        json(res, 200, {
          ...legacyDocFields(tabState),
          ok: true,
        });
        return;
      }

      if (req.method === "POST" && path === "/api/tabs/switch") {
        const raw = JSON.parse(await readBody(req)) as {
          id?: string;
          /** Optional: sync active editor text before switching */
          markdown?: string;
        };
        const id = raw.id?.trim();
        if (!id) {
          json(res, 400, { error: "Missing tab id" });
          return;
        }
        // Always stash editor text on the current active tab first (by server active),
        // then switch — even if the client sent a stale id for the target.
        if (typeof raw.markdown === "string" && activeTab(tabState)) {
          tabState = setActiveText(tabState, raw.markdown);
        }
        const next = switchTab(tabState, id, msg);
        if ("error" in next) {
          json(res, 404, { error: next.error });
          return;
        }
        tabState = next;
        json(res, 200, {
          ...legacyDocFields(tabState),
          ...noteSnapshot(),
          ok: true,
          path: activeTab(tabState)?.path ?? null,
        });
        return;
      }

      if (req.method === "POST" && path === "/api/tabs/close") {
        const raw = JSON.parse(await readBody(req)) as { id?: string };
        const id = raw.id?.trim();
        if (!id) {
          json(res, 400, { error: "Missing tab id" });
          return;
        }
        const next = closeTab(tabState, id, msg);
        if ("error" in next) {
          json(res, 404, { error: next.error });
          return;
        }
        tabState = next;
        lastPdfPath = null;
        json(res, 200, {
          ok: true,
          ...snapshotState(),
        });
        return;
      }

      if (req.method === "GET" && path === "/api/doc-note") {
        const u = new URL(req.url || "/", "http://127.0.0.1");
        const target =
          u.searchParams.get("path")?.trim() || activePath() || "";
        if (!target) {
          json(res, 200, { ok: true, path: null, text: "", docNote: "" });
          return;
        }
        const note = readDocNote(target);
        json(res, 200, {
          ok: true,
          path: note.path,
          text: note.text,
          docNote: note.text,
          docNotePath: note.path,
        });
        return;
      }

      /** Scratch note for a document path (sidecar beside file; never touches the source). */
      if (req.method === "POST" && path === "/api/doc-note") {
        const raw = JSON.parse(await readBody(req)) as {
          path?: string;
          text?: string;
        };
        const target = raw.path?.trim() || activePath() || "";
        if (!target) {
          json(res, 400, { error: "メモを紐づけるファイルがありません" });
          return;
        }
        if (typeof raw.text !== "string") {
          json(res, 400, { error: "Missing text" });
          return;
        }
        try {
          const saved = writeDocNote(target, raw.text);
          json(res, 200, {
            ok: true,
            path: saved.path,
            text: saved.text,
            docNote: saved.text,
            docNotePath: saved.path,
          });
        } catch (err) {
          json(res, 400, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
        return;
      }

      if (req.method === "POST" && path === "/api/recent/remove") {
        const raw = JSON.parse(await readBody(req)) as { path?: string };
        const target = raw.path?.trim();
        if (!target) {
          json(res, 400, { error: "Missing path" });
          return;
        }
        json(res, 200, { ok: true, recent: removeRecent(target) });
        return;
      }

      if (req.method === "POST" && path === "/api/recent/pin") {
        const raw = JSON.parse(await readBody(req)) as {
          path?: string;
          pinned?: boolean;
        };
        const target = raw.path?.trim();
        if (!target) {
          json(res, 400, { error: "Missing path" });
          return;
        }
        json(res, 200, {
          ok: true,
          recent: setRecentPinned(target, raw.pinned !== false),
        });
        return;
      }

      if (req.method === "POST" && path === "/api/open-md") {
        const raw = JSON.parse(await readBody(req)) as {
          path?: string;
          /** Optional: sync current editor before opening another tab */
          markdown?: string;
        };
        let requested = raw.path?.trim() || "";
        if (!requested) {
          json(res, 400, { error: "Missing path" });
          return;
        }
        // Preserve in-progress edits on the active tab when opening another file.
        if (typeof raw.markdown === "string" && activeTab(tabState)) {
          tabState = setActiveText(tabState, raw.markdown);
        }
        requested = normalizeOpenDocPath(requested);
        // Absolute / UNC (\\wsl.localhost\…) keep their own root; else cwd-relative.
        const next = isAbsolute(requested)
          ? resolve(requested)
          : resolve(process.cwd(), requested);
        // Legacy open-md: replace active when full so existing UI/tests keep working.
        const result = openDocPath(next, { replaceWhenFull: true, msg });
        if (!result.ok) {
          json(res, result.status, {
            error: result.error,
            recent: listRecent(),
            ...legacyDocFields(tabState),
          });
          return;
        }
        const kindLabel =
          result.kind === "md" ? "Markdown" : String(result.kind).toUpperCase();
        console.log(`${kindLabel} opened: ${next}`);
        json(res, 200, {
          ...legacyDocFields(tabState),
          ok: true,
          path: next,
          recent: listRecent(),
        });
        return;
      }

      /**
       * Map a browser DnD File back to an on-disk path (original location).
       * Uses path hint, recent list, sibling dirs, and Windows Recent shortcuts.
       */
      if (req.method === "POST" && path === "/api/resolve-drop") {
        const raw = JSON.parse(await readBody(req)) as {
          name?: string;
          size?: number;
          lastModified?: number;
          pathHint?: string;
          searchDirs?: string[];
        };
        const mdAbs = activePath();
        const searchDirs = [
          ...(Array.isArray(raw.searchDirs) ? raw.searchDirs : []),
          mdAbs ? dirname(mdAbs) : "",
          process.cwd(),
          PKG_ROOT,
        ].filter(Boolean);
        const result = resolveDroppedMarkdownPath({
          name: raw.name,
          size: raw.size,
          lastModified: raw.lastModified,
          pathHint: raw.pathHint,
          searchDirs,
        });
        json(res, 200, { ok: true, ...result });
        return;
      }

      /**
       * Fallback when the original path cannot be resolved — copy content
       * under dir (default: sibling of active MD, else cwd) and open it.
       */
      if (req.method === "POST" && path === "/api/import-md") {
        const raw = JSON.parse(await readBody(req)) as {
          filename?: string;
          markdown?: string;
          dir?: string;
          force?: boolean;
        };
        if (typeof raw.markdown !== "string") {
          json(res, 400, { error: "Missing markdown string" });
          return;
        }
        assertMarkdownSize(raw.markdown);
        let name = basename((raw.filename || "dropped.md").trim() || "dropped.md");
        if (/[/\\]/.test(name) || name === "." || name === "..") {
          json(res, 400, { error: "Invalid filename" });
          return;
        }
        if (!/\.(md|markdown)$/i.test(name)) {
          name = name + ".md";
        }
        const mdAbsImport = activePath();
        const dirReq = raw.dir?.trim() || "";
        const dirAbs = dirReq
          ? isAbsolute(dirReq)
            ? resolve(dirReq)
            : resolve(process.cwd(), dirReq)
          : mdAbsImport
            ? dirname(mdAbsImport)
            : resolve(process.cwd());
        if (!existsSync(dirAbs) || !statSync(dirAbs).isDirectory()) {
          json(res, 400, { error: `Directory not found: ${dirAbs}` });
          return;
        }
        const out = join(dirAbs, name);
        if (existsSync(out) && !raw.force) {
          json(res, 409, {
            error: `File already exists: ${out}`,
            path: out,
            exists: true,
          });
          return;
        }
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, raw.markdown, "utf8");
        const opened = openInTabs(tabState, out, raw.markdown, {
          replaceWhenFull: false,
          msg,
        });
        if (!opened.ok) {
          json(res, opened.code === "full" ? 409 : 400, {
            error: opened.error,
            ...legacyDocFields(tabState),
            recent: listRecent(),
          });
          return;
        }
        tabState = opened.state;
        rememberRecent(out);
        console.log(`Markdown imported: ${out}`);
        json(res, 200, {
          ...legacyDocFields(tabState),
          ok: true,
          path: out,
          recent: listRecent(),
        });
        return;
      }

      if (req.method === "POST" && path === "/api/open-md-link") {
        const raw = JSON.parse(await readBody(req)) as {
          href?: string;
          baseMd?: string;
          markdown?: string;
        };
        const href = raw.href?.trim() || "";
        if (!href) {
          json(res, 400, { error: "Missing href" });
          return;
        }
        if (typeof raw.markdown === "string" && activeTab(tabState)) {
          tabState = setActiveText(tabState, raw.markdown);
        }
        const base = raw.baseMd?.trim() || activePath();
        const resolved = resolveMarkdownOpenLink(href, base);
        if (!resolved.ok) {
          if (resolved.reason === "skip") {
            json(res, 200, { ok: false, skip: true, detail: resolved.detail });
            return;
          }
          json(res, 404, { error: resolved.error, recent: listRecent() });
          return;
        }
        const result = openDocPath(resolved.path, { replaceWhenFull: false, msg });
        if (!result.ok) {
          json(res, result.status, {
            error: result.error,
            recent: listRecent(),
            ...legacyDocFields(tabState),
          });
          return;
        }
        console.log(`Markdown opened via link: ${resolved.path}`);
        json(res, 200, {
          ...legacyDocFields(tabState),
          ok: true,
          path: resolved.path,
          recent: listRecent(),
        });
        return;
      }

      if (req.method === "POST" && path === "/api/new-md") {
        const raw = JSON.parse(await readBody(req)) as {
          path?: string;
          /** Overwrite an existing file (default false) */
          force?: boolean;
          markdown?: string;
        };
        let requested = raw.path?.trim() || "";
        if (!requested) {
          json(res, 400, { error: "Missing path" });
          return;
        }
        if (!/\.md$/i.test(requested) && !/\.markdown$/i.test(requested)) {
          requested = requested + ".md";
        }
        const next = isAbsolute(requested)
          ? resolve(requested)
          : resolve(process.cwd(), requested);
        if (existsSync(next) && !raw.force) {
          json(res, 409, {
            error: `File already exists: ${next}`,
            path: next,
            exists: true,
          });
          return;
        }
        const markdown =
          typeof raw.markdown === "string"
            ? raw.markdown
            : "# Untitled\n\n";
        mkdirSync(dirname(next), { recursive: true });
        writeFileSync(next, markdown, "utf8");
        const opened = openInTabs(tabState, next, markdown, {
          replaceWhenFull: false,
          msg,
        });
        if (!opened.ok) {
          json(res, opened.code === "full" ? 409 : 400, {
            error: opened.error,
            ...legacyDocFields(tabState),
            recent: listRecent(),
          });
          return;
        }
        tabState = opened.state;
        rememberRecent(next);
        console.log(`Markdown created: ${next}`);
        json(res, 200, {
          ...legacyDocFields(tabState),
          ok: true,
          path: next,
          recent: listRecent(),
        });
        return;
      }

      if (req.method === "POST" && path === "/api/export-pdf") {
        const mdAbs = activePath();
        {
          const kind = detectDocKind(mdAbs);
          if (isDataDocKind(kind)) {
            json(res, 400, {
              error: msg.pdfViewOnly(kind.toUpperCase()),
            });
            return;
          }
        }
        const raw = JSON.parse(await readBody(req)) as {
          profile?: Record<string, unknown>;
          markdown?: string;
          outputPath?: string;
        };
        if (!raw.profile || typeof raw.profile !== "object") {
          json(res, 400, { error: "Missing profile object" });
          return;
        }
        const md =
          typeof raw.markdown === "string"
            ? raw.markdown
            : activeTab(tabState)?.text ??
              (mdAbs && existsSync(mdAbs) ? readFileSync(mdAbs, "utf8") : "");
        assertMarkdownSize(md);
        if (typeof raw.markdown === "string") {
          tabState = setActiveText(tabState, raw.markdown);
        }
        const body = bodyFromMarkdown(md);
        const profile = stripSource(
          profileFromPayload(baseProfile, raw.profile)
        );
        const { html } = renderHtml(body, profile, {
          assetRoot: activeAssetRoot(),
          assetMode: "data",
        });
        const pdf = await exportPdf({ html, profile });
        let requested = raw.outputPath?.trim() || "";
        if (!requested) {
          if (!mdAbs) {
            json(res, 400, {
              error:
                "PDF の保存先がありません。先に Markdown を開くか、保存先を指定してください。",
            });
            return;
          }
          requested = mdAbs.replace(/\.md$/i, "") + ".pdf";
        } else if (!/\.pdf$/i.test(requested)) {
          requested = requested + ".pdf";
        }
        const out = resolve(process.cwd(), requested);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, pdf);
        lastPdfPath = out;
        console.log(`PDF written: ${out}`);
        json(res, 200, {
          ok: true,
          path: out,
          viewUrl: "/api/pdf",
        });
        return;
      }

      if (req.method === "GET" && path === "/api/pdf") {
        if (!lastPdfPath || !existsSync(lastPdfPath)) {
          json(res, 404, { error: "No PDF exported yet" });
          return;
        }
        const buf = readFileSync(lastPdfPath);
        const name = basename(lastPdfPath);
        // HTTP headers must be ASCII; Japanese names use RFC 5987 filename*.
        const asciiFallback =
          name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") || "document.pdf";
        const disposition =
          `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
        res.writeHead(200, {
          "Content-Type": "application/pdf",
          "Content-Disposition": disposition,
          "Cache-Control": "no-store",
          "Content-Length": buf.byteLength,
        });
        res.end(buf);
        return;
      }

      if (req.method === "POST" && path === "/api/open") {
        const raw = JSON.parse(await readBody(req)) as { path?: string };
        const target = raw.path?.trim();
        if (!target) {
          json(res, 400, { error: "Missing path" });
          return;
        }
        const abs = resolve(process.cwd(), target);
        if (!existsSync(abs)) {
          json(res, 404, { error: msg.fileNotFound(abs) });
          return;
        }
        openExternal(abs);
        json(res, 200, { ok: true, path: abs });
        return;
      }

      json(res, 404, { error: "Not found" });
    } catch (err) {
      json(res, 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  {
    const watchPath = activePath();
    if (watchPath) {
      try {
        watch(watchPath, { persistent: true }, () => {
          /* disk changes: client can Reload from disk */
        });
      } catch {
        /* ignore */
      }
    }
  }

  await new Promise<void>((r, j) => {
    server.once("error", j);
    server.listen(opts.port, opts.host ?? "127.0.0.1", () => r());
  });

  const url = `http://${opts.host ?? "127.0.0.1"}:${opts.port}/`;
  const bundled = isBundledProfile(baseProfile.__sourcePath);
  console.log(`md-outlet ui: ${url}`);
  console.log(
    `Document: ${activePath() ?? "(empty — pick a recent file or Open)"}` +
      (tabState.tabs.length > 1 ? ` (${tabState.tabs.length} tabs)` : "")
  );
  console.log(
    `Save to:  ${saveAbs}${bundled ? " (bundled source — will not overwrite package)" : ""}`
  );
  console.log(`Template: ${profileRef}`);
  console.log("Close the browser tab to stop, or press Ctrl+C.");
  if (opts.open !== false) {
    openBrowser(url);
  }

  await new Promise<void>((resolveDone) => {
    server.on("close", () => resolveDone());
  });
}
