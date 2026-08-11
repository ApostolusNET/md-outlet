import { resolve } from "node:path";
import { loadProfile } from "../load-profile.js";
import { PKG_ROOT } from "../paths.js";
import { browseMarkdownDir } from "../browse-md.js";
import { removeRecent, setRecentPinned } from "../recent-files.js";
import { readDocNote, writeDocNote } from "../doc-notes.js";
import {
  profileFromPayload,
  saveProfileFile,
} from "../serialize-profile.js";
import { resolveUiSavePath } from "../ui-save-path.js";
import { json, readJsonBody } from "../ui-http.js";
import { isBundledProfile, stripSource } from "../ui-profile-util.js";
import { requirePlainObject, resolveUserPath } from "../ui-validate.js";
import {
  isOutsidePackage,
  outsidePackagePayload,
} from "../path-policy.js";
import type { UiContext } from "../ui-context.js";

/**
 * Session / profile / browse / notes / recent (not tabs or render pipeline).
 * @returns true if the request was handled.
 */
export async function tryHandleSessionRoutes(
  ctx: UiContext
): Promise<boolean> {
  const { req, res, url, path, method, msg, session } = ctx;

  if (method === "GET" && path === "/api/state") {
    session.refreshBaseProfile();
    json(res, 200, session.snapshotState());
    return true;
  }

  if (method === "POST" && path === "/api/use-template") {
    const raw = await readJsonBody<{ profile?: string }>(req);
    const name = raw.profile?.trim();
    if (!name) {
      json(res, 400, { error: "Missing profile name" });
      return true;
    }
    const baseProfile = loadProfile(name);
    session.setBaseProfile(baseProfile);
    session.setProfileRef(name);
    // Built-in → suggest ./<name>.yaml; file profiles keep their path.
    if (isBundledProfile(baseProfile.__sourcePath)) {
      session.setSaveAbs(resolveUiSavePath(name));
    } else if (baseProfile.__sourcePath) {
      session.setSaveAbs(baseProfile.__sourcePath);
    }
    json(res, 200, session.snapshotState());
    return true;
  }

  if (method === "POST" && path === "/api/save") {
    const raw = await readJsonBody<{
      profile?: Record<string, unknown>;
      savePath?: string;
      confirmOutside?: boolean;
    }>(req);
    if (!raw.profile || typeof raw.profile !== "object") {
      json(res, 400, { error: "Missing profile object" });
      return true;
    }
    const profileObj = requirePlainObject(raw.profile, "profile object");
    const saveAbs = session.getSaveAbs();
    const target = resolveUserPath(raw.savePath?.trim() || saveAbs);
    if (isBundledProfile(target)) {
      json(res, 400, {
        error:
          "Refusing to overwrite a bundled profile. Choose a path outside md-outlet/profiles/.",
      });
      return true;
    }
    if (isOutsidePackage(target) && raw.confirmOutside !== true) {
      json(res, 409, outsidePackagePayload(target));
      return true;
    }
    const profile = profileFromPayload(session.getBaseProfile(), profileObj);
    const written = saveProfileFile(stripSource(profile), target, {
      force: true,
    });
    if (resolve(written) === resolve(saveAbs) || raw.savePath) {
      try {
        session.setBaseProfile(loadProfile(written));
      } catch {
        /* keep previous base */
      }
    }
    json(res, 200, { ok: true, path: written });
    return true;
  }

  if (method === "GET" && path === "/api/browse-md") {
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
    return true;
  }

  if (method === "GET" && path === "/api/doc-note") {
    const u = new URL(req.url || "/", "http://127.0.0.1");
    const target = u.searchParams.get("path")?.trim() || session.activePath() || "";
    if (!target) {
      json(res, 200, { ok: true, path: null, text: "", docNote: "" });
      return true;
    }
    const note = readDocNote(target);
    json(res, 200, {
      ok: true,
      path: note.path,
      text: note.text,
      docNote: note.text,
      docNotePath: note.path,
    });
    return true;
  }

  /** Scratch note for a document path (sidecar beside file; never touches the source). */
  if (method === "POST" && path === "/api/doc-note") {
    const raw = await readJsonBody<{
      path?: string;
      text?: string;
    }>(req);
    const target = raw.path?.trim() || session.activePath() || "";
    if (!target) {
      json(res, 400, { error: msg.noteNoFile });
      return true;
    }
    if (typeof raw.text !== "string") {
      json(res, 400, { error: "Missing text" });
      return true;
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
      const code = err instanceof Error ? err.message : String(err);
      json(res, 400, {
        error: code === "NO_DOC_PATH" ? msg.noteNoFile : code,
      });
    }
    return true;
  }

  if (method === "POST" && path === "/api/recent/remove") {
    const raw = await readJsonBody<{ path?: string }>(req);
    const target = raw.path?.trim();
    if (!target) {
      json(res, 400, { error: "Missing path" });
      return true;
    }
    json(res, 200, { ok: true, recent: removeRecent(target) });
    return true;
  }

  if (method === "POST" && path === "/api/recent/pin") {
    const raw = await readJsonBody<{
      path?: string;
      pinned?: boolean;
    }>(req);
    const target = raw.path?.trim();
    if (!target) {
      json(res, 400, { error: "Missing path" });
      return true;
    }
    json(res, 200, {
      ok: true,
      recent: setRecentPinned(target, raw.pinned !== false),
    });
    return true;
  }

  return false;
}
