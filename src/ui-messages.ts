/**
 * User-facing Japanese copy shared by UI server / handoff / tab logic.
 * Keep wording consistent across API errors, SendTo dialogs, and toasts.
 */

/** Max open document tabs in the UI (keep in sync with tab logic). */
export const MAX_UI_TABS = 3;

export const UI_MSG = {
  tabFull: `タブが上限（${MAX_UI_TABS}）です。不要なタブを閉じてから再度開いてください。`,
  tabNotFound: (id: string) => `タブが見つかりません: ${id}`,
  fileNotFound: (path: string) => `ファイルが見つかりません: ${path}`,
  unsupportedFile: (path: string) =>
    `対応していないファイルです（.md / .xml / .json / .yaml / .txt / .log / .csv / .tsv）: ${path}`,
  saveViewOnly: (kindLabel: string) =>
    `${kindLabel} の保存は未対応です（閲覧のみ）。`,
  pdfViewOnly: (kindLabel: string) =>
    `${kindLabel} の PDF 出力は未対応です（閲覧オマケ）。`,
  noSaveTarget:
    "保存先がありません。先にファイルを開くか新規作成してください。",
  portNotUi: (port: number) =>
    `ポート ${port} は使用中ですが、md-outlet UI ではありません。`,
  openFailed: "ファイルを開けませんでした",
  tabSyncFailed: "タブ内容の同期に失敗しました",
} as const;
