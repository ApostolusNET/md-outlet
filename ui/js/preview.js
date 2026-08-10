/**
 * Preview iframe + LOG client filter.
 */
import { $, setStatus } from "./dom.js";
import { apiFetch, getLang, t } from "./i18n.js";
import {
  filterLogLines,
  formatFilteredLogLines,
  splitLogLines,
} from "./log-filter.js";

let api = {};
export function bindPreview(next) {
  api = next;
}

let logFilterTimer = null;

let previewTimer = null;

/** Last editor scroll ratio (0–1) for rough preview follow after srcdoc reload. */
let lastEditorScrollRatio = 0;
let scrollFollowRaf = 0;

function scrollableRange(el) {
  if (!el) return 0;
  return Math.max(0, el.scrollHeight - el.clientHeight);
}

function getScrollRatio(el) {
  const range = scrollableRange(el);
  if (range <= 0) return 0;
  return Math.min(1, Math.max(0, el.scrollTop / range));
}

function setScrollRatio(el, ratio) {
  const range = scrollableRange(el);
  if (range <= 0) return;
  const r = Math.min(1, Math.max(0, Number(ratio) || 0));
  el.scrollTop = r * range;
}

function previewScrollRoot(doc) {
  if (!doc) return null;
  return doc.scrollingElement || doc.documentElement || doc.body;
}

export function captureEditorScrollRatio() {
  const ta = $("mdEditor");
  if (!ta) return lastEditorScrollRatio;
  lastEditorScrollRatio = getScrollRatio(ta);
  return lastEditorScrollRatio;
}

export function applyPreviewScrollRatio(ratio = lastEditorScrollRatio) {
  const frame = $("frame");
  if (!frame) return;
  try {
    const root = previewScrollRoot(frame.contentDocument);
    if (!root) return;
    setScrollRatio(root, ratio);
  } catch (_) {
    /* empty / unavailable iframe doc */
  }
}

function syncPreviewToEditorScroll() {
  applyPreviewScrollRatio(captureEditorScrollRatio());
}

/**
 * Editor → preview rough scroll follow (ratio only; one-way).
 * Call once after the editor exists in the DOM.
 */
export function initPreviewScrollFollow() {
  const ta = $("mdEditor");
  if (!ta || ta.dataset.mdOutletScrollFollow === "1") return;
  ta.dataset.mdOutletScrollFollow = "1";
  ta.addEventListener(
    "scroll",
    () => {
      if (scrollFollowRaf) return;
      scrollFollowRaf = requestAnimationFrame(() => {
        scrollFollowRaf = 0;
        syncPreviewToEditorScroll();
      });
    },
    { passive: true }
  );
}

export function selectedLogLevels() {
  return Array.from(
    document.querySelectorAll("#logFilterBar .log-chip[aria-pressed='true']")
  ).map((b) => b.getAttribute("data-level"));
}

export function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function resetLogFilterControls(rerender) {
  const input = $("logFilterQuery");
  if (input) input.value = "";
  document.querySelectorAll("#logFilterBar .log-chip").forEach((b) => {
    b.setAttribute("aria-pressed", "false");
  });
  if (rerender && api.currentDocKind() === "log") renderLogPreview();
  else updateLogFilterCount(0, 0);
}

export function updateLogFilterCount(matched, total) {
  const el = $("logFilterCount");
  if (!el) return;
  if (!total && !matched) {
    el.textContent = t("log.countIdle");
    return;
  }
  el.textContent = t("log.countFmt", {
      matched: matched.toLocaleString(getLang() === "en" ? "en-US" : "ja-JP"),
      total: total.toLocaleString(getLang() === "en" ? "en-US" : "ja-JP"),
    });
}

export function renderLogPreview() {
  const fileLabel = api.basenamePath(api.getState()?.mdPath || "document.log");
  const lines = splitLogLines($("mdEditor").value);
  const query = $("logFilterQuery").value;
  const levels = selectedLogLevels();
  const { indices, matched, total } = filterLogLines(lines, { query, levels });
  updateLogFilterCount(matched, total);

  const body = formatFilteredLogLines(lines, indices);
  const filterNote =
    query.trim() || levels.length
      ? t("log.filterActive")
      : t("log.filterHint");
  const report = [
    t("log.bannerTitle"),
    t("log.fileLabel", { name: fileLabel }),
    t("log.lineCount", {
      n: total.toLocaleString(getLang() === "en" ? "en-US" : "ja-JP"),
    }),
    filterNote,
    "",
    body || t("log.noMatch"),
    "",
  ].join("\n");

  const html =
    "<!DOCTYPE html><html lang=\"" +
    (getLang() === "en" ? "en" : "ja") +
    "\"><head><meta charset=\"utf-8\" />" +
    "<title>" +
    escapeHtml(fileLabel) +
    "</title><style>" +
    "body{margin:0;padding:1rem 1.25rem 2rem;font-family:system-ui,\"Segoe UI\",sans-serif;" +
    "font-size:14px;line-height:1.5;color:#1f2328;background:#f6f8fa}" +
    ".banner{font-size:0.85rem;color:#57606a;margin:0 0 0.75rem}" +
    "pre{margin:0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;" +
    "font-size:13px;line-height:1.45;white-space:pre-wrap;word-break:break-word;" +
    "background:#fff;border:1px solid #d0d7de;border-radius:8px;padding:0.85rem 1rem}" +
    "</style></head><body>" +
    "<p class=\"banner\">" + t("log.htmlBanner") +
    escapeHtml(fileLabel) +
    "</p><pre>" +
    escapeHtml(report) +
    "</pre></body></html>";

  $("previewHint").textContent =
    query.trim() || levels.length ? t("log.filtering") : t("hint.preview.scan");
  setFrameSrcdoc(html);
  api.updateHints();
}

export function scheduleLogFilterRender() {
  if (logFilterTimer) clearTimeout(logFilterTimer);
  logFilterTimer = setTimeout(() => {
    logFilterTimer = null;
    if (api.currentDocKind() === "log") renderLogPreview();
  }, 200);
}

export async function refreshPreview() {
  $("previewHint").textContent = t("preview.rendering");
  // LOG: client-side render so the filter bar can re-draw without a round-trip.
  if (api.currentDocKind() === "log") {
    renderLogPreview();
    return;
  }
  try {
    const res = await apiFetch("/api/preview", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profile: api.readForm(),
        markdown: $("mdEditor").value,
      }),
    });
    const text = await res.text();
    if (!res.ok) {
      let msg = text;
      try {
        msg = JSON.parse(text).error;
      } catch {
        /* keep text */
      }
      setStatus(msg || t("toast.previewFail"), "err");
      $("previewHint").textContent = t("preview.error");
      return;
    }
    // iframe srcdoc often fails to resolve root-relative /api/...; keep a base as backup.
    const withBase = /<base\s/i.test(text)
      ? text
      : text.replace(
          /<head([^>]*)>/i,
          `<head$1><base href="${location.origin}/">`
        );
    setFrameSrcdoc(withBase);
    api.updateHints();
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), "err");
    $("previewHint").textContent = t("preview.error");
  }
}

/**
 * Injected into every preview srcdoc. Forwards app shortcuts to the parent
 * (iframe key events never reach the parent document).
 */

export function previewHotkeyBridgeHtml() {
  return (
    "<script>(function(){" +
    "if(window.__mdOutletHk)return;window.__mdOutletHk=1;" +
    "function letter(e){" +
    "if(e.code&&/^Key[A-Z]$/.test(e.code))return e.code.charAt(3).toLowerCase();" +
    "if(e.key&&e.key.length===1)return e.key.toLowerCase();return '';}" +
    "function park(){try{parent.postMessage({source:'md-outlet-preview',type:'park'},'*');}catch(err){}}" +
    "document.addEventListener('pointerup',function(){setTimeout(function(){" +
    "try{var s=window.getSelection();if(s&&!s.isCollapsed&&String(s).length)return;}catch(err){}" +
    "park();},0);},true);" +
    "document.addEventListener('keydown',function(e){" +
    "var mod=(e.ctrlKey||e.metaKey)&&e.altKey;var key=letter(e);" +
    "var app=e.key==='Escape'||(mod&&!e.shiftKey&&(key==='s'||key==='o'||key==='e'||key==='n'||key==='f'||key==='w'));" +
    "if(!app)return;" +
    "e.preventDefault();e.stopPropagation();" +
    "try{parent.focus();}catch(err){}" +
    "try{parent.postMessage({source:'md-outlet-preview',type:'keydown'," +
    "key:e.key,code:e.code,ctrlKey:!!e.ctrlKey,metaKey:!!e.metaKey," +
    "altKey:!!e.altKey,shiftKey:!!e.shiftKey},'*');}catch(err){}" +
    "setTimeout(park,0);" +
    "},true);" +
    "})();<\/script>"
  );
}

export function injectPreviewHotkeyBridge(html) {
  const bridge = previewHotkeyBridgeHtml();
  if (/<\/body>/i.test(html)) {
    return html.replace(/<\/body>/i, bridge + "</body>");
  }
  return html + bridge;
}

/** Park keyboard focus in the parent so Ctrl+* hits our handlers, not the browser. */

export function parkKeyboardFocus() {
  const frame = $("frame");
  const ae = document.activeElement;
  // Only steal focus when it is trapped inside the preview iframe.
  if (!frame || ae !== frame) return;
  // Keep focus in the iframe while text is selected so Copy (Ctrl+C) works.
  try {
    const sel = frame.contentDocument?.getSelection?.();
    if (sel && !sel.isCollapsed && String(sel).length > 0) return;
  } catch (_) {
    /* cross-origin / empty doc */
  }
  const host = $("kbHost");
  if (host) host.focus({ preventScroll: true });
}

export function setFrameSrcdoc(html) {
  captureEditorScrollRatio();
  const frame = $("frame");
  frame.onload = () => bindPreviewDocument();
  frame.srcdoc = injectPreviewHotkeyBridge(html);
}

/** Link clicks + focus park inside preview iframe. */

export function bindPreviewDocument() {
  const frame = $("frame");
  const doc = frame.contentDocument;
  if (!doc) return;
  if (doc.documentElement.dataset.mdOutletLinks !== "1") {
    doc.documentElement.dataset.mdOutletLinks = "1";
    doc.addEventListener(
      "click",
      (e) => {
        const t = e.target;
        if (!t || typeof t.closest !== "function") return;
        const a = t.closest("a[href]");
        if (!a) return;
        const href = a.getAttribute("href") || "";
        if (!href || href.startsWith("#")) return;

        // External sites: open in a new tab (srcdoc navigation would blank the preview).
        if (/^(https?:|mailto:|tel:)/i.test(href)) {
          e.preventDefault();
          e.stopPropagation();
          window.open(href, "_blank", "noopener");
          return;
        }

        // Local / relative / file: — try to open Markdown in the editor.
        e.preventDefault();
        e.stopPropagation();
        openMarkdownFromPreviewLink(href);
      },
      true
    );
    doc.addEventListener(
      "pointerup",
      () => {
        setTimeout(parkKeyboardFocus, 0);
      },
      true
    );
  }
  // If focus landed in the iframe, pull it back after load/click.
  setTimeout(parkKeyboardFocus, 0);
  // Layout may settle after paint; apply ratio twice so follow survives srcdoc reload.
  const ratio = lastEditorScrollRatio;
  requestAnimationFrame(() => {
    applyPreviewScrollRatio(ratio);
    requestAnimationFrame(() => applyPreviewScrollRatio(ratio));
  });
}

export async function openMarkdownFromPreviewLink(href) {
  const fromPath = api.getState()?.mdPath || "";
  try {
    api.rememberActiveDirty();
    const res = await apiFetch("/api/open-md-link", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        href,
        baseMd: fromPath,
        markdown:
          api.getState()?.mdPath || api.getState()?.activeTabId
            ? $("mdEditor").value
            : undefined,
      }),
    });
    const data = await res.json();
    if (data.skip) {
      setStatus(t("toast.linkBlocked", { href }), "err");
      return;
    }
    if (!res.ok || !data.ok) {
      if (Array.isArray(data.recent) && api.getState()) {
        api.getState().recent = data.recent;
        api.updateWelcomePanel();
      }
      api.mergeTabSnapshot(data);
      api.renderTabBar();
      setStatus(data.error || t("toast.linkOpenFail"), "err");
      return;
    }
    if (fromPath && data.path && fromPath.toLowerCase() !== String(data.path).toLowerCase()) {
      api.pushMdNav(fromPath);
    }
    api.applyActiveMarkdown(data);
    if (api.getState()?.activeTabId && api.getTabDirtyById()[api.getState().activeTabId] == null) {
      api.getTabDirtyById()[api.getState().activeTabId] = false;
    }
    api.setDirtyMd(
      Boolean(
        api.getState()?.activeTabId &&
          api.getTabDirtyById()[api.getState().activeTabId]
      )
    );
    api.updateHints();
    setStatus(t("toast.linkOpened", { path: data.path }), "ok");
    document.body.classList.add("show-editor");
    $("btnToggleEditor").classList.add("active");
    await refreshPreview();
  } catch (e) {
    setStatus(e instanceof Error ? e.message : String(e), "err");
  }
}

export function schedulePreview(which) {
  if (which === "md") {
    api.setDirtyMd(true);
    api.rememberActiveDirty();
    api.renderTabBar();
  }
  if (which === "profile") api.setDirtyProfile(true);
  api.updateHints();
  if (previewTimer) clearTimeout(previewTimer);
  previewTimer = setTimeout(
    () => refreshPreview().catch((e) => setStatus(String(e), "err")),
    350
  );
}
