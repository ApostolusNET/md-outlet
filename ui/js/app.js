import { $, setStatus } from "./dom.js";
import {
  apiFetch,
  getLang,
  initI18n,
  setLang,
  t,
} from "./i18n.js";
import {
  bindNotes,
  applyDocNoteFromPayload,
  flushDocNoteIfNeeded,
  scheduleSaveDocNote,
  updateNotePanelHint,
} from "./notes.js";
import {
  bindTabs,
  renderTabBar,
  pullExternalTabChanges,
  runSwitchTab,
  runCloseTab,
  rememberActiveDirty,
  pruneTabDirty,
  mergeTabSnapshot,
  computeTabSig,
  rememberTabSigFrom,
  pulseTabBar,
  flashDocumentTitle,
  noteUiFlashId,
  consumeUiFlash,
  syncActiveEditorToServer,
} from "./tabs.js";
import {
  bindBrowse,
  browseState,
  startBrowse,
  loadBrowseDir,
  closeOpenMdModal,
  openOpenMdModal,
  initialBrowseDir,
} from "./browse.js";
import {
  bindShortcuts,
  onAppKeydown,
  openMdFindBar,
  closeMdFindBar,
  findInMdEditor,
  updateMdFindCount,
} from "./shortcuts.js";
import {
  bindProfileForm,
  readForm,
  fillForm,
  fillTemplateOptions,
  updateSettingsHints,
  syncMarginPresetUi,
  saveYaml,
  switchTemplate,
  TEMPLATE_LABELS,
} from "./profile-form.js";
import {
  bindPreview,
  initPreviewScrollFollow,
  refreshPreview,
  schedulePreview,
  resetLogFilterControls,
  scheduleLogFilterRender,
  renderLogPreview,
} from "./preview.js";

let state = null;
let timer = null;
let dirtyProfile = false;
let dirtyMd = false;
/** Per-tab unsaved flag (id → boolean). Active tab mirrors dirtyMd. */
const tabDirtyById = Object.create(null);
let tabSwitchBusy = false;
/** Detect SendTo / CLI handoff that changed tabs on the server. */
let lastTabSig = "";
let tabPullBusy = false;
let lastFlashId = 0;
let titleFlashTimer = null;
const defaultDocTitle = document.title || "md-outlet ui";
let lastPdfPath = null;
let defaultPdfPath = "";
/** Previous Markdown paths for preview Back (link navigation). */
let mdNavStack = [];
let dirtyConfirmResolver = null;

/** Pending drop import awaiting overwrite / save-as choice. */
let pendingDrop = null;
/** new-md modal purpose: create | drop-save */
let newMdMode = "create";

function hideExportBanner() {
  const banner = $("exportBanner");
  banner.hidden = true;
  banner.classList.remove("visible", "busy", "err");
  $("btnOpenPdf").hidden = true;
  $("btnDismissBanner").hidden = true;
  $("bannerPath").hidden = true;
}

function showExportBanner(opts) {
  const banner = $("exportBanner");
  banner.hidden = false;
  banner.className = "export-banner visible" + (opts.kind ? " " + opts.kind : "");
  $("bannerTitle").textContent = opts.title || "";
  const pathEl = $("bannerPath");
  if (opts.path) {
    pathEl.textContent = opts.path;
    pathEl.hidden = false;
  } else {
    pathEl.textContent = "";
    pathEl.hidden = true;
  }
  $("btnOpenPdf").hidden = !opts.showOpen;
  $("btnDismissBanner").hidden = !opts.showDismiss;
}

function openPdfInBrowser() {
  window.open("/api/pdf?t=" + Date.now(), "_blank", "noopener");
}

function updateHints() {
  const mdHint = $("mdHint");
  if (!state?.mdPath) {
    mdHint.textContent = t("hint.md.none");
    mdHint.classList.remove("dirty", "saved");
    mdHint.classList.add("idle");
    $("previewHint").textContent = t("preview.idle");
    return;
  }
  mdHint.classList.remove("idle");
  if (isDataDoc()) {
    mdHint.textContent = dataDocLabel() + t("hint.md.viewOnly");
    mdHint.classList.remove("dirty");
    mdHint.classList.add("saved");
    $("previewHint").textContent = t("hint.preview.scan");
    return;
  }
  mdHint.textContent = dirtyMd ? t("preview.unsaved") : t("hint.md.saved");
  mdHint.classList.toggle("dirty", dirtyMd);
  mdHint.classList.toggle("saved", !dirtyMd);
  $("previewHint").textContent =
    dirtyProfile || dirtyMd ? t("hint.preview.pending") : t("preview.latest");
}

const DATA_DOC_KINDS = ["xml", "json", "yaml", "txt", "log", "csv"];

function detectKindFromPath(p) {
  const s = String(p || "");
  if (/\.xml$/i.test(s)) return "xml";
  if (/\.json$/i.test(s)) return "json";
  if (/\.ya?ml$/i.test(s)) return "yaml";
  if (/\.(csv|tsv)$/i.test(s)) return "csv";
  if (/\.log$/i.test(s)) return "log";
  if (/\.txt$/i.test(s)) return "txt";
  if (/\.(md|markdown)$/i.test(s)) return "md";
  return "unknown";
}

function currentDocKind() {
  const k = state?.fileKind;
  if (k && k !== "unknown") return k;
  return detectKindFromPath(state?.mdPath);
}

function isDataDoc() {
  return DATA_DOC_KINDS.includes(currentDocKind());
}

function dataDocLabel() {
  const k = currentDocKind();
  if (k === "xml") return "XML";
  if (k === "json") return "JSON";
  if (k === "yaml") return "YAML";
  if (k === "txt") return "TXT";
  if (k === "log") return "LOG";
  if (k === "csv") return "CSV";
  return t("label.data");
}

function updateDocModeUi() {
  const data = isDataDoc();
  const label = data ? dataDocLabel() : "";
  const isLog = currentDocKind() === "log";
  document.body.classList.toggle("doc-data", data);
  document.body.classList.toggle("doc-log", isLog);
  $("mdEditor").readOnly = data;
  $("btnSaveMd").disabled = data;
  $("btnSaveMd").title = data
    ? t("toast.saveViewOnlyTitle", { kind: label })
    : "";
  $("btnToggleEditor").textContent = data
    ? t("editor.rawText")
    : t("editor.editToggle");
  if (data) {
    $("btnNewMd").title = t("editor.newMdOnly");
  } else {
    $("btnNewMd").title = "";
  }
  if (!isLog) {
    // Keep filter state when switching away? Clear to avoid surprise on reopen.
    resetLogFilterControls(false);
  }
}

/** LOG filter UI state (display only — never writes the file). */









function basenamePath(p) {
  const s = String(p || "");
  const i = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  return i >= 0 ? s.slice(i + 1) : s;
}

function updateNavBackButton() {
  const btn = $("btnNavBack");
  const hasFile = Boolean(state?.mdPath);
  btn.hidden = !hasFile;
  if (!hasFile) return;
  btn.textContent = mdNavStack.length ? t("nav.backFile") : t("nav.backHistory");
  btn.title = mdNavStack.length
    ? t("nav.backFileTitle")
    : t("nav.backHistoryTitle");
}

function clearMdNavStack() {
  mdNavStack = [];
  updateNavBackButton();
}

function pushMdNav(fromPath) {
  const p = String(fromPath || "").trim();
  if (!p) return;
  const top = mdNavStack[mdNavStack.length - 1];
  if (top && top.toLowerCase() === p.toLowerCase()) return;
  mdNavStack.push(p);
  if (mdNavStack.length > 40) mdNavStack.shift();
  updateNavBackButton();
}

function askDirtyMd(actionLabel) {
  return new Promise((resolve) => {
    if (!dirtyMd) {
      resolve("ok");
      return;
    }
    dirtyConfirmResolver = resolve;
    const name =
      basenamePath(state?.mdPath || "") ||
      (state?.activeTabId ? t("label.thisTab") : t("label.thisFile"));
    const action =
      actionLabel && String(actionLabel).startsWith("action.")
        ? t(actionLabel)
        : actionLabel || t("action.this");
    $("dirtyModalMessage").textContent = t("modal.dirtyDynamic", {
      name,
      action,
    });
    $("dirtyModal").hidden = false;
    $("btnDirtySave").focus();
  });
}

async function ensureMdClean(actionLabel) {
  const choice = await askDirtyMd(actionLabel);
  if (choice === "cancel") return false;
  if (choice === "discard") {
    dirtyMd = false;
    if (state?.activeTabId) tabDirtyById[state.activeTabId] = false;
    updateHints();
    renderTabBar();
    return true;
  }
  if (choice === "save") {
    const ok = await runSaveMd(null, { quiet: true });
    return ok;
  }
  return true;
}










/** Ignore flashes this page already handled (including its own /api/tabs/open). */

/** Server flash from SendTo / CLI (works even when tab set did not change — e.g. 409). */

/**
 * Pick up tabs / notices from SendTo / second CLI without opening a new browser tab.
 * Also runs while the tab is in the background (title blink / desktop notify).
 */





/** Keep server tab text in sync with the editor (does not change active tab). */



function closeDirtyModal(choice) {
  $("dirtyModal").hidden = true;
  const resolve = dirtyConfirmResolver;
  dirtyConfirmResolver = null;
  if (resolve) resolve(choice);
}

function renderRecentList(recent) {
  const box = $("recentList");
  box.textContent = "";
  const list = Array.isArray(recent) ? recent : [];
  if (!list.length) {
    const empty = document.createElement("div");
    empty.className = "recent-empty";
    empty.textContent =
      t("welcome.recentEmptyLong");
    box.appendChild(empty);
    return;
  }
  for (const item of list) {
    const row = document.createElement("div");
    row.className = "recent-row" + (item.pinned ? " is-pinned" : "");

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "recent-open";
    openBtn.setAttribute("role", "listitem");
    const name = document.createElement("span");
    name.className = "recent-name";
    name.textContent = basenamePath(item.path);
    const path = document.createElement("span");
    path.className = "recent-path";
    path.textContent = item.path;
    openBtn.appendChild(name);
    openBtn.appendChild(path);
    openBtn.addEventListener("click", () =>
      runOpenMd(item.path, { nav: "replace" })
    );

    const actions = document.createElement("div");
    actions.className = "recent-actions";

    const pinBtn = document.createElement("button");
    pinBtn.type = "button";
    pinBtn.textContent = item.pinned ? "★" : "☆";
    pinBtn.title = item.pinned ? t("recent.unpin") : t("recent.pin");
    pinBtn.className = item.pinned ? "is-on" : "";
    pinBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      toggleRecentPin(item.path, !item.pinned);
    });

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "×";
    delBtn.title = t("recent.remove");
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      removeRecentEntry(item.path);
    });

    actions.appendChild(pinBtn);
    actions.appendChild(delBtn);
    row.appendChild(openBtn);
    row.appendChild(actions);
    box.appendChild(row);
  }
}

async function removeRecentEntry(path) {
  try {
    const res = await apiFetch("/api/recent/remove", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || t("toast.recentRemoveFail"), "err");
      return;
    }
    if (state) state.recent = data.recent || [];
    renderRecentList(state?.recent || []);
    setStatus(t("toast.recentRemoved"), "ok");
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), "err");
  }
}

async function toggleRecentPin(path, pinned) {
  try {
    const res = await apiFetch("/api/recent/pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path, pinned: Boolean(pinned) }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || t("toast.pinFail"), "err");
      return;
    }
    if (state) state.recent = data.recent || [];
    renderRecentList(state?.recent || []);
    setStatus(pinned ? t("toast.pinned") : t("toast.unpinned"), "ok");
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), "err");
  }
}

function updateWelcomePanel() {
  const empty = !state?.mdPath;
  $("welcomePanel").hidden = !empty;
  if (empty) {
    renderRecentList(state?.recent || []);
    $("frame").srcdoc = "";
    clearMdNavStack();
  }
  updateNavBackButton();
}

/**
 * Insert text at the textarea caret (or replace selection).
 * Returns the new caret position after the inserted block.
 */
function insertAtCursor(ta, text, selectInnerStart, selectInnerEnd) {
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const before = ta.value.slice(0, start);
  const after = ta.value.slice(end);
  ta.value = before + text + after;
  const base = before.length;
  if (
    typeof selectInnerStart === "number" &&
    typeof selectInnerEnd === "number"
  ) {
    ta.selectionStart = base + selectInnerStart;
    ta.selectionEnd = base + selectInnerEnd;
  } else {
    const pos = base + text.length;
    ta.selectionStart = pos;
    ta.selectionEnd = pos;
  }
  ta.focus();
  schedulePreview("md");
}

function insertPageBreak() {
  const ta = $("mdEditor");
  const start = ta.selectionStart;
  const before = ta.value.slice(0, start);
  const needNlBefore =
    before.length > 0 && !before.endsWith("\n") && !before.endsWith("\r\n");
  const block =
    (needNlBefore ? "\n" : "") +
    '<div class="page-break"></div>\n';
  insertAtCursor(ta, block);
  setStatus(t("toast.pageBreak"), "ok");
}

function insertKeepTogether() {
  const ta = $("mdEditor");
  const start = ta.selectionStart;
  const end = ta.selectionEnd;
  const selected = ta.value.slice(start, end);
  const before = ta.value.slice(0, start);
  const needNlBefore =
    before.length > 0 && !before.endsWith("\n") && !before.endsWith("\r\n");
  const prefix = needNlBefore ? "\n" : "";
  if (selected.length > 0) {
    const wrapped =
      prefix +
      '<div class="keep-together">\n\n' +
      selected.replace(/^\n+|\n+$/g, "") +
      "\n\n</div>\n";
    insertAtCursor(ta, wrapped);
    setStatus(t("toast.keepWrapped"), "ok");
  } else {
    const open = prefix + '<div class="keep-together">\n\n';
    const close = "\n\n</div>\n";
    const placeholder = "<!-- content that should stay on one page -->";
    const text = open + placeholder + close;
    insertAtCursor(ta, text, open.length, open.length + placeholder.length);
    setStatus(t("toast.keepInserted"), "ok");
  }
}














function updateActivePath(filePath, profileRef) {
  const path = filePath || "";
  const el = $("previewPath");
  el.textContent = path;
  el.title = path;
  const tmpl = profileRef ? TEMPLATE_LABELS[profileRef] || profileRef : "";
  $("appTitle").dataset.templateLabel = tmpl || "";
}

function fillHelpMenu(library) {
  const panel = $("helpMenuPanel");
  panel.innerHTML = "";
  const list = Array.isArray(library) ? library : [];
  if (!list.length) {
    const empty = document.createElement("button");
    empty.type = "button";
    empty.disabled = true;
    empty.textContent = t("help.empty");
    panel.appendChild(empty);
    return;
  }
  for (const item of list) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = item.label;
    b.dataset.path = item.path;
    b.addEventListener("click", () => {
      $("helpMenu").open = false;
      runOpenMd(item.path, { nav: "replace" });
    });
    panel.appendChild(b);
  }
}

function applyStatePayload(data) {
  state = data;
  if (!state.fileKind && state.mdPath) {
    state.fileKind = detectKindFromPath(state.mdPath);
  }
  if (!Array.isArray(state.tabs)) state.tabs = [];
  pruneTabDirty();
  $("savePath").value = data.savePath;
  if (!defaultPdfPath) defaultPdfPath = data.pdfOutputPath || "";
  updateActivePath(data.mdPath, data.profileRef);
  fillTemplateOptions(data.builtins, data.profileRef);
  fillHelpMenu(data.library);
  fillForm(data.profile);
  if (typeof data.markdown === "string") {
    $("mdEditor").value = data.markdown;
    dirtyMd = Boolean(
      state.activeTabId && tabDirtyById[state.activeTabId]
    );
  }
  dirtyProfile = false;
  updateDocModeUi();
  updateWelcomePanel();
  updateHints();
  renderTabBar();
  rememberTabSigFrom(state);
  applyDocNoteFromPayload(data);
}

const ASIDE_RAIL_KEY = "md-outlet-aside-rail";

function isAsideRail() {
  return document.body.classList.contains("aside-rail");
}

function applyAsideRail(rail) {
  document.body.classList.toggle("aside-rail", Boolean(rail));
  const btn = $("btnAsideToggle");
  if (!btn) return;
  btn.setAttribute("aria-expanded", rail ? "false" : "true");
  btn.textContent = rail ? "›" : "‹";
  btn.title = rail
    ? t("aside.openTitle")
    : t("aside.closeTitle");
}

function loadAsideRailPref() {
  try {
    return localStorage.getItem(ASIDE_RAIL_KEY) === "1";
  } catch (_) {
    return false;
  }
}

function saveAsideRailPref(rail) {
  try {
    localStorage.setItem(ASIDE_RAIL_KEY, rail ? "1" : "0");
  } catch (_) {
    /* ignore quota / private mode */
  }
}

function toggleAsideRail() {
  const next = !isAsideRail();
  applyAsideRail(next);
  saveAsideRailPref(next);
  setStatus(
    next
      ? t("toast.asideCollapsed")
      : t("toast.asideOpened"),
    "ok"
  );
}

applyAsideRail(loadAsideRailPref());

async function loadState() {
  const res = await apiFetch("/api/state");
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || t("toast.stateLoadFail"));
  applyStatePayload(data);
  // Drop flashes that already existed when this page loaded (e.g. prior 409),
  // otherwise the 800ms handoff poll replays a red toast for no reason.
  noteUiFlashId(data);
  if (data.empty || !data.mdPath) {
    setStatus(t("toast.pickFile"), "ok");
  } else {
    const tmpl =
      $("appTitle").dataset.templateLabel ||
      TEMPLATE_LABELS[data.profileRef] ||
      data.profileRef ||
      "";
    setStatus(
      tmpl
        ? t("toast.readyTemplate", { name: tmpl })
        : t("toast.readyDefault"),
      "ok"
    );
    try {
      await refreshPreview();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e), "err");
    }
  }
}


function toggleEditor() {
  const on = !document.body.classList.contains("show-editor");
  document.body.classList.toggle("show-editor", on);
  $("btnToggleEditor").classList.toggle("active", on);
  $("mdMenu").open = false;
  if (on) {
    const ed = $("mdEditor");
    setTimeout(() => {
      ed.focus();
    }, 0);
  }
}

function closeHeaderMenus() {
  $("mdMenu").open = false;
  $("helpMenu").open = false;
}







function closeMdModal() {
  $("mdModal").hidden = true;
  $("mdModalStepSave").hidden = false;
  $("mdModalStepAs").hidden = true;
}

function openMdModal() {
  const path = state?.mdPath || t("label.unset");
  $("mdModalOverwritePath").textContent = path;
  $("mdModalStepSave").hidden = false;
  $("mdModalStepAs").hidden = true;
  $("mdModal").hidden = false;
}

function suggestMdSaveAsPath() {
  const base = state?.mdPath || "./document.md";
  return String(base).replace(/\.md$/i, "") + "-copy.md";
}

async function showMdSaveAsStep() {
  $("mdModalPathInput").value = suggestMdSaveAsPath();
  $("mdModalStepSave").hidden = true;
  $("mdModalStepAs").hidden = false;
  try {
    await startBrowse("save-md", {
      selectedPath: "",
      pathValue: $("mdModalPathInput").value,
    });
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), "err");
  }
  $("mdModalPathInput").focus();
  $("mdModalPathInput").select();
}

async function runSaveMd(outputPath, opts) {
  const options = opts || {};
  if (!options.keepMdModal) closeMdModal();
  const btn = $("btnSaveMd");
  btn.disabled = true;
  const prevLabel = btn.textContent;
  btn.textContent = t("busy.saving");
  try {
    const body = { markdown: $("mdEditor").value };
    if (outputPath) body.path = outputPath;
    const res = await apiFetch("/api/save-md", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || t("toast.mdSaveFail"), "err");
      return false;
    }
    dirtyMd = false;
    if (state) {
      state.mdPath = data.path;
      state.empty = !data.path;
      if (Array.isArray(data.recent)) state.recent = data.recent;
      if (data.pdfOutputPath) {
        state.pdfOutputPath = data.pdfOutputPath;
        defaultPdfPath = data.pdfOutputPath;
        lastPdfPath = null;
      }
      mergeTabSnapshot(data);
      if (state.activeTabId) tabDirtyById[state.activeTabId] = false;
    }
    updateActivePath(data.path, state?.profileRef);
    updateWelcomePanel();
    updateHints();
    renderTabBar();
    if (!options.quiet) {
      setStatus(
        data.switched
          ? t("toast.mdSavedAs", { path: data.path })
          : t("toast.mdSavedPath", { path: data.path }),
        "ok"
      );
    }
    return true;
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), "err");
    return false;
  } finally {
    btn.disabled = false;
    btn.textContent = prevLabel;
  }
}

function ensureState() {
  if (!state) state = {};
  return state;
}

function applyActiveMarkdown(data) {
  if (!state) state = {};
  const path = data.path !== undefined ? data.path : data.mdPath;
  state.mdPath = path;
  state.empty = !path;
  state.fileKind =
    data.fileKind ||
    (path ? detectKindFromPath(path) : "unknown");
  if (Array.isArray(data.recent)) state.recent = data.recent;
  if (data.pdfOutputPath) {
    state.pdfOutputPath = data.pdfOutputPath;
    defaultPdfPath = data.pdfOutputPath;
    lastPdfPath = null;
  } else if (DATA_DOC_KINDS.includes(state.fileKind)) {
    state.pdfOutputPath = "";
    defaultPdfPath = "";
  }
  mergeTabSnapshot(data);
  if (typeof data.markdown === "string") {
    $("mdEditor").value = data.markdown;
  }
  dirtyMd = Boolean(
    state?.activeTabId && tabDirtyById[state.activeTabId]
  );
  updateActivePath(state?.mdPath, state?.profileRef);
  updateDocModeUi();
  updateWelcomePanel();
  updateHints();
  renderTabBar();
  rememberTabSigFrom(state);
  applyDocNoteFromPayload({
    ...data,
    mdPath: path,
  });
}

async function runCloseMd() {
  closeHeaderMenus();
  if (!state?.mdPath) {
    updateWelcomePanel();
    setStatus(t("toast.alreadyEmpty"), "ok");
    return;
  }
  if (!(await ensureMdClean("action.close"))) return;
  const btn = $("btnCloseMd");
  btn.disabled = true;
  const prevLabel = btn.textContent;
  btn.textContent = t("busy.closing");
  try {
    const res = await apiFetch("/api/close-md", { method: "POST" });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || t("toast.closeFail"), "err");
      return;
    }
    clearMdNavStack();
    applyStatePayload(data);
    document.body.classList.remove("show-editor");
    $("btnToggleEditor").classList.remove("active");
    lastPdfPath = null;
    defaultPdfPath = "";
    hideExportBanner();
    setStatus(t("toast.closed"), "ok");
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), "err");
  } finally {
    btn.disabled = false;
    btn.textContent = prevLabel;
  }
}

async function runNavBack() {
  if (!state?.mdPath) return;
  if (!(await ensureMdClean("action.back"))) return;
  if (mdNavStack.length) {
    const prev = mdNavStack.pop();
    updateNavBackButton();
    await runOpenMd(prev, { skipDirtyConfirm: true, nav: "back" });
    return;
  }
  await runCloseMd();
}

async function runOpenMd(requestedPath, opts) {
  const options = opts || {};
  closeOpenMdModal();
  const btn = $("btnOpenMd");
  btn.disabled = true;
  const prevLabel = btn.textContent;
  btn.textContent = t("busy.opening");
  try {
    const res = await apiFetch("/api/tabs/open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: requestedPath,
        markdown: $("mdEditor").value,
      }),
    });
    const data = await res.json();
    noteUiFlashId(data);
    if (!res.ok) {
      if (Array.isArray(data.recent) && state) {
        state.recent = data.recent;
        updateWelcomePanel();
      }
      mergeTabSnapshot(data);
      renderTabBar();
      setStatus(data.error || t("toast.openFail"), "err");
      return;
    }
    if (options.nav === "replace") clearMdNavStack();
    applyActiveMarkdown(data);
    if (state?.activeTabId && tabDirtyById[state.activeTabId] == null) {
      tabDirtyById[state.activeTabId] = false;
    }
    dirtyMd = Boolean(state?.activeTabId && tabDirtyById[state.activeTabId]);
    updateHints();
    renderTabBar();
    updateNavBackButton();
    const kind = data.fileKind || state?.fileKind;
    const isData = DATA_DOC_KINDS.includes(kind);
    setStatus(
      isData
        ? t("toast.openedScan", {
            kind: (kind || "").toUpperCase(),
            path: data.path,
          })
        : t("toast.openedPath", { path: data.path }),
      "ok"
    );
    if (isData) {
      document.body.classList.remove("show-editor");
      $("btnToggleEditor").classList.remove("active");
    } else {
      document.body.classList.add("show-editor");
      $("btnToggleEditor").classList.add("active");
    }
    if (kind === "log") resetLogFilterControls(false);
    await refreshPreview();
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), "err");
  } finally {
    btn.disabled = false;
    btn.textContent = prevLabel;
  }
}

function closeNewMdModalKeepPending() {
  $("newMdModal").hidden = true;
}

function closeNewMdModal() {
  const wasDropSave = newMdMode === "drop-save";
  $("newMdModal").hidden = true;
  if (wasDropSave) {
    pendingDrop = null;
    setStatus(t("toast.dropCancel"), "ok");
  }
  newMdMode = "create";
  $("newMdModalTitle").textContent = "New Markdown";
  $("btnNewMdConfirm").textContent = t("common.create");
}

function suggestNewMdPath() {
  const base = state?.mdPath || "./untitled.md";
  const dirMatch = String(base).match(/^(.*[/\\])/);
  const dir = dirMatch ? dirMatch[1] : "./";
  return dir + "untitled.md";
}

async function openNewMdModal(opts) {
  const options = opts || {};
  newMdMode = options.mode === "drop-save" ? "drop-save" : "create";
  const pathValue =
    options.pathValue != null ? options.pathValue : suggestNewMdPath();
  $("newMdModalTitle").textContent =
    newMdMode === "drop-save"
      ? t("modal.dropSaveAsTitle")
      : "New Markdown";
  $("newMdModalLead").textContent =
    newMdMode === "drop-save"
      ? t("modal.dropSaveAsLead")
      : t("modal.newLead");
  $("btnNewMdConfirm").textContent =
    newMdMode === "drop-save" ? t("modal.dropSaveConfirm") : t("common.create");
  $("newMdPathInput").value = pathValue;
  $("newMdModal").hidden = false;
  try {
    await startBrowse("new-md", {
      selectedPath: "",
      pathValue,
      startDir: options.startDir,
    });
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), "err");
  }
  $("newMdPathInput").focus();
  $("newMdPathInput").select();
}

async function runNewMd(requestedPath, force, opts) {
  const options = opts || {};
  const fromDrop = Boolean(options.fromDrop) || newMdMode === "drop-save";
  if (!force && !options.skipDirtyConfirm) {
    if (!(await ensureMdClean("action.new"))) return;
  }
  closeNewMdModalKeepPending();
  const btn = $("btnNewMd");
  btn.disabled = true;
  const prevLabel = btn.textContent;
  btn.textContent = fromDrop ? t("busy.saving") : t("busy.creating");
  try {
    const body = {
      path: requestedPath,
      force: Boolean(force),
    };
    if (fromDrop) {
      if (!pendingDrop || typeof pendingDrop.markdown !== "string") {
        setStatus(t("toast.dropEmpty"), "err");
        return;
      }
      body.markdown = pendingDrop.markdown;
    }
    const res = await apiFetch("/api/new-md", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (res.status === 409 && data.exists) {
      if (
        confirm(
          t("toast.overwriteConfirm", { path: data.path })
        )
      ) {
        await runNewMd(requestedPath, true, {
          skipDirtyConfirm: true,
          fromDrop,
        });
      } else {
        await openNewMdModal({
          mode: fromDrop ? "drop-save" : "create",
          pathValue: requestedPath,
          startDir: dirOfPath(requestedPath),
        });
      }
      return;
    }
    if (!res.ok) {
      setStatus(data.error || t("toast.newFail"), "err");
      return;
    }
    pendingDrop = null;
    newMdMode = "create";
    clearMdNavStack();
    applyActiveMarkdown(data);
    updateNavBackButton();
    setStatus(
      fromDrop
        ? t("toast.dropSavedOpen", { path: data.path })
        : t("toast.createdPath", { path: data.path }),
      "ok"
    );
    document.body.classList.add("show-editor");
    $("btnToggleEditor").classList.add("active");
    await refreshPreview();
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), "err");
  } finally {
    btn.disabled = false;
    btn.textContent = prevLabel;
  }
}

function overwritePdfPath() {
  return lastPdfPath || defaultPdfPath || state?.pdfOutputPath || "";
}

function suggestSaveAsPath() {
  const base = overwritePdfPath();
  if (!base) return "./export.pdf";
  return base.replace(/\.pdf$/i, "") + "-copy.pdf";
}

function closePdfModal() {
  $("pdfModal").hidden = true;
  $("pdfModalStepSave").hidden = false;
  $("pdfModalStepAs").hidden = true;
}

function openPdfModal() {
  const path = overwritePdfPath();
  $("pdfModalOverwritePath").textContent = path || t("label.unset");
  $("pdfModalStepSave").hidden = false;
  $("pdfModalStepAs").hidden = true;
  $("pdfModal").hidden = false;
}

async function showPdfSaveAsStep() {
  $("pdfModalPathInput").value = suggestSaveAsPath();
  $("pdfModalStepSave").hidden = true;
  $("pdfModalStepAs").hidden = false;
  try {
    await startBrowse("save-pdf", {
      selectedPath: "",
      pathValue: $("pdfModalPathInput").value,
    });
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), "err");
  }
  $("pdfModalPathInput").focus();
  $("pdfModalPathInput").select();
}

async function runExportPdf(outputPath) {
  closePdfModal();
  const btn = $("btnPdf");
  btn.disabled = true;
  const prevLabel = btn.textContent;
  btn.textContent = t("busy.exporting");
  setStatus(t("toast.pdfWorking"));
  showExportBanner({
    kind: "busy",
    title: t("toast.pdfWorking"),
    showOpen: false,
    showDismiss: false,
  });
  const viewer = window.open("about:blank", "_blank");
  try {
    const res = await apiFetch("/api/export-pdf", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: readForm(),
        markdown: $("mdEditor").value,
        outputPath: outputPath,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      if (viewer) viewer.close();
      setStatus(data.error || t("toast.pdfFail"), "err");
      showExportBanner({
        kind: "err",
        title: data.error || t("toast.pdfFail"),
        showOpen: false,
        showDismiss: true,
      });
      return;
    }
    lastPdfPath = data.path;
    defaultPdfPath = data.path;
    const fileName = String(data.path || "").split(/[/\\]/).pop() || "PDF";
    setStatus(t("toast.pdfSaved", { path: data.path }), "ok");
    showExportBanner({
      title: t("toast.pdfSavedBanner", { name: fileName }),
      path: data.path,
      showOpen: true,
      showDismiss: true,
    });
    const url = "/api/pdf?t=" + Date.now();
    if (viewer && !viewer.closed) {
      viewer.location.href = url;
    } else {
      setStatus(
        t("toast.pdfSavedWithBanner", { path: data.path }),
        "ok"
      );
    }
  } catch (e) {
    if (viewer) viewer.close();
    const msg = e instanceof Error ? e.message : String(e);
    setStatus(msg, "err");
    showExportBanner({
      kind: "err",
      title: msg,
      showOpen: false,
      showDismiss: true,
    });
  } finally {
    btn.disabled = false;
    btn.textContent = prevLabel;
  }
}

async function reloadMd() {
  if (!(await ensureMdClean("action.reload"))) return;
  const res = await apiFetch("/api/state");
  const data = await res.json();
  if (!res.ok) {
    setStatus(data.error || t("toast.reloadFail"), "err");
    return;
  }
  $("mdEditor").value = data.markdown || "";
  dirtyMd = false;
  if (state?.activeTabId) tabDirtyById[state.activeTabId] = false;
  updateHints();
  renderTabBar();
  applyDocNoteFromPayload(data);
  setStatus(t("toast.reloaded"), "ok");
  await refreshPreview();
}

function closeDropConflictModal() {
  $("dropConflictModal").hidden = true;
}

function openDropConflictModal(conflictPath) {
  $("dropConflictPath").textContent = conflictPath || t("label.unknown");
  $("dropConflictModal").hidden = false;
  $("btnDropConflictOverwrite").focus();
}

function closeDropOpenModal() {
  $("dropOpenModal").hidden = true;
  $("dropOpenList").textContent = "";
  $("dropOpenList").hidden = true;
  $("dropOpenPath").hidden = true;
  $("btnDropOpenCopy").hidden = true;
  $("btnDropOpenBrowse").hidden = true;
}

function cancelPendingDrop(msg) {
  closeDropOpenModal();
  closeDropConflictModal();
  pendingDrop = null;
  if (msg) setStatus(msg, "ok");
}

function suggestCopyPath(p) {
  const s = String(p || "./dropped.md");
  if (/\.(md|markdown)$/i.test(s)) {
    return s.replace(/\.(md|markdown)$/i, "") + "-copy.md";
  }
  return s + "-copy.md";
}

function dirOfPath(p) {
  const s = String(p || "");
  const slash = Math.max(s.lastIndexOf("/"), s.lastIndexOf("\\"));
  return slash > 0 ? s.slice(0, slash) : state?.workspaceRoot || "";
}

async function openDropSaveAsBrowse() {
  closeDropConflictModal();
  if (!pendingDrop) return;
  const conflict = pendingDrop.conflictPath || "";
  const suggested = suggestCopyPath(
    conflict || pendingDrop.name || "dropped.md"
  );
  await openNewMdModal({
    mode: "drop-save",
    pathValue: suggested,
    startDir: dirOfPath(conflict) || initialBrowseDir(),
  });
}

function isMarkdownDropFile(file) {
  if (!file) return false;
  const name = String(file.name || "").toLowerCase();
  return name.endsWith(".md") || name.endsWith(".markdown");
}

function extractDroppedPathHint(dt, file) {
  if (file && typeof file.path === "string" && file.path.trim()) {
    return file.path.trim();
  }
  const chunks = [];
  try {
    chunks.push(dt.getData("text/uri-list"));
  } catch (_) {
    /* ignore */
  }
  try {
    chunks.push(dt.getData("text/plain"));
  } catch (_) {
    /* ignore */
  }
  for (const block of chunks) {
    for (const line of String(block || "").split(/\r?\n/)) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      if (
        /^file:/i.test(t) ||
        /^[a-zA-Z]:[\\/]/.test(t) ||
        t.startsWith("\\\\")
      ) {
        return t;
      }
    }
  }
  return "";
}

async function openResolvedDropPath(path) {
  pendingDrop = null;
  closeDropOpenModal();
  await runOpenMd(path, { skipDirtyConfirm: true, nav: "replace" });
}

function showDropPickModal(candidates) {
  $("dropOpenTitle").textContent = t("drop.pickTitle");
  $("dropOpenLead").textContent =
    t("drop.pickLead");
  $("dropOpenPath").hidden = true;
  const list = $("dropOpenList");
  list.hidden = false;
  list.textContent = "";
  for (const p of candidates) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("role", "option");
    const k = document.createElement("span");
    k.className = "browse-kind";
    k.textContent = "md";
    const n = document.createElement("span");
    n.className = "browse-name";
    n.textContent = p;
    btn.appendChild(k);
    btn.appendChild(n);
    btn.addEventListener("click", () => {
      openResolvedDropPath(p).catch((err) => {
        setStatus(err instanceof Error ? err.message : String(err), "err");
      });
    });
    list.appendChild(btn);
  }
  $("btnDropOpenCopy").hidden = false;
  $("btnDropOpenBrowse").hidden = false;
  $("dropOpenModal").hidden = false;
  $("btnDropOpenBrowse").focus();
}

function showDropNoPathModal() {
  $("dropOpenTitle").textContent = t("drop.unresolvedTitle");
  $("dropOpenLead").textContent =
    t("drop.unresolvedLead");
  $("dropOpenPath").hidden = false;
  $("dropOpenPath").textContent = pendingDrop?.name || t("label.unknown");
  $("dropOpenList").hidden = true;
  $("dropOpenList").textContent = "";
  $("btnDropOpenCopy").hidden = false;
  $("btnDropOpenBrowse").hidden = false;
  $("dropOpenModal").hidden = false;
  $("btnDropOpenBrowse").focus();
}

async function resolveAndOpenDrop(file, pathHint) {
  const searchDirs = [];
  if (state?.mdPath) searchDirs.push(dirOfPath(state.mdPath));
  if (state?.workspaceRoot) searchDirs.push(state.workspaceRoot);
  const res = await apiFetch("/api/resolve-drop", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: file.name || "dropped.md",
      size: typeof file.size === "number" ? file.size : undefined,
      lastModified:
        typeof file.lastModified === "number" ? file.lastModified : undefined,
      pathHint: pathHint || undefined,
      searchDirs,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    setStatus(data.error || t("toast.dropResolveFail"), "err");
    showDropNoPathModal();
    return;
  }
  if (data.path) {
    setStatus(t("toast.dropOpenPath", { path: data.path }), "ok");
    await openResolvedDropPath(data.path);
    return;
  }
  if (Array.isArray(data.candidates) && data.candidates.length) {
    showDropPickModal(data.candidates);
    return;
  }
  showDropNoPathModal();
}

async function importDroppedMarkdown(force) {
  if (!pendingDrop || typeof pendingDrop.markdown !== "string") {
    setStatus(t("toast.dropEmpty"), "err");
    return false;
  }
  const res = await apiFetch("/api/import-md", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: pendingDrop.name || "dropped.md",
      markdown: pendingDrop.markdown,
      force: Boolean(force),
    }),
  });
  const data = await res.json();
  if (res.status === 409 && data.exists) {
    pendingDrop.conflictPath = data.path;
    closeDropOpenModal();
    openDropConflictModal(data.path);
    return false;
  }
  if (!res.ok) {
    setStatus(data.error || t("toast.dropImportFail"), "err");
    pendingDrop = null;
    return false;
  }
  pendingDrop = null;
  clearMdNavStack();
  applyActiveMarkdown(data);
  updateNavBackButton();
  setStatus(t("toast.dropImported", { path: data.path }), "ok");
  document.body.classList.add("show-editor");
  $("btnToggleEditor").classList.add("active");
  await refreshPreview();
  return true;
}

async function handleMarkdownDrop(dt) {
  const files = dt && dt.files ? Array.from(dt.files) : [];
  const mdFiles = files.filter(isMarkdownDropFile);
  if (!mdFiles.length) {
    setStatus(t("toast.dropNeedMd"), "err");
    return;
  }
  if (!(await ensureMdClean("action.openFile"))) return;
  closeOpenMdModal();
  closeMdModal();
  closePdfModal();
  closeNewMdModal();
  closeDropConflictModal();
  closeDropOpenModal();
  const first = mdFiles[0];
  const pathHint = extractDroppedPathHint(dt, first);
  const markdown = await first.text();
  pendingDrop = {
    name: first.name || "dropped.md",
    markdown,
    conflictPath: "",
    pathHint,
  };
  await resolveAndOpenDrop(first, pathHint);
  if (mdFiles.length > 1 && state?.mdPath) {
    setStatus(
      t("toast.openedFirstOf", { n: mdFiles.length, path: state.mdPath }),
      "ok"
    );
  }
}

async function browseForDroppedFile() {
  const name = pendingDrop?.name || "";
  closeDropOpenModal();
  pendingDrop = null;
  await openOpenMdModal();
  if (name) {
    $("openMdPathInput").value = name;
    setStatus(
      t("toast.pickFromList", { name }),
      "ok"
    );
  }
}

function requestUiShutdown() {
  try {
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/shutdown", "");
      return;
    }
  } catch (_) {
    /* fall through */
  }
  try {
    apiFetch("/api/shutdown", { method: "POST", keepalive: true });
  } catch (_) {
    /* ignore */
  }
}

function wireUiModules() {
  bindNotes({
    getState: () => state,
    setStatus,
  });

  bindTabs({
    getState: () => state,
    ensureState,
    getDirtyMd: () => dirtyMd,
    setDirtyMd: (v) => {
      dirtyMd = Boolean(v);
    },
    getTabDirtyById: () => tabDirtyById,
    getTabSwitchBusy: () => tabSwitchBusy,
    setTabSwitchBusy: (v) => {
      tabSwitchBusy = Boolean(v);
    },
    getTabPullBusy: () => tabPullBusy,
    setTabPullBusy: (v) => {
      tabPullBusy = Boolean(v);
    },
    getLastTabSig: () => lastTabSig,
    setLastTabSig: (v) => {
      lastTabSig = String(v || "");
    },
    getLastFlashId: () => lastFlashId,
    setLastFlashId: (v) => {
      lastFlashId = Number(v) || 0;
    },
    getDefaultDocTitle: () => defaultDocTitle,
    getTitleFlashTimer: () => titleFlashTimer,
    setTitleFlashTimer: (v) => {
      titleFlashTimer = v;
    },
    setDefaultPdfPath: (v) => {
      defaultPdfPath = v || "";
    },
    setLastPdfPath: (v) => {
      lastPdfPath = v;
    },
    DATA_DOC_KINDS,
    applyStatePayload,
    applyActiveMarkdown,
    updateActivePath,
    updateDocModeUi,
    updateWelcomePanel,
    updateHints,
    refreshPreview,
    resetLogFilterControls,
    basenamePath,
    ensureMdClean,
    clearMdNavStack,
    hideExportBanner,
  });

  bindBrowse({
    getState: () => state,
    runOpenMd,
    runSaveMd,
    runExportPdf,
    runNewMd,
    getNewMdMode: () => newMdMode,
  });

  bindShortcuts({
    getState: () => state,
    closeDirtyModal,
    cancelPendingDrop,
    closeOpenMdModal,
    closeNewMdModal,
    closeMdModal,
    closePdfModal,
    runNavBack,
    closeHeaderMenus,
    currentDocKind,
    isDataDoc,
    dataDocLabel,
    openMdModal,
    runSaveMd,
    openOpenMdModal,
    openNewMdModal,
    toggleEditor,
    runCloseTab,
    toggleAsideRail,
  });

  bindProfileForm({
    getState: () => state,
    schedulePreview,
    applyStatePayload,
    refreshPreview,
    basenamePath,
    updateHints,
    setDirtyProfile: (v) => {
      dirtyProfile = Boolean(v);
    },
  });

  bindPreview({
    getState: () => state,
    currentDocKind,
    readForm,
    updateHints,
    basenamePath,
    rememberActiveDirty,
    renderTabBar,
    setDirtyMd: (v) => {
      dirtyMd = Boolean(v);
    },
    setDirtyProfile: (v) => {
      dirtyProfile = Boolean(v);
    },
    applyActiveMarkdown,
    mergeTabSnapshot,
    updateWelcomePanel,
    pushMdNav,
    getTabDirtyById: () => tabDirtyById,
  });
  initPreviewScrollFollow();
}

wireUiModules();

$("btnSave").addEventListener("click", () => saveYaml());
$("btnSaveMd").addEventListener("click", () => {
  closeHeaderMenus();
  if (isDataDoc()) {
    setStatus(t("toast.saveViewOnlyShort", { kind: dataDocLabel() }), "err");
    return;
  }
  openMdModal();
});
$("btnNewMd").addEventListener("click", () => {
  closeHeaderMenus();
  openNewMdModal();
});
$("btnNewMdCancel").addEventListener("click", () => closeNewMdModal());
$("btnNewMdConfirm").addEventListener("click", () => {
  const path = $("newMdPathInput").value.trim();
  if (!path) {
    setStatus(t("toast.needNewPath"), "err");
    $("newMdPathInput").focus();
    return;
  }
  runNewMd(path, false, {
    skipDirtyConfirm: newMdMode === "drop-save",
    fromDrop: newMdMode === "drop-save",
  });
});
$("newMdPathInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("btnNewMdConfirm").click();
  }
});
$("btnNewMdUp").addEventListener("click", () => {
  if (browseState.mode === "new-md" && browseState.parent) {
    loadBrowseDir(browseState.parent);
  }
});
$("btnNewMdHome").addEventListener("click", () => {
  if (browseState.mode !== "new-md") return;
  const home = browseState.home || state?.workspaceRoot || "";
  if (home) loadBrowseDir(home);
});
$("newMdRootSelect").addEventListener("change", () => {
  if (browseState.mode !== "new-md") return;
  const sel = $("newMdRootSelect");
  const path = sel.value;
  if (!path) return;
  loadBrowseDir(path);
  sel.value = "";
});
$("newMdModal").addEventListener("click", (e) => {
  if (e.target === $("newMdModal")) closeNewMdModal();
});

$("btnOpenMd").addEventListener("click", () => {
  closeHeaderMenus();
  openOpenMdModal();
});
$("btnOpenMdCancel").addEventListener("click", () => closeOpenMdModal());
$("btnOpenMdConfirm").addEventListener("click", () => {
  const path = (
    $("openMdPathInput").value.trim() ||
    browseState.selectedPath ||
    ""
  ).trim();
  if (!path) {
    setStatus(
      t("toast.needOpenPick"),
      "err"
    );
    return;
  }
  runOpenMd(path, { nav: "replace" });
});
$("openMdPathInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("btnOpenMdConfirm").click();
  }
});
$("btnOpenMdUp").addEventListener("click", () => {
  if (browseState.mode === "open" && browseState.parent) {
    loadBrowseDir(browseState.parent);
  }
});
$("btnOpenMdHome").addEventListener("click", () => {
  if (browseState.mode !== "open") return;
  const home = browseState.home || state?.workspaceRoot || "";
  if (home) loadBrowseDir(home);
});
$("openMdRootSelect").addEventListener("change", () => {
  if (browseState.mode !== "open") return;
  const sel = $("openMdRootSelect");
  const path = sel.value;
  if (!path) return;
  loadBrowseDir(path);
  sel.value = "";
});
$("openMdModal").addEventListener("click", (e) => {
  if (e.target === $("openMdModal")) closeOpenMdModal();
});

$("btnMdCancel").addEventListener("click", () => closeMdModal());
$("btnMdOverwrite").addEventListener("click", () => runSaveMd(null));
$("btnMdSaveAs").addEventListener("click", () => showMdSaveAsStep());
$("btnMdAsBack").addEventListener("click", () => {
  $("mdModalStepAs").hidden = true;
  $("mdModalStepSave").hidden = false;
});
$("btnMdAsConfirm").addEventListener("click", () => {
  const path = $("mdModalPathInput").value.trim();
  if (!path) {
    setStatus(t("toast.needMdSavePath"), "err");
    $("mdModalPathInput").focus();
    return;
  }
  runSaveMd(path);
});
$("mdModalPathInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("btnMdAsConfirm").click();
  }
});
$("btnMdSaveUp").addEventListener("click", () => {
  if (browseState.mode === "save-md" && browseState.parent) {
    loadBrowseDir(browseState.parent);
  }
});
$("btnMdSaveHome").addEventListener("click", () => {
  if (browseState.mode !== "save-md") return;
  const home = browseState.home || state?.workspaceRoot || "";
  if (home) loadBrowseDir(home);
});
$("mdSaveRootSelect").addEventListener("change", () => {
  if (browseState.mode !== "save-md") return;
  const sel = $("mdSaveRootSelect");
  const path = sel.value;
  if (!path) return;
  loadBrowseDir(path);
  sel.value = "";
});
$("mdModal").addEventListener("click", (e) => {
  if (e.target === $("mdModal")) closeMdModal();
});

$("btnPdf").addEventListener("click", () => {
  if (isDataDoc()) {
    setStatus(
      t("toast.pdfViewOnlyShort", { kind: dataDocLabel() }),
      "err"
    );
    return;
  }
  openPdfModal();
});
$("btnPdfCancel").addEventListener("click", () => closePdfModal());
$("btnPdfOverwrite").addEventListener("click", () => {
  const path = overwritePdfPath();
  if (!path) {
    showPdfSaveAsStep();
    return;
  }
  runExportPdf(path);
});
$("btnPdfSaveAs").addEventListener("click", () => showPdfSaveAsStep());
$("btnPdfAsBack").addEventListener("click", () => {
  $("pdfModalStepAs").hidden = true;
  $("pdfModalStepSave").hidden = false;
});
$("btnPdfAsConfirm").addEventListener("click", () => {
  const path = $("pdfModalPathInput").value.trim();
  if (!path) {
    setStatus(t("toast.needPdfPath"), "err");
    $("pdfModalPathInput").focus();
    return;
  }
  runExportPdf(path);
});
$("pdfModalPathInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    $("btnPdfAsConfirm").click();
  }
});
$("btnPdfSaveUp").addEventListener("click", () => {
  if (browseState.mode === "save-pdf" && browseState.parent) {
    loadBrowseDir(browseState.parent);
  }
});
$("btnPdfSaveHome").addEventListener("click", () => {
  if (browseState.mode !== "save-pdf") return;
  const home = browseState.home || state?.workspaceRoot || "";
  if (home) loadBrowseDir(home);
});
$("pdfSaveRootSelect").addEventListener("change", () => {
  if (browseState.mode !== "save-pdf") return;
  const sel = $("pdfSaveRootSelect");
  const path = sel.value;
  if (!path) return;
  loadBrowseDir(path);
  sel.value = "";
});
$("pdfModal").addEventListener("click", (e) => {
  if (e.target === $("pdfModal")) closePdfModal();
});

$("btnOpenPdf").addEventListener("click", () => openPdfInBrowser());
$("btnDismissBanner").addEventListener("click", () => hideExportBanner());
$("btnReloadMd").addEventListener("click", () => reloadMd());
$("btnInsertBreak").addEventListener("click", () => insertPageBreak());
$("btnInsertKeep").addEventListener("click", () => insertKeepTogether());
$("btnToggleEditor").addEventListener("click", () => toggleEditor());
$("btnAsideToggle").addEventListener("click", () => toggleAsideRail());
$("btnCloseMd").addEventListener("click", () => {
  if (state?.activeTabId) runCloseTab(state.activeTabId);
  else runCloseMd();
});
$("btnNavBack").addEventListener("click", () => {
  runNavBack();
});
$("btnDirtyCancel").addEventListener("click", () => closeDirtyModal("cancel"));
$("btnDirtyDiscard").addEventListener("click", () => closeDirtyModal("discard"));
$("btnDirtySave").addEventListener("click", () => closeDirtyModal("save"));
$("dirtyModal").addEventListener("click", (e) => {
  if (e.target === $("dirtyModal")) closeDirtyModal("cancel");
});

$("btnDropConflictCancel").addEventListener("click", () => {
  cancelPendingDrop(t("toast.dropCancel"));
});
$("btnDropConflictOverwrite").addEventListener("click", () => {
  closeDropConflictModal();
  importDroppedMarkdown(true).catch((err) => {
    setStatus(err instanceof Error ? err.message : String(err), "err");
  });
});
$("btnDropConflictSaveAs").addEventListener("click", () => {
  openDropSaveAsBrowse().catch((err) => {
    setStatus(err instanceof Error ? err.message : String(err), "err");
  });
});
$("dropConflictModal").addEventListener("click", (e) => {
  if (e.target === $("dropConflictModal")) {
    cancelPendingDrop(t("toast.dropCancel"));
  }
});
$("btnDropOpenCancel").addEventListener("click", () => {
  cancelPendingDrop(t("toast.dropCancel"));
});
$("btnDropOpenBrowse").addEventListener("click", () => {
  browseForDroppedFile().catch((err) => {
    setStatus(err instanceof Error ? err.message : String(err), "err");
  });
});
$("btnDropOpenCopy").addEventListener("click", () => {
  closeDropOpenModal();
  importDroppedMarkdown(false).catch((err) => {
    setStatus(err instanceof Error ? err.message : String(err), "err");
  });
});
$("dropOpenModal").addEventListener("click", (e) => {
  if (e.target === $("dropOpenModal")) {
    cancelPendingDrop(t("toast.dropCancel"));
  }
});
$("btnWelcomeOpen").addEventListener("click", () => {
  openOpenMdModal();
});
$("btnWelcomeNew").addEventListener("click", () => {
  openNewMdModal();
});

$("templateSelect").addEventListener("change", () => {
  const name = $("templateSelect").value;
  if (name) switchTemplate(name);
});

[
  "name",
  "description",
  "savePath",
  "format",
  "orientation",
  "mTop",
  "mRight",
  "mBottom",
  "mLeft",
  "scale",
  "themeSelect",
  "themeCustom",
  "printBg",
  "breakH1",
  "skipFirst",
  "marginPreset",
].forEach((id) => {
  const el = $(id);
  el.addEventListener("input", () => {
    if (id === "marginPreset") syncMarginPresetUi();
    if (["mTop", "mRight", "mBottom", "mLeft"].includes(id)) {
      $("marginPreset").value = "custom";
      $("marginCustomRow").hidden = false;
    }
    updateSettingsHints();
    schedulePreview("profile");
  });
  el.addEventListener("change", () => {
    if (id === "marginPreset") syncMarginPresetUi();
    if (["mTop", "mRight", "mBottom", "mLeft"].includes(id)) {
      $("marginPreset").value = "custom";
      $("marginCustomRow").hidden = false;
    }
    updateSettingsHints();
    schedulePreview("profile");
  });
});
$("themeSelect").addEventListener("change", () => {
  if ($("themeSelect").value) $("themeCustom").value = "";
  updateSettingsHints();
  schedulePreview("profile");
});
$("mdEditor").addEventListener("input", () => schedulePreview("md"));
$("docNote").addEventListener("input", () => scheduleSaveDocNote());

$("logFilterQuery").addEventListener("input", () => scheduleLogFilterRender());
$("btnLogFilterClear").addEventListener("click", () => {
  resetLogFilterControls(true);
});
document.querySelectorAll("#logFilterBar .log-chip").forEach((btn) => {
  btn.addEventListener("click", () => {
    const on = btn.getAttribute("aria-pressed") === "true";
    btn.setAttribute("aria-pressed", on ? "false" : "true");
    if (currentDocKind() === "log") renderLogPreview();
  });
});

$("btnMdFind").addEventListener("click", () => openMdFindBar());
$("btnMdFindClose").addEventListener("click", () => {
  closeMdFindBar();
  $("mdEditor").focus();
});
$("btnMdFindNext").addEventListener("click", () => findInMdEditor(1));
$("btnMdFindPrev").addEventListener("click", () => findInMdEditor(-1));
$("mdFindInput").addEventListener("input", () => updateMdFindCount());
$("mdFindInput").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    e.preventDefault();
    findInMdEditor(e.shiftKey ? -1 : 1);
  } else if (e.key === "Escape") {
    e.preventDefault();
    closeMdFindBar();
    $("mdEditor").focus();
  }
});

function bindMenuDismiss(menuId) {
  $(menuId).addEventListener("toggle", () => {
    if (!$(menuId).open) return;
    if (menuId === "mdMenu") $("helpMenu").open = false;
    if (menuId === "helpMenu") $("mdMenu").open = false;
    const onDoc = (ev) => {
      if (!$(menuId).contains(ev.target)) {
        $(menuId).open = false;
        document.removeEventListener("click", onDoc, true);
      }
    };
    setTimeout(() => document.addEventListener("click", onDoc, true), 0);
  });
}
bindMenuDismiss("mdMenu");
bindMenuDismiss("helpMenu");

window.addEventListener("keydown", onAppKeydown, true);
window.addEventListener("message", (ev) => {
  const frame = $("frame");
  if (!frame || ev.source !== frame.contentWindow) return;
  const d = ev.data;
  if (!d || d.source !== "md-outlet-preview") return;
  if (d.type === "park") {
    parkKeyboardFocus();
    return;
  }
  if (d.type !== "keydown") return;
  onAppKeydown({
    key: d.key,
    code: d.code,
    ctrlKey: d.ctrlKey,
    metaKey: d.metaKey,
    altKey: d.altKey,
    shiftKey: d.shiftKey,
    preventDefault() {},
    stopPropagation() {},
  });
  parkKeyboardFocus();
});
$("frame").addEventListener("focus", () => {
  setTimeout(parkKeyboardFocus, 0);
});

let dragDepth = 0;
function showDropOverlay(on) {
  $("dropOverlay").hidden = !on;
  $("dropOverlay").setAttribute("aria-hidden", on ? "false" : "true");
}
function hasFilesDrag(e) {
  const types = e.dataTransfer && e.dataTransfer.types;
  if (!types) return false;
  return Array.from(types).includes("Files");
}
window.addEventListener("dragenter", (e) => {
  if (!hasFilesDrag(e)) return;
  e.preventDefault();
  dragDepth += 1;
  showDropOverlay(true);
});
window.addEventListener("dragover", (e) => {
  if (!hasFilesDrag(e)) return;
  e.preventDefault();
  if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
});
window.addEventListener("dragleave", (e) => {
  if (!hasFilesDrag(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) showDropOverlay(false);
});
window.addEventListener("drop", (e) => {
  if (!hasFilesDrag(e)) return;
  e.preventDefault();
  dragDepth = 0;
  showDropOverlay(false);
  handleMarkdownDrop(e.dataTransfer).catch((err) => {
    setStatus(err instanceof Error ? err.message : String(err), "err");
  });
});

window.addEventListener("pagehide", () => {
  requestUiShutdown();
});

setInterval(pullExternalTabChanges, 800);
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) pullExternalTabChanges();
});
window.addEventListener("focus", () => {
  pullExternalTabChanges();
});

async function bootUi() {
  await initI18n();
  document.querySelectorAll("[data-set-lang]").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const next = btn.getAttribute("data-set-lang");
      if (!next || next === getLang()) {
        const menu = $("langMenu");
        if (menu) menu.open = false;
        return;
      }
      await setLang(next);
      if (state?.builtins) fillTemplateOptions(state.builtins, state.profileRef);
      if (state?.profile) fillForm(state.profile);
      updateDocModeUi();
      updateHints();
      updateSettingsHints();
      updateNotePanelHint();
      updateWelcomePanel();
      updateNavBackButton();
      applyAsideRail(isAsideRail());
      renderTabBar();
      fillHelpMenu(state?.library);
      // Refresh library labels / START path from server for the new lang.
      try {
        await loadState();
      } catch (e) {
        setStatus(e instanceof Error ? e.message : String(e), "err");
      }
      setStatus(
        t("toast.langSwitched", {
          label: t(next === "en" ? "lang.en" : "lang.ja"),
        }),
        "ok"
      );
    });
  });
  await loadState();
}

bootUi().catch((e) => setStatus(String(e.message || e), "err"));

