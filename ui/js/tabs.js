/**
 * Document tabs, SendTo/CLI handoff polling, attention cues.
 */
import { $, setStatus } from "./dom.js";
import { flushDocNoteIfNeeded } from "./notes.js";

let api = {};
export function bindTabs(next) {
  api = next;
}

let tabPathTipEl = null;

export function rememberActiveDirty() {
  const state = api.getState();
  if (state?.activeTabId) {
    api.getTabDirtyById()[state.activeTabId] = api.getDirtyMd();
  }
}

export function pruneTabDirty() {
  const state = api.getState();
  const live = new Set((state?.tabs || []).map((t) => t.id));
  const tabDirtyById = api.getTabDirtyById();
  for (const id of Object.keys(tabDirtyById)) {
    if (!live.has(id)) delete tabDirtyById[id];
  }
}

export function mergeTabSnapshot(data) {
  if (!data || typeof data !== "object") return;
  let state = api.getState();
  if (!state) {
    state = {};
    // Caller keeps the same object reference via applyStatePayload normally;
    // ensure a bag exists for partial merges during handoff.
    if (typeof api.ensureState === "function") state = api.ensureState();
    else return;
  }
  if (Array.isArray(data.tabs)) state.tabs = data.tabs;
  if ("activeTabId" in data) state.activeTabId = data.activeTabId;
  if (typeof data.tabMax === "number") state.tabMax = data.tabMax;
  if ("fileKind" in data && data.fileKind) state.fileKind = data.fileKind;
  if ("markdown" in data && typeof data.markdown === "string") {
    state.markdown = data.markdown;
  }
  if ("mdPath" in data) state.mdPath = data.mdPath;
  if ("empty" in data) state.empty = data.empty;
  if ("pdfOutputPath" in data) state.pdfOutputPath = data.pdfOutputPath;
  if (
    !state.activeTabId &&
    Array.isArray(state.tabs) &&
    state.tabs.length
  ) {
    const match = state.mdPath
      ? state.tabs.find(
          (t) =>
            String(t.path).toLowerCase() ===
            String(state.mdPath).toLowerCase()
        )
      : null;
    state.activeTabId = (match || state.tabs[state.tabs.length - 1]).id;
  }
  pruneTabDirty();
}

export function computeTabSig(data) {
  const tabs = Array.isArray(data?.tabs) ? data.tabs : [];
  const parts = tabs.map(
    (t) => String(t.id) + "\t" + String(t.path || "")
  );
  return (
    parts.join("|") +
    "#" +
    String(data?.activeTabId || "") +
    "#" +
    String(data?.mdPath || "")
  );
}

export function rememberTabSigFrom(data) {
  api.setLastTabSig(computeTabSig(data || api.getState()));
}

export function pulseTabBar(kind) {
  const bar = $("tabBar");
  if (!bar || bar.hidden) return;
  bar.classList.remove("is-attention-ok", "is-attention-err");
  const cls = kind === "err" ? "is-attention-err" : "is-attention-ok";
  bar.classList.add(cls);
  setTimeout(() => bar.classList.remove(cls), 1600);
}

export function flashDocumentTitle(kind) {
  const mark = kind === "err" ? "！" : "●";
  const defaultDocTitle = api.getDefaultDocTitle();
  document.title = mark + " md-outlet";
  let n = 0;
  const prev = api.getTitleFlashTimer();
  if (prev) clearInterval(prev);
  const timer = setInterval(() => {
    n += 1;
    document.title = n % 2 === 0 ? defaultDocTitle : mark + " md-outlet";
    if (n >= 10) {
      clearInterval(timer);
      api.setTitleFlashTimer(null);
      document.title = defaultDocTitle;
    }
  }, 400);
  api.setTitleFlashTimer(timer);
}

function playAttentionBeep(kind) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = kind === "err" ? 380 : 880;
    gain.gain.value = 0.04;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    setTimeout(() => {
      try {
        osc.stop();
        ctx.close();
      } catch (_) {
        /* ignore */
      }
    }, kind === "err" ? 220 : 140);
  } catch (_) {
    /* ignore */
  }
}

function notifyDesktop(kind, message) {
  try {
    if (typeof Notification === "undefined") return;
    if (Notification.permission !== "granted") return;
    if (!document.hidden) return;
    const n = new Notification(
      kind === "err" ? "md-outlet（エラー）" : "md-outlet",
      {
        body: message || (kind === "err" ? "操作できませんでした" : "ファイルを開きました"),
        silent: true,
      }
    );
    setTimeout(() => {
      try {
        n.close();
      } catch (_) {
        /* ignore */
      }
    }, 5000);
  } catch (_) {
    /* ignore */
  }
}

export function noteUiFlashId(data) {
  const f = data && data.uiFlash;
  if (f && typeof f.id === "number") {
    api.setLastFlashId(Math.max(api.getLastFlashId(), f.id));
  }
}

export function consumeUiFlash(data) {
  const f = data && data.uiFlash;
  if (!f || typeof f.id !== "number" || f.id <= api.getLastFlashId()) return false;
  api.setLastFlashId(f.id);
  const kind = f.kind === "err" ? "err" : "ok";
  const message =
    f.message ||
    (kind === "err" ? "ファイルを開けませんでした" : "更新しました");
  setStatus(message, kind);
  pulseTabBar(kind);
  flashDocumentTitle(kind);
  playAttentionBeep(kind);
  notifyDesktop(kind, message);
  try {
    window.focus();
  } catch (_) {
    /* browsers may ignore */
  }
  return true;
}

export async function pullExternalTabChanges() {
  if (api.getTabSwitchBusy() || api.getTabPullBusy()) return;
  api.setTabPullBusy(true);
  try {
    const res = await fetch("/api/state", { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    const flashed = consumeUiFlash(data);
    const sig = computeTabSig(data);
    if (sig === api.getLastTabSig()) return;
    rememberActiveDirty();
    const state = api.getState();
    if (!state) {
      api.applyStatePayload(data);
    } else {
      if (Array.isArray(data.recent)) state.recent = data.recent;
      mergeTabSnapshot(data);
      if (typeof data.markdown === "string") {
        $("mdEditor").value = data.markdown;
      }
      if (data.pdfOutputPath) {
        state.pdfOutputPath = data.pdfOutputPath;
        api.setDefaultPdfPath(data.pdfOutputPath);
      } else if (api.DATA_DOC_KINDS.includes(state.fileKind)) {
        state.pdfOutputPath = "";
        api.setDefaultPdfPath("");
      }
      api.setDirtyMd(
        Boolean(state.activeTabId && api.getTabDirtyById()[state.activeTabId])
      );
      api.updateActivePath(state.mdPath, state.profileRef);
      api.updateDocModeUi();
      api.updateWelcomePanel();
      api.updateHints();
      renderTabBar();
      rememberTabSigFrom(state);
    }
    const st = api.getState();
    const kind = st?.fileKind;
    const isData = api.DATA_DOC_KINDS.includes(kind);
    if (isData) {
      document.body.classList.remove("show-editor");
      $("btnToggleEditor").classList.remove("active");
    } else if (st?.mdPath) {
      document.body.classList.add("show-editor");
      $("btnToggleEditor").classList.add("active");
    }
    if (kind === "log") api.resetLogFilterControls(false);
    if (st?.mdPath) await api.refreshPreview();
    else $("frame").srcdoc = "";
    if (!flashed) {
      setStatus(
        "タブを更新しました: " +
          (api.basenamePath(st?.mdPath || "") || "—"),
        "ok"
      );
      pulseTabBar("ok");
      flashDocumentTitle("ok");
      try {
        window.focus();
      } catch (_) {
        /* ignore */
      }
    }
  } catch (_) {
    /* ignore transient errors */
  } finally {
    api.setTabPullBusy(false);
  }
}

function tabKindShort(kind) {
  const k = String(kind || "").toLowerCase();
  if (k === "md" || k === "markdown") return "MD";
  if (k === "xml") return "XML";
  if (k === "json") return "JSON";
  if (k === "yaml" || k === "yml") return "YAML";
  if (k === "txt") return "TXT";
  if (k === "log") return "LOG";
  if (k === "csv" || k === "tsv") return "CSV";
  return "DOC";
}

function tabPathTip(tab) {
  const path = String(tab.path || "").trim();
  const name = tab.label || api.basenamePath(path) || "（無題）";
  const dirty = api.getTabDirtyById()[tab.id] ? "未保存あり" : "保存済み";
  const kind = tabKindShort(tab.kind);
  if (!path) return kind + "  " + name + "\n" + dirty;
  return kind + "  " + name + "\n" + path + "\n" + dirty;
}

function ensureTabPathTipEl() {
  if (tabPathTipEl) return tabPathTipEl;
  tabPathTipEl = document.createElement("div");
  tabPathTipEl.className = "tab-path-tip";
  tabPathTipEl.hidden = true;
  tabPathTipEl.setAttribute("role", "tooltip");
  document.body.appendChild(tabPathTipEl);
  return tabPathTipEl;
}
function hideTabPathTip() {
  if (tabPathTipEl) tabPathTipEl.hidden = true;
}
function showTabPathTip(anchor, text) {
  const el = ensureTabPathTipEl();
  el.textContent = text;
  el.hidden = false;
  const pad = 8;
  const r = anchor.getBoundingClientRect();
  const tw = el.offsetWidth;
  const th = el.offsetHeight;
  let left = r.left;
  if (left + tw > window.innerWidth - pad) {
    left = Math.max(pad, window.innerWidth - tw - pad);
  }
  let top = r.bottom + 6;
  if (top + th > window.innerHeight - pad) {
    top = Math.max(pad, r.top - th - 6);
  }
  el.style.left = left + "px";
  el.style.top = top + "px";
}

export function renderTabBar() {
  const bar = $("tabBar");
  const list = $("tabList");
  const state = api.getState();
  const tabs = Array.isArray(state?.tabs) ? state.tabs : [];
  hideTabPathTip();
  if (!tabs.length) {
    bar.hidden = true;
    list.textContent = "";
    return;
  }
  bar.hidden = false;
  list.textContent = "";
  const activeId = state.activeTabId;
  const tabDirtyById = api.getTabDirtyById();
  for (const tab of tabs) {
    const tip = tabPathTip(tab);
    const row = document.createElement("div");
    row.className = "doc-tab" + (tab.id === activeId ? " is-active" : "");
    row.setAttribute("role", "tab");
    row.setAttribute("aria-selected", tab.id === activeId ? "true" : "false");
    row.setAttribute("aria-label", tip.replace(/\n/g, " — "));
    row.dataset.tabId = tab.id;

    const main = document.createElement("button");
    main.type = "button";
    main.className = "tab-main";

    const kind = document.createElement("span");
    kind.className = "tab-kind";
    kind.textContent = tabKindShort(tab.kind);

    const label = document.createElement("span");
    label.className = "tab-label";
    label.textContent = tab.label || api.basenamePath(tab.path) || tab.path;

    main.appendChild(kind);
    main.appendChild(label);
    if (tabDirtyById[tab.id]) {
      const dot = document.createElement("span");
      dot.className = "tab-dirty";
      dot.setAttribute("aria-label", "未保存");
      main.appendChild(dot);
    }
    main.addEventListener("click", () => {
      if (tab.id !== activeId) runSwitchTab(tab.id);
    });

    const close = document.createElement("button");
    close.type = "button";
    close.className = "tab-close";
    close.setAttribute("aria-label", "タブを閉じる");
    close.title = "閉じる (Ctrl+Alt+W / 中クリック)";
    close.textContent = "×";
    close.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      hideTabPathTip();
      runCloseTab(tab.id);
    });

    row.addEventListener("auxclick", (e) => {
      if (e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      hideTabPathTip();
      runCloseTab(tab.id);
    });
    row.addEventListener("mousedown", (e) => {
      if (e.button === 1) e.preventDefault();
    });
    row.addEventListener("mouseenter", () => showTabPathTip(row, tip));
    row.addEventListener("mouseleave", () => hideTabPathTip());

    row.appendChild(main);
    row.appendChild(close);
    list.appendChild(row);
  }

  requestAnimationFrame(() => {
    const active = list.querySelector(".doc-tab.is-active");
    if (active && typeof active.scrollIntoView === "function") {
      active.scrollIntoView({
        behavior: "smooth",
        inline: "nearest",
        block: "nearest",
      });
    }
  });
}

export async function syncActiveEditorToServer() {
  const state = api.getState();
  if (!state?.mdPath && !state?.activeTabId) return true;
  rememberActiveDirty();
  try {
    const res = await fetch("/api/tabs/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdown: $("mdEditor").value }),
    });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setStatus(data.error || "タブ内容の同期に失敗しました", "err");
      return false;
    }
    const data = await res.json().catch(() => null);
    if (data) mergeTabSnapshot(data);
    return true;
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), "err");
    return false;
  }
}

export async function runSwitchTab(id) {
  if (!id || api.getTabSwitchBusy()) return;
  const state = api.getState();
  if (id === state?.activeTabId) return;
  api.setTabSwitchBusy(true);
  try {
    await flushDocNoteIfNeeded();
    rememberActiveDirty();
    const res = await fetch("/api/tabs/switch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id,
        markdown: $("mdEditor").value,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || "タブを切り替えられませんでした", "err");
      return;
    }
    api.applyActiveMarkdown(data);
    api.setDirtyMd(Boolean(api.getTabDirtyById()[id]));
    api.updateHints();
    renderTabBar();
    const kind = data.fileKind || api.getState()?.fileKind;
    const isData = api.DATA_DOC_KINDS.includes(kind);
    if (isData) {
      document.body.classList.remove("show-editor");
      $("btnToggleEditor").classList.remove("active");
    }
    if (kind === "log") api.resetLogFilterControls(false);
    setStatus(
      "タブ: " + (api.basenamePath(data.path || data.mdPath || "") || "—"),
      "ok"
    );
    await api.refreshPreview();
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), "err");
  } finally {
    api.setTabSwitchBusy(false);
  }
}

export async function runCloseTab(id) {
  if (!id) return;
  const state = api.getState();
  const tabs = state?.tabs || [];
  const target = tabs.find((t) => t.id === id);
  if (!target) return;

  if (id !== state.activeTabId) {
    await runSwitchTab(id);
    if (api.getState()?.activeTabId !== id) return;
  }
  if (!(await api.ensureMdClean("タブを閉じる"))) return;

  try {
    const res = await fetch("/api/tabs/close", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setStatus(data.error || "タブを閉じられませんでした", "err");
      return;
    }
    delete api.getTabDirtyById()[id];
    api.applyStatePayload(data);
    const st = api.getState();
    if (!st?.mdPath) {
      api.clearMdNavStack();
      document.body.classList.remove("show-editor");
      $("btnToggleEditor").classList.remove("active");
      api.setLastPdfPath(null);
      api.setDefaultPdfPath("");
      api.hideExportBanner();
      setStatus("閉じました — 最近のファイルから選べます", "ok");
      return;
    }
    api.setDirtyMd(
      Boolean(st.activeTabId && api.getTabDirtyById()[st.activeTabId])
    );
    api.updateHints();
    const kind = st.fileKind;
    const isData = api.DATA_DOC_KINDS.includes(kind);
    if (isData) {
      document.body.classList.remove("show-editor");
      $("btnToggleEditor").classList.remove("active");
    }
    if (kind === "log") api.resetLogFilterControls(false);
    setStatus("タブを閉じました", "ok");
    await api.refreshPreview();
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), "err");
  }
}
