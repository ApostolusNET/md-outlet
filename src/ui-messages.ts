/**
 * User-facing copy shared by UI server / handoff / tab logic.
 * Strings come from locales/*.json (default language: ja).
 */

import { DEFAULT_LANG, t, type Lang } from "./i18n.js";

/** Max open document tabs in the UI (keep in sync with tab logic). */
export const MAX_UI_TABS = 3;

export type UiMsgBag = {
  tabFull: string;
  tabNotFound: (id: string) => string;
  fileNotFound: (path: string) => string;
  unsupportedFile: (path: string) => string;
  saveViewOnly: (kindLabel: string) => string;
  pdfViewOnly: (kindLabel: string) => string;
  noSaveTarget: string;
  portNotUi: (port: number) => string;
  openFailed: string;
  tabSyncFailed: string;
};

export function createUiMsg(lang: Lang = DEFAULT_LANG): UiMsgBag {
  return {
    tabFull: t(lang, "msg.tabFull", { max: MAX_UI_TABS }),
    tabNotFound: (id: string) => t(lang, "msg.tabNotFound", { id }),
    fileNotFound: (path: string) => t(lang, "msg.fileNotFound", { path }),
    unsupportedFile: (path: string) => t(lang, "msg.unsupportedFile", { path }),
    saveViewOnly: (kindLabel: string) =>
      t(lang, "msg.saveViewOnly", { kind: kindLabel }),
    pdfViewOnly: (kindLabel: string) =>
      t(lang, "msg.pdfViewOnly", { kind: kindLabel }),
    noSaveTarget: t(lang, "msg.noSaveTarget"),
    portNotUi: (port: number) => t(lang, "msg.portNotUi", { port }),
    openFailed: t(lang, "msg.openFailed"),
    tabSyncFailed: t(lang, "msg.tabSyncFailed"),
  };
}

/** Default Japanese bag (CLI / callers that omit lang). */
export const UI_MSG: UiMsgBag = createUiMsg(DEFAULT_LANG);
