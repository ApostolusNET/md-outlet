/**
 * UI document tabs (phase 1): max 3, shared profile outside this module.
 * Legacy single-doc fields are derived from the active tab.
 */

import { basename } from "node:path";
import {
  detectDocKind,
  type DocKind,
} from "./file-kind.js";
import { MAX_UI_TABS, UI_MSG } from "./ui-messages.js";

export { MAX_UI_TABS };

export type UiTab = {
  id: string;
  path: string;
  kind: DocKind;
  text: string;
};

export type UiTabState = {
  tabs: UiTab[];
  activeId: string | null;
};

export type TabOpenResult =
  | { ok: true; state: UiTabState; activated: boolean; created: boolean }
  | { ok: false; error: string; code: "full" | "invalid" };

let tabSeq = 0;

export function newTabId(): string {
  tabSeq += 1;
  return `tab-${tabSeq}-${Date.now().toString(36)}`;
}

export function emptyTabState(): UiTabState {
  return { tabs: [], activeId: null };
}

export function activeTab(state: UiTabState): UiTab | null {
  if (!state.activeId) return null;
  return state.tabs.find((t) => t.id === state.activeId) ?? null;
}

export function findTabByPath(state: UiTabState, path: string): UiTab | null {
  const norm = normalizePathKey(path);
  return state.tabs.find((t) => normalizePathKey(t.path) === norm) ?? null;
}

function normalizePathKey(p: string): string {
  return p.replace(/\//g, "\\").toLowerCase();
}

export function tabLabel(tab: UiTab): string {
  return basename(tab.path) || tab.path;
}

/** Snapshot fields kept for existing UI clients. */
export function legacyDocFields(state: UiTabState): {
  mdPath: string | null;
  empty: boolean;
  fileKind: DocKind;
  markdown: string;
  pdfOutputPath: string;
  activeTabId: string | null;
  tabs: Array<{
    id: string;
    path: string;
    kind: DocKind;
    label: string;
  }>;
  tabMax: number;
} {
  const active = activeTab(state);
  const mdPath = active?.path ?? null;
  const kind = active ? active.kind : "unknown";
  return {
    mdPath,
    empty: !active,
    fileKind: kind,
    markdown: active?.text ?? "",
    pdfOutputPath:
      active && active.kind === "md"
        ? active.path.replace(/\.(md|markdown)$/i, "") + ".pdf"
        : "",
    activeTabId: state.activeId,
    tabs: state.tabs.map((t) => ({
      id: t.id,
      path: t.path,
      kind: t.kind,
      label: tabLabel(t),
    })),
    tabMax: MAX_UI_TABS,
  };
}

function makeTab(path: string, text: string): UiTab | null {
  const kind = detectDocKind(path);
  if (kind === "unknown") return null;
  return { id: newTabId(), path, kind, text };
}

/**
 * Open a document into the tab set.
 * - Same path → activate existing
 * - Free slot → create tab
 * - Full → if replaceWhenFull, replace active (legacy open-md); else reject
 */
export function openInTabs(
  state: UiTabState,
  path: string,
  text: string,
  options: { replaceWhenFull?: boolean } = {}
): TabOpenResult {
  const existing = findTabByPath(state, path);
  if (existing) {
    return {
      ok: true,
      state: { tabs: state.tabs, activeId: existing.id },
      activated: true,
      created: false,
    };
  }

  const tab = makeTab(path, text);
  if (!tab) {
    return {
      ok: false,
      error: UI_MSG.unsupportedFile(path),
      code: "invalid",
    };
  }

  if (state.tabs.length < MAX_UI_TABS) {
    return {
      ok: true,
      state: {
        tabs: [...state.tabs, tab],
        activeId: tab.id,
      },
      activated: true,
      created: true,
    };
  }

  if (!options.replaceWhenFull) {
    return {
      ok: false,
      error: UI_MSG.tabFull,
      code: "full",
    };
  }

  // Legacy: replace the active tab (or the last one if none active).
  const replaceId =
    state.activeId && state.tabs.some((t) => t.id === state.activeId)
      ? state.activeId
      : state.tabs[state.tabs.length - 1]?.id;
  if (!replaceId) {
    return {
      ok: true,
      state: { tabs: [tab], activeId: tab.id },
      activated: true,
      created: true,
    };
  }
  const tabs = state.tabs.map((t) =>
    t.id === replaceId ? { ...tab, id: replaceId } : t
  );
  return {
    ok: true,
    state: { tabs, activeId: replaceId },
    activated: true,
    created: true,
  };
}

export function switchTab(
  state: UiTabState,
  id: string
): UiTabState | { error: string } {
  if (!state.tabs.some((t) => t.id === id)) {
    return { error: UI_MSG.tabNotFound(id) };
  }
  return { tabs: state.tabs, activeId: id };
}

export function closeTab(
  state: UiTabState,
  id: string
): UiTabState | { error: string } {
  const idx = state.tabs.findIndex((t) => t.id === id);
  if (idx < 0) return { error: UI_MSG.tabNotFound(id) };
  const tabs = state.tabs.filter((t) => t.id !== id);
  let activeId = state.activeId;
  if (activeId === id) {
    if (!tabs.length) activeId = null;
    else activeId = tabs[Math.min(idx, tabs.length - 1)].id;
  }
  return { tabs, activeId };
}

export function closeActiveTab(state: UiTabState): UiTabState {
  if (!state.activeId) return state;
  const next = closeTab(state, state.activeId);
  if ("error" in next) return state;
  return next;
}

/** Update text (and optional path) of the active tab after save / edit sync. */
export function updateActiveTab(
  state: UiTabState,
  patch: { text?: string; path?: string }
): UiTabState {
  const active = activeTab(state);
  if (!active) return state;
  const path = patch.path ?? active.path;
  const kind = detectDocKind(path);
  const tabs = state.tabs.map((t) =>
    t.id === active.id
      ? {
          ...t,
          path,
          kind: kind === "unknown" ? t.kind : kind,
          text: patch.text !== undefined ? patch.text : t.text,
        }
      : t
  );
  return { tabs, activeId: state.activeId };
}

export function setActiveText(state: UiTabState, text: string): UiTabState {
  return updateActiveTab(state, { text });
}
