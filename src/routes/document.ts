import {
  existsSync,
  mkdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { assertMarkdownSize } from "../assets.js";
import {
  detectDocKind,
  isDataDocKind,
  isDataDocPath,
} from "../file-kind.js";
import { PKG_ROOT } from "../paths.js";
import { listRecent, rememberRecent } from "../recent-files.js";
import { resolveDroppedMarkdownPath } from "../resolve-drop.js";
import { resolveMarkdownOpenLink } from "../resolve-md-link.js";
import {
  activeTab,
  legacyDocFields,
  openInTabs,
  setActiveText,
  updateActiveTab,
} from "../ui-tabs.js";
import { json, readJsonBody } from "../ui-http.js";
import {
  ensureExtension,
  resolveUserPath,
  safeBasename,
} from "../ui-validate.js";
import {
  needsOutsideWriteConfirm,
  outsidePackagePayload,
  trustDirsForActiveDoc,
} from "../path-policy.js";
import type { UiContext } from "../ui-context.js";

/**
 * Document save / import / link-open / new-file / drop-resolve.
 * @returns true if the request was handled.
 */
export async function tryHandleDocumentRoutes(
  ctx: UiContext
): Promise<boolean> {
  const { req, res, path, method, lang, msg, session } = ctx;

  if (method === "POST" && path === "/api/save-md") {
    const raw = await readJsonBody<{
      markdown?: string;
      /** Optional: write here and switch the active Markdown path */
      path?: string;
      /** User confirmed writing outside the package root */
      confirmOutside?: boolean;
    }>(req);
    if (typeof raw.markdown !== "string") {
      json(res, 400, { error: "Missing markdown string" });
      return true;
    }
    const mdAbs = session.activePath();
    {
      const kind = detectDocKind(mdAbs);
      if (isDataDocKind(kind)) {
        json(res, 400, {
          error: msg.saveViewOnly(kind.toUpperCase()),
        });
        return true;
      }
    }
    let requested = raw.path?.trim() || "";
    if (!requested) {
      if (!mdAbs) {
        json(res, 400, {
          error: msg.noSaveTarget,
        });
        return true;
      }
      writeFileSync(mdAbs, raw.markdown, "utf8");
      session.setTabState(setActiveText(session.getTabState(), raw.markdown));
      rememberRecent(mdAbs);
      json(res, 200, {
        ...legacyDocFields(session.getTabState()),
        ok: true,
        path: mdAbs,
        switched: false,
        recent: listRecent(),
      });
      return true;
    }
    if (isDataDocPath(requested)) {
      json(res, 400, {
        error: msg.saveViewOnly("XML / JSON / YAML / TXT / LOG / CSV"),
      });
      return true;
    }
    requested = ensureExtension(requested, ".md");
    const out = resolveUserPath(requested);
    if (
      needsOutsideWriteConfirm(out, trustDirsForActiveDoc(mdAbs)) &&
      raw.confirmOutside !== true
    ) {
      json(res, 409, outsidePackagePayload(out));
      return true;
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, raw.markdown, "utf8");
    const switched = out !== mdAbs;
    session.setTabState(
      updateActiveTab(session.getTabState(), {
        path: out,
        text: raw.markdown,
      })
    );
    rememberRecent(out);
    console.log(
      `Markdown saved: ${out}${switched ? " (active file switched)" : ""}`
    );
    json(res, 200, {
      ...legacyDocFields(session.getTabState()),
      ok: true,
      path: out,
      switched,
      recent: listRecent(),
    });
    return true;
  }

  /**
   * Map a browser DnD File back to an on-disk path (original location).
   * Uses path hint, recent list, sibling dirs, and Windows Recent shortcuts.
   */
  if (method === "POST" && path === "/api/resolve-drop") {
    const raw = await readJsonBody<{
      name?: string;
      size?: number;
      lastModified?: number;
      pathHint?: string;
      searchDirs?: string[];
    }>(req);
    const mdAbs = session.activePath();
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
    return true;
  }

  /**
   * Fallback when the original path cannot be resolved — copy content
   * under dir (default: sibling of active MD, else cwd) and open it.
   */
  if (method === "POST" && path === "/api/import-md") {
    const raw = await readJsonBody<{
      filename?: string;
      markdown?: string;
      dir?: string;
      force?: boolean;
      confirmOutside?: boolean;
    }>(req);
    if (typeof raw.markdown !== "string") {
      json(res, 400, { error: "Missing markdown string" });
      return true;
    }
    assertMarkdownSize(raw.markdown);
    const nameRaw = safeBasename(raw.filename || "dropped.md");
    if (!nameRaw) {
      json(res, 400, { error: "Invalid filename" });
      return true;
    }
    let name = nameRaw;
    if (!/\.(md|markdown)$/i.test(name)) {
      name = name + ".md";
    }
    const mdAbsImport = session.activePath();
    const dirReq = raw.dir?.trim() || "";
    const dirAbs = dirReq
      ? resolveUserPath(dirReq)
      : mdAbsImport
        ? dirname(mdAbsImport)
        : resolve(process.cwd());
    if (!existsSync(dirAbs) || !statSync(dirAbs).isDirectory()) {
      json(res, 400, { error: `Directory not found: ${dirAbs}` });
      return true;
    }
    const out = join(dirAbs, name);
    if (
      needsOutsideWriteConfirm(out, trustDirsForActiveDoc(mdAbsImport)) &&
      raw.confirmOutside !== true
    ) {
      json(res, 409, outsidePackagePayload(out));
      return true;
    }
    if (existsSync(out) && !raw.force) {
      json(res, 409, {
        error: `File already exists: ${out}`,
        path: out,
        exists: true,
        code: "EXISTS",
      });
      return true;
    }
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, raw.markdown, "utf8");
    const tabState = session.getTabState();
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
      return true;
    }
    session.setTabState(opened.state);
    rememberRecent(out);
    console.log(`Markdown imported: ${out}`);
    json(res, 200, {
      ...legacyDocFields(session.getTabState()),
      ok: true,
      path: out,
      recent: listRecent(),
    });
    return true;
  }

  if (method === "POST" && path === "/api/open-md-link") {
    const raw = await readJsonBody<{
      href?: string;
      baseMd?: string;
      markdown?: string;
    }>(req);
    const href = raw.href?.trim() || "";
    if (!href) {
      json(res, 400, { error: "Missing href" });
      return true;
    }
    let tabState = session.getTabState();
    if (typeof raw.markdown === "string" && activeTab(tabState)) {
      tabState = setActiveText(tabState, raw.markdown);
      session.setTabState(tabState);
    }
    const base = raw.baseMd?.trim() || session.activePath();
    const resolved = resolveMarkdownOpenLink(href, base, lang);
    if (!resolved.ok) {
      if (resolved.reason === "skip") {
        json(res, 200, { ok: false, skip: true, detail: resolved.detail });
        return true;
      }
      json(res, 404, { error: resolved.error, recent: listRecent() });
      return true;
    }
    const result = session.openDocPath(resolved.path, {
      replaceWhenFull: false,
      msg,
    });
    if (!result.ok) {
      json(res, result.status, {
        error: result.error,
        recent: listRecent(),
        ...legacyDocFields(session.getTabState()),
      });
      return true;
    }
    console.log(`Markdown opened via link: ${resolved.path}`);
    json(res, 200, {
      ...legacyDocFields(session.getTabState()),
      ok: true,
      path: resolved.path,
      recent: listRecent(),
    });
    return true;
  }

  if (method === "POST" && path === "/api/new-md") {
    const raw = await readJsonBody<{
      path?: string;
      /** Overwrite an existing file (default false) */
      force?: boolean;
      markdown?: string;
      confirmOutside?: boolean;
    }>(req);
    let requested = raw.path?.trim() || "";
    if (!requested) {
      json(res, 400, { error: "Missing path" });
      return true;
    }
    if (!/\.md$/i.test(requested) && !/\.markdown$/i.test(requested)) {
      requested = requested + ".md";
    }
    const next = resolveUserPath(requested);
    if (
      needsOutsideWriteConfirm(
        next,
        trustDirsForActiveDoc(session.activePath())
      ) &&
      raw.confirmOutside !== true
    ) {
      json(res, 409, outsidePackagePayload(next));
      return true;
    }
    if (existsSync(next) && !raw.force) {
      json(res, 409, {
        error: `File already exists: ${next}`,
        path: next,
        exists: true,
        code: "EXISTS",
      });
      return true;
    }
    const markdown =
      typeof raw.markdown === "string" ? raw.markdown : "# Untitled\n\n";
    mkdirSync(dirname(next), { recursive: true });
    writeFileSync(next, markdown, "utf8");
    const tabState = session.getTabState();
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
      return true;
    }
    session.setTabState(opened.state);
    rememberRecent(next);
    console.log(`Markdown created: ${next}`);
    json(res, 200, {
      ...legacyDocFields(session.getTabState()),
      ok: true,
      path: next,
      recent: listRecent(),
    });
    return true;
  }

  return false;
}
