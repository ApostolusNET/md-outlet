import { createServer, type IncomingMessage } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { loadProfile } from "./load-profile.js";
import { resolveDocument } from "./resolve-document.js";
import { listBuiltInProfiles } from "./init-profile.js";
import { listBuiltInThemes } from "./list-themes.js";
import { openBrowser } from "./open-browser.js";
import { profileToObject } from "./serialize-profile.js";
import { PKG_ROOT } from "./paths.js";
import { listLibraryDocs } from "./library-docs.js";
import {
  DEFAULT_LANG,
  normalizeLang,
  type Lang,
} from "./i18n.js";
import { assetRootFromMarkdownPath } from "./assets.js";
import { browseRootFrom, listBrowseRoots } from "./browse-md.js";
import {
  listRecent,
  rememberRecent,
  removeRecent,
} from "./recent-files.js";
import { detectDocKind } from "./file-kind.js";
import {
  activeTab,
  emptyTabState,
  legacyDocFields,
  openInTabs,
  type UiTabState,
} from "./ui-tabs.js";
import { createUiMsg, type UiMsgBag } from "./ui-messages.js";
import { readDocNote } from "./doc-notes.js";
import { json } from "./ui-http.js";
import {
  beginUiRequest,
  type UiFlash,
  type UiSession,
  type UiSessionLang,
} from "./ui-context.js";
import { tryServeUiStatic } from "./ui-static.js";
import { dispatchApiRoutes } from "./routes/dispatch.js";
import { isBundledProfile } from "./ui-profile-util.js";
import {
  authorizeApiRequest,
  createApiToken,
  persistApiToken,
  clearPersistedApiToken,
} from "./ui-auth.js";
import { HttpError } from "./ui-validate.js";

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

  const host = opts.host ?? "127.0.0.1";
  const port = opts.port;
  const apiToken = createApiToken();
  persistApiToken(port, apiToken);

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
  let uiFlash: UiFlash | null = null;

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

  const snapshotState = (): Record<string, unknown> => {
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

  const session: UiSession & UiSessionLang = {
    getTabState: () => tabState,
    setTabState: (next) => {
      tabState = next;
    },
    activePath,
    openDocPath,
    snapshotState,
    noteSnapshot,
    setUiFlash,
    getUiFlash: () => uiFlash,
    clearLastPdf: () => {
      lastPdfPath = null;
    },
    getBaseProfile: () => baseProfile,
    setBaseProfile: (p) => {
      baseProfile = p;
    },
    getProfileRef: () => profileRef,
    setProfileRef: (ref) => {
      profileRef = ref;
    },
    getSaveAbs: () => saveAbs,
    setSaveAbs: (p) => {
      saveAbs = p;
    },
    getLastPdfPath: () => lastPdfPath,
    setLastPdfPath: (p) => {
      lastPdfPath = p;
    },
    bodyFromMarkdown,
    activeAssetRoot,
    host,
    port,
    refreshBaseProfile: () => {
      baseProfile = loadProfile(profileRef);
    },
    adoptLangFromReq,
    msgFor,
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
      clearPersistedApiToken(port);
      try {
        server.close(() => process.exit(0));
      } catch {
        /* ignore */
      }
      setTimeout(() => process.exit(0), 800);
    }, delayMs);
  };

  const stopFromSignal = (): void => {
    cancelScheduledShutdown();
    clearPersistedApiToken(port);
    try {
      server.close(() => process.exit(0));
    } catch {
      /* ignore */
    }
    setTimeout(() => process.exit(0), 800);
  };
  process.once("SIGINT", stopFromSignal);
  process.once("SIGTERM", stopFromSignal);

  const server = createServer(async (req, res) => {
    try {
      const ctx = beginUiRequest(req, res, host, session);
      const { path } = ctx;

      // Tab refresh reconnects quickly — cancel a pending auto-exit.
      if (path !== "/api/shutdown") {
        cancelScheduledShutdown();
      }

      if (tryServeUiStatic(req, res, path, { apiToken })) {
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
        // sendBeacon cannot set X-MD-Outlet-Token; loopback-only server.
        json(res, 200, { ok: true, shuttingDown: true });
        scheduleShutdown(1500);
        return;
      }

      if (path.startsWith("/api/")) {
        // <img src="/api/asset"> and window open of /api/pdf cannot send
        // X-MD-Outlet-Token; both are path-sandboxed / session-scoped reads.
        const publicGet =
          (req.method === "GET" || req.method === "HEAD") &&
          (path === "/api/asset" || path === "/api/pdf");
        if (
          !publicGet &&
          !authorizeApiRequest(req, res, { token: apiToken, port })
        ) {
          return;
        }
      }

      if (await dispatchApiRoutes(ctx)) {
        return;
      }

      json(res, 404, { error: "Not found" });
    } catch (err) {
      const status =
        err instanceof HttpError
          ? err.statusCode
          : err &&
              typeof err === "object" &&
              "statusCode" in err &&
              typeof (err as { statusCode: unknown }).statusCode === "number"
            ? (err as { statusCode: number }).statusCode
            : 500;
      json(res, status >= 400 && status < 600 ? status : 500, {
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  await new Promise<void>((r, j) => {
    server.once("error", j);
    server.listen(port, host, () => r());
  });

  const url = `http://${host}:${port}/`;
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
