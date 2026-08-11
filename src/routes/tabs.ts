import { basename } from "node:path";
import { t } from "../i18n.js";
import { listRecent } from "../recent-files.js";
import { normalizeOpenDocPath } from "../file-kind.js";
import {
  activeTab,
  closeActiveTab,
  closeTab,
  legacyDocFields,
  setActiveText,
  switchTab,
} from "../ui-tabs.js";
import { json, readJsonBody } from "../ui-http.js";
import { resolveUserPath } from "../ui-validate.js";
import type { UiContext } from "../ui-context.js";

/**
 * Tab / open-document routes (strict tabs + legacy open-md + close-md).
 * @returns true if the request was handled.
 */
export async function tryHandleTabRoutes(ctx: UiContext): Promise<boolean> {
  const { req, res, path, method, lang, msg, session } = ctx;

  if (method === "POST" && path === "/api/close-md") {
    // Close the active tab only (phase 1 multi-tab). Empty when none left.
    session.setTabState(closeActiveTab(session.getTabState()));
    session.clearLastPdf();
    console.log(
      session.getTabState().activeId
        ? `Tab closed — active: ${session.activePath()}`
        : "All tabs closed (back to empty / recent)"
    );
    json(res, 200, {
      ok: true,
      ...session.snapshotState(),
    });
    return true;
  }

  /** Strict open: add/activate tab; 409 when already at max 3 (unless replaceWhenFull). */
  if (method === "POST" && path === "/api/tabs/open") {
    const raw = await readJsonBody<{
      path?: string;
      /** Preserve in-progress editor text on the current active tab. */
      markdown?: string;
      /**
       * When true, replace the active tab if already at max (legacy /api/open-md).
       * Default false: 409 so SendTo / UI Open ask the user to close a tab first.
       */
      replaceWhenFull?: boolean;
    }>(req);
    let requested = raw.path?.trim() || "";
    if (!requested) {
      json(res, 400, { error: "Missing path" });
      return true;
    }
    let tabState = session.getTabState();
    // Sync active tab text before opening another (no client tab-id required).
    if (typeof raw.markdown === "string" && activeTab(tabState)) {
      tabState = setActiveText(tabState, raw.markdown);
      session.setTabState(tabState);
    }
    requested = normalizeOpenDocPath(requested);
    const next = resolveUserPath(requested);
    const result = session.openDocPath(next, {
      replaceWhenFull: raw.replaceWhenFull === true,
      msg,
    });
    if (!result.ok) {
      console.log(`Tab open failed (${result.status}): ${result.error}`);
      if (result.status === 409) {
        session.setUiFlash("err", result.error);
      }
      json(res, result.status, {
        error: result.error,
        recent: listRecent(),
        ...legacyDocFields(session.getTabState()),
        uiFlash: session.getUiFlash(),
      });
      return true;
    }
    const kindLabel =
      result.kind === "md" ? "Markdown" : String(result.kind).toUpperCase();
    console.log(`${kindLabel} opened (tab): ${next}`);
    session.setUiFlash(
      "ok",
      t(lang, "toast.opened", { path: basename(next) })
    );
    json(res, 200, {
      ...legacyDocFields(session.getTabState()),
      ...session.noteSnapshot(),
      ok: true,
      path: next,
      recent: listRecent(),
      uiFlash: session.getUiFlash(),
    });
    return true;
  }

  /** Sync editor text onto the server active tab (no tab id needed). */
  if (method === "POST" && path === "/api/tabs/sync") {
    const raw = await readJsonBody<{ markdown?: string }>(req);
    if (typeof raw.markdown !== "string") {
      json(res, 400, { error: "Missing markdown" });
      return true;
    }
    let tabState = session.getTabState();
    if (activeTab(tabState)) {
      tabState = setActiveText(tabState, raw.markdown);
      session.setTabState(tabState);
    }
    json(res, 200, {
      ...legacyDocFields(session.getTabState()),
      ok: true,
    });
    return true;
  }

  if (method === "POST" && path === "/api/tabs/switch") {
    const raw = await readJsonBody<{
      id?: string;
      /** Optional: sync active editor text before switching */
      markdown?: string;
    }>(req);
    const id = raw.id?.trim();
    if (!id) {
      json(res, 400, { error: "Missing tab id" });
      return true;
    }
    let tabState = session.getTabState();
    // Always stash editor text on the current active tab first (by server active),
    // then switch — even if the client sent a stale id for the target.
    if (typeof raw.markdown === "string" && activeTab(tabState)) {
      tabState = setActiveText(tabState, raw.markdown);
      session.setTabState(tabState);
    }
    const next = switchTab(session.getTabState(), id, msg);
    if ("error" in next) {
      json(res, 404, { error: next.error });
      return true;
    }
    session.setTabState(next);
    json(res, 200, {
      ...legacyDocFields(session.getTabState()),
      ...session.noteSnapshot(),
      ok: true,
      path: activeTab(session.getTabState())?.path ?? null,
    });
    return true;
  }

  if (method === "POST" && path === "/api/tabs/close") {
    const raw = await readJsonBody<{ id?: string }>(req);
    const id = raw.id?.trim();
    if (!id) {
      json(res, 400, { error: "Missing tab id" });
      return true;
    }
    const next = closeTab(session.getTabState(), id, msg);
    if ("error" in next) {
      json(res, 404, { error: next.error });
      return true;
    }
    session.setTabState(next);
    session.clearLastPdf();
    json(res, 200, {
      ok: true,
      ...session.snapshotState(),
    });
    return true;
  }

  if (method === "POST" && path === "/api/open-md") {
    const raw = await readJsonBody<{
      path?: string;
      /** Optional: sync current editor before opening another tab */
      markdown?: string;
    }>(req);
    let requested = raw.path?.trim() || "";
    if (!requested) {
      json(res, 400, { error: "Missing path" });
      return true;
    }
    let tabState = session.getTabState();
    // Preserve in-progress edits on the active tab when opening another file.
    if (typeof raw.markdown === "string" && activeTab(tabState)) {
      tabState = setActiveText(tabState, raw.markdown);
      session.setTabState(tabState);
    }
    requested = normalizeOpenDocPath(requested);
    // Absolute / UNC (\\wsl.localhost\…) keep their own root; else cwd-relative.
    const next = resolveUserPath(requested);
    // Legacy alias: same open path as /api/tabs/open, but replaceWhenFull=true
    // (swap active tab when at cap). Prefer /api/tabs/open for new clients (409 when full).
    // Kept for tests and older callers that expect replace-on-full.
    const result = session.openDocPath(next, { replaceWhenFull: true, msg });
    if (!result.ok) {
      json(res, result.status, {
        error: result.error,
        recent: listRecent(),
        ...legacyDocFields(session.getTabState()),
      });
      return true;
    }
    const kindLabel =
      result.kind === "md" ? "Markdown" : String(result.kind).toUpperCase();
    console.log(`${kindLabel} opened: ${next}`);
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
