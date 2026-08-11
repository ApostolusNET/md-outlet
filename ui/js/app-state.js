/**
 * Central client UI session state (document snapshot + dirty / nav / tab flags).
 * Server modules must not import this — browser only.
 */

export const DATA_DOC_KINDS = ["xml", "json", "yaml", "txt", "log", "csv"];

/** Mutable bag shared by app.js and bind*() module APIs. */
export const app = {
  /** Last /api/state (and open/save) snapshot. */
  state: null,
  dirtyProfile: false,
  dirtyMd: false,
  /** Per-tab unsaved flag (id → boolean). Active tab mirrors dirtyMd. */
  tabDirtyById: Object.create(null),
  tabSwitchBusy: false,
  /** Detect SendTo / CLI handoff that changed tabs on the server. */
  lastTabSig: "",
  tabPullBusy: false,
  lastFlashId: 0,
  titleFlashTimer: null,
  defaultDocTitle:
    typeof document !== "undefined"
      ? document.title || "md-outlet ui"
      : "md-outlet ui",
  lastPdfPath: null,
  defaultPdfPath: "",
  /** Previous Markdown paths for preview Back (link navigation). */
  mdNavStack: [],
  dirtyConfirmResolver: null,
  /** Pending drop import awaiting overwrite / save-as choice. */
  pendingDrop: null,
  /** new-md modal purpose: create | drop-save */
  newMdMode: "create",
};

export function ensureState() {
  if (!app.state) app.state = {};
  return app.state;
}

export function syncDirtyMdFromActiveTab() {
  const s = app.state;
  app.dirtyMd = Boolean(s?.activeTabId && app.tabDirtyById[s.activeTabId]);
  return app.dirtyMd;
}

export function markActiveTabClean() {
  const s = app.state;
  if (s?.activeTabId) app.tabDirtyById[s.activeTabId] = false;
  app.dirtyMd = false;
}

export function ensureActiveTabDirtyFlag() {
  const s = app.state;
  if (s?.activeTabId && app.tabDirtyById[s.activeTabId] == null) {
    app.tabDirtyById[s.activeTabId] = false;
  }
}

export function detectKindFromPath(p) {
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

export function currentDocKind() {
  const k = app.state?.fileKind;
  if (k && k !== "unknown") return k;
  return detectKindFromPath(app.state?.mdPath);
}

export function isDataDoc() {
  return DATA_DOC_KINDS.includes(currentDocKind());
}

/** @param {(key: string) => string} t i18n */
export function dataDocLabel(t) {
  const k = currentDocKind();
  if (k === "xml") return "XML";
  if (k === "json") return "JSON";
  if (k === "yaml") return "YAML";
  if (k === "txt") return "TXT";
  if (k === "log") return "LOG";
  if (k === "csv") return "CSV";
  return t("label.data");
}

/**
 * Push a path onto the preview Back stack.
 * @returns {boolean} true when the stack changed
 */
export function pushMdNavPath(fromPath) {
  const p = String(fromPath || "").trim();
  if (!p) return false;
  const top = app.mdNavStack[app.mdNavStack.length - 1];
  if (top && top.toLowerCase() === p.toLowerCase()) return false;
  app.mdNavStack.push(p);
  if (app.mdNavStack.length > 40) app.mdNavStack.shift();
  return true;
}

export function clearMdNavStackData() {
  app.mdNavStack = [];
}

export function popMdNavPath() {
  return app.mdNavStack.pop();
}

/**
 * Shared accessors for bindNotes / bindTabs / bindPreview / …
 * Pass UI callbacks (updateHints, refreshPreview, …) from app.js.
 */
export function createModuleApi(hooks) {
  const h = hooks || {};
  return {
    getState: () => app.state,
    ensureState,
    getDirtyMd: () => app.dirtyMd,
    setDirtyMd: (v) => {
      app.dirtyMd = Boolean(v);
    },
    getDirtyProfile: () => app.dirtyProfile,
    setDirtyProfile: (v) => {
      app.dirtyProfile = Boolean(v);
    },
    getTabDirtyById: () => app.tabDirtyById,
    getTabSwitchBusy: () => app.tabSwitchBusy,
    setTabSwitchBusy: (v) => {
      app.tabSwitchBusy = Boolean(v);
    },
    getTabPullBusy: () => app.tabPullBusy,
    setTabPullBusy: (v) => {
      app.tabPullBusy = Boolean(v);
    },
    getLastTabSig: () => app.lastTabSig,
    setLastTabSig: (v) => {
      app.lastTabSig = String(v || "");
    },
    getLastFlashId: () => app.lastFlashId,
    setLastFlashId: (v) => {
      app.lastFlashId = Number(v) || 0;
    },
    getDefaultDocTitle: () => app.defaultDocTitle,
    getTitleFlashTimer: () => app.titleFlashTimer,
    setTitleFlashTimer: (v) => {
      app.titleFlashTimer = v;
    },
    getDefaultPdfPath: () => app.defaultPdfPath,
    setDefaultPdfPath: (v) => {
      app.defaultPdfPath = v || "";
    },
    getLastPdfPath: () => app.lastPdfPath,
    setLastPdfPath: (v) => {
      app.lastPdfPath = v;
    },
    getNewMdMode: () => app.newMdMode,
    DATA_DOC_KINDS,
    currentDocKind,
    isDataDoc,
    ...h,
  };
}
