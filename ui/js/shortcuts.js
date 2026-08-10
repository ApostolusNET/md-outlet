/**
 * Keyboard shortcuts (Ctrl+Alt+*) and Markdown find bar.
 */
import { $, setStatus } from "./dom.js";

let api = {};
export function bindShortcuts(next) {
  api = next;
}

export function modLetter(e) {
  if (typeof e.code === "string" && /^Key[A-Z]$/.test(e.code)) {
    return e.code.charAt(3).toLowerCase();
  }
  const k = e.key;
  if (typeof k === "string" && k.length === 1) return k.toLowerCase();
  return "";
}

export function closeMdFindBar() {
  const bar = $("mdFindBar");
  if (!bar || bar.hidden) return false;
  bar.hidden = true;
  $("mdFindCount").textContent = "";
  return true;
}

export function openMdFindBar() {
  if (!document.body.classList.contains("show-editor")) {
    document.body.classList.add("show-editor");
    $("btnToggleEditor").classList.add("active");
  }
  const bar = $("mdFindBar");
  bar.hidden = false;
  const input = $("mdFindInput");
  const ta = $("mdEditor");
  if (ta && !input.value) {
    const sel = ta.value.slice(ta.selectionStart, ta.selectionEnd);
    if (sel && !sel.includes("\n") && sel.length < 80) {
      input.value = sel;
    }
  }
  input.focus();
  input.select();
  updateMdFindCount();
}

export function countMdFindMatches(text, needle) {
  if (!needle) return 0;
  const hay = text.toLowerCase();
  const n = needle.toLowerCase();
  let count = 0;
  let from = 0;
  while (from <= hay.length) {
    const i = hay.indexOf(n, from);
    if (i < 0) break;
    count += 1;
    from = i + Math.max(n.length, 1);
  }
  return count;
}

export function updateMdFindCount() {
  const q = ($("mdFindInput").value || "").trim();
  const el = $("mdFindCount");
  if (!q) {
    el.textContent = "";
    return;
  }
  const total = countMdFindMatches($("mdEditor").value, q);
  el.textContent = total ? total + " 件" : "0 件";
}

export function findInMdEditor(dir) {
  const ta = $("mdEditor");
  const q = $("mdFindInput").value;
  if (!q) {
    setStatus("検索語を入力してください", "err");
    $("mdFindInput").focus();
    return;
  }
  const text = ta.value;
  const hay = text.toLowerCase();
  const needle = q.toLowerCase();
  let idx = -1;
  if (dir >= 0) {
    const from = ta.selectionEnd;
    idx = hay.indexOf(needle, from);
    if (idx < 0) idx = hay.indexOf(needle, 0);
  } else {
    const from = Math.max(0, ta.selectionStart - 1);
    idx = hay.lastIndexOf(needle, from);
    if (idx < 0) idx = hay.lastIndexOf(needle);
  }
  updateMdFindCount();
  if (idx < 0) {
    setStatus("見つかりません: " + q, "err");
    return;
  }
  ta.focus();
  ta.setSelectionRange(idx, idx + q.length);
  // Scroll roughly to the match line.
  try {
    const line = text.slice(0, idx).split("\n").length - 1;
    const style = window.getComputedStyle(ta);
    const lh = parseFloat(style.lineHeight) || 18;
    ta.scrollTop = Math.max(0, line * lh - ta.clientHeight / 3);
  } catch (_) {
    /* ignore */
  }
  setStatus("検索: " + q, "ok");
}

export function onAppKeydown(e) {
  if (e.key === "Escape") {
    if ($("mdFindBar") && !$("mdFindBar").hidden) {
      e.preventDefault();
      e.stopPropagation();
      closeMdFindBar();
      $("mdEditor").focus();
      return;
    }
    if (!$("dirtyModal").hidden) {
      e.preventDefault();
      e.stopPropagation();
      api.closeDirtyModal("cancel");
      return;
    }
    if (!$("dropConflictModal").hidden) {
      e.preventDefault();
      e.stopPropagation();
      api.cancelPendingDrop("ドロップをキャンセルしました");
      return;
    }
    if (!$("dropOpenModal").hidden) {
      e.preventDefault();
      e.stopPropagation();
      api.cancelPendingDrop("ドロップをキャンセルしました");
      return;
    }
    if (!$("openMdModal").hidden) {
      e.preventDefault();
      e.stopPropagation();
      api.closeOpenMdModal();
      return;
    }
    if (!$("newMdModal").hidden) {
      e.preventDefault();
      e.stopPropagation();
      api.closeNewMdModal();
      return;
    }
    if (!$("mdModal").hidden) {
      e.preventDefault();
      e.stopPropagation();
      api.closeMdModal();
      return;
    }
    if (!$("pdfModal").hidden) {
      e.preventDefault();
      e.stopPropagation();
      api.closePdfModal();
      return;
    }
    if (api.getState()?.mdPath) {
      e.preventDefault();
      e.stopPropagation();
      api.runNavBack();
    }
    return;
  }

  const mod = (e.ctrlKey || e.metaKey) && e.altKey && !e.shiftKey;
  if (!mod) return;
  const key = modLetter(e);
  if (!key) return;

  if (key === "f") {
    e.preventDefault();
    e.stopPropagation();
    api.closeHeaderMenus();
    if (api.currentDocKind() === "log") {
      const q = $("logFilterQuery");
      if (q) q.focus();
      return;
    }
    if (!api.getState()?.mdPath && !api.getState()?.activeTabId) {
      setStatus("検索するファイルがありません", "err");
      return;
    }
    openMdFindBar();
    return;
  }
  if (key === "s") {
    e.preventDefault();
    e.stopPropagation();
    api.closeHeaderMenus();
    if (api.isDataDoc()) {
      setStatus(
        api.dataDocLabel() + " の保存は未対応です（閲覧のみ）",
        "err"
      );
      return;
    }
    if (!api.getState()?.mdPath) {
      api.openMdModal();
    } else {
      api.runSaveMd(null);
    }
    return;
  }
  if (key === "o") {
    e.preventDefault();
    e.stopPropagation();
    api.closeHeaderMenus();
    api.openOpenMdModal();
    return;
  }
  if (key === "n") {
    e.preventDefault();
    e.stopPropagation();
    api.closeHeaderMenus();
    api.openNewMdModal();
    return;
  }
  if (key === "e") {
    e.preventDefault();
    e.stopPropagation();
    api.closeHeaderMenus();
    api.toggleEditor();
    return;
  }
  if (key === "w") {
    e.preventDefault();
    e.stopPropagation();
    api.closeHeaderMenus();
    if (api.getState()?.activeTabId) {
      api.runCloseTab(api.getState().activeTabId);
    } else {
      setStatus("閉じる文書タブがありません", "ok");
    }
    return;
  }
  if (key === "b") {
    e.preventDefault();
    e.stopPropagation();
    api.closeHeaderMenus();
    api.toggleAsideRail();
    return;
  }
}
