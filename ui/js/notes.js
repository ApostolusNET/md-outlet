/**
 * Per-document scratch notes (sidecar `*.md-outlet-note.json`).
 */
import { $ } from "./dom.js";
import { apiFetch, t } from "./i18n.js";

let getState = () => null;
let setStatus = () => {};

/** Wire shared app accessors (call once from app.js). */
export function bindNotes(api) {
  getState = api.getState;
  setStatus = api.setStatus;
}

let docNoteTimer = null;
let docNoteDirty = false;
let docNoteLoadedPath = "";
/** Last save/load error (shown in hint title / status). */
let docNoteSaveError = "";

function notePathKey(p) {
  return String(p || "")
    .replace(/\//g, "\\")
    .toLowerCase();
}

function formatDocNoteError(raw, fallback) {
  const msg = String(raw || "").trim();
  if (!msg || /^not found$/i.test(msg)) {
    return (
      fallback ||
      t("note.apiMissing")
    );
  }
  return msg;
}

export function updateNotePanelHint() {
  const hint = $("notePanelHint");
  if (!hint) return;
  if (!$("docNote") || $("docNote").disabled) {
    hint.textContent = t("note.needFile");
    hint.removeAttribute("title");
    return;
  }
  if (docNoteSaveError) {
    hint.textContent = t("note.saveFailHint");
    hint.title = docNoteSaveError;
    return;
  }
  const text = $("docNote").value.trim();
  if (docNoteDirty) {
    hint.textContent = t("note.saving");
    hint.removeAttribute("title");
    return;
  }
  hint.textContent = text ? t("note.hasText") : t("aside.noteHint");
  hint.removeAttribute("title");
}

export function applyDocNoteFromPayload(data) {
  const ta = $("docNote");
  if (!ta) return;
  const state = getState();
  const path =
    (data && (data.mdPath || data.path || data.docNotePath)) ||
    state?.mdPath ||
    "";
  if (!path) {
    ta.value = "";
    ta.disabled = true;
    docNoteDirty = false;
    docNoteLoadedPath = "";
    docNoteSaveError = "";
    updateNotePanelHint();
    return;
  }
  ta.disabled = false;
  if (
    docNoteDirty &&
    notePathKey(docNoteLoadedPath) === notePathKey(path)
  ) {
    updateNotePanelHint();
    return;
  }
  if (typeof data.docNote === "string") {
    ta.value = data.docNote;
    docNoteLoadedPath = path;
    docNoteDirty = false;
    docNoteSaveError = "";
    if (state) {
      state.docNote = data.docNote;
      state.docNotePath = path;
    }
    updateNotePanelHint();
    return;
  }
  loadDocNoteForPath(path);
}

async function loadDocNoteForPath(path) {
  const ta = $("docNote");
  if (!path) {
    applyDocNoteFromPayload({ mdPath: "", docNote: "" });
    return;
  }
  try {
    const res = await apiFetch(
      "/api/doc-note?path=" + encodeURIComponent(path),
      { cache: "no-store" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(
        formatDocNoteError(
          data.error,
          t("note.loadFail")
        )
      );
    }
    const state = getState();
    if (notePathKey(state?.mdPath) !== notePathKey(path)) return;
    ta.disabled = false;
    ta.value = typeof data.text === "string" ? data.text : "";
    docNoteLoadedPath = path;
    docNoteDirty = false;
    docNoteSaveError = "";
    if (state) {
      state.docNote = ta.value;
      state.docNotePath = path;
    }
    updateNotePanelHint();
  } catch (e) {
    docNoteSaveError = formatDocNoteError(
      e instanceof Error ? e.message : String(e)
    );
    updateNotePanelHint();
    setStatus(docNoteSaveError, "err");
  }
}

export function scheduleSaveDocNote() {
  if (!$("docNote") || $("docNote").disabled || !getState()?.mdPath) return;
  docNoteDirty = true;
  docNoteSaveError = "";
  updateNotePanelHint();
  if (docNoteTimer) clearTimeout(docNoteTimer);
  docNoteTimer = setTimeout(() => {
    docNoteTimer = null;
    saveDocNoteNow().catch((e) => {
      docNoteSaveError = formatDocNoteError(
        e instanceof Error ? e.message : String(e)
      );
      updateNotePanelHint();
      setStatus(docNoteSaveError, "err");
    });
  }, 450);
}

async function saveDocNoteNow(forcePath) {
  const state = getState();
  const path = forcePath || state?.mdPath;
  const ta = $("docNote");
  if (!path || !ta) return;
  const text = ta.value;
  const res = await apiFetch("/api/doc-note", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, text }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    docNoteSaveError = formatDocNoteError(
      data.error,
      t("note.saveFail")
    );
    updateNotePanelHint();
    setStatus(docNoteSaveError, "err");
    return;
  }
  if (
    forcePath ||
    notePathKey(state?.mdPath) === notePathKey(path)
  ) {
    docNoteDirty = false;
    docNoteSaveError = "";
    docNoteLoadedPath = path;
    if (state && notePathKey(state.mdPath) === notePathKey(path)) {
      state.docNote = text;
      state.docNotePath = path;
    }
    updateNotePanelHint();
  }
}

export async function flushDocNoteIfNeeded() {
  if (docNoteTimer) {
    clearTimeout(docNoteTimer);
    docNoteTimer = null;
  }
  if (!docNoteDirty || !docNoteLoadedPath) return;
  await saveDocNoteNow(docNoteLoadedPath);
}
