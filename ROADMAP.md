# md-outlet Roadmap

原則: **段階的・正確・実用的**。正本は常に Profile Spec（YAML/JSON）。
UI や CLI は正本を書く／上書きする窓口であり、別の設定ストアを作らない。

## Phase 1 — 今すぐ使える紙面調整（完了）

第三者の「A4縦／横」「余白」「少し縮めたい」「この塊は切らない」を
YAML を書かずに試せるようにする。

| 機能 | 手段 | 備考 |
|------|------|------|
| 用紙・向き | `--format` `--orientation` | プロファイル上書き |
| 余白 | `--margin` / `--margin-*` | プロファイル上書き |
| 全体スケール | `--scale` | PDF のみ（0.1〜2.0） |
| 範囲を切らない | `<div class="keep-together">` | テーマ CSS |

保存したい結果は、後から YAML に写すか Phase 3 の `init` / Phase 4 の UI で保存する。

## Phase 2 — 文書単位の設定（front matter）（完了）

Markdown 冒頭に `md-outlet:` ブロックを置き、その文書だけの好みを同梱する。
CI や配布に「ファイル1つ」で足りるようにする。

解決順: ベースプロファイル → front matter → CLI 上書き。

## Phase 3 — 雛形生成（`md-outlet init`）（完了）

既存プロファイルをコピーして `my-report.yaml` を生成。
第三者は編集から始められる。

```bash
md-outlet init my-report
md-outlet init my-report --based-on ops-manual -o ./my-report.yaml
md-outlet init --list
md-outlet pdf doc.md --profile ./my-report.yaml
```

## Phase 4 — 設定画面（`md-outlet ui`）（完了）

ローカル Web UI:

- 左: 用紙・向き・余白・テーマ選択・H1改ページ
- 右: 同一 HTML パイプラインのプレビュー
- 保存先: **profile.yaml のみ**（正本はファイル）
- Export PDF も同一パイプラインから実行可能
- 起動時にブラウザを自動オープン（`--no-open` で抑制）
- 組み込みテーマ: `default`, `compact`

```bash
md-outlet ui examples/sample.md --profile default -o ./my-report.yaml
md-outlet ui doc.md --profile ./my-report.yaml
```

設定画面は YAML の代替ではなく、YAML を編集するフロントエンド。
バンドルの `profiles/` は上書きしない（`-o` で別ファイルへ保存）。

## Phase 4b — UI 内マルチタブ＋単一インスタンス（完了）

「送る」連打や突き合わせ閲覧向けの薄いマルチタブ。

| 機能 | 内容 |
|------|------|
| 文書タブ | 最大 3（path / kind / text）。紙面設定は共有 |
| 4 つ目 | 拒否メッセージのみ（自動クローズしない） |
| 単一インスタンス | 既定ポートで UI 稼働中 → `/api/tabs/open` で既存へ |
| SendTo | `install-sendto.bat` / `start-ui-sendto.ps1`（2 つ目以降はシェルを増やさない） |

## Phase 4c — UI クライアント分割（完了）

バンドラなし。`ui/index.html` は殼、`styles.css` ＋ `js/`（ES modules）を UI サーバが静的配信（`no-store`、`/js/*` はサンドボックス）。

| ファイル | 役割 |
|----------|------|
| `ui/index.html` | マークアップのみ（殼） |
| `ui/styles.css` | 画面 CSS |
| `ui/js/dom.js` | `$` / toast |
| `ui/js/notes.js` | 文書メモ（`bindNotes`） |
| `ui/js/tabs.js` | タブ／handoff poll |
| `ui/js/browse.js` | 開く・保存のフォルダ一覧 |
| `ui/js/shortcuts.js` | Ctrl+Alt ショートカット／検索 |
| `ui/js/profile-form.js` | 用紙・テーマ・YAML／ひな形 |
| `ui/js/preview.js` | プレビュー iframe・LOG フィルタ |
| `ui/js/app.js` | 起動・配線・文書操作（開く／保存／新規／PDF／D&D／履歴） |

**方針（これ以上の細分化）:** 行数だけで追加分割しない。`app.js` に残る塊（MD ライフサイクル／PDF／D&D／履歴／配線）は、その塊を本気で触る直前にだけ切り出す。共有ストアは持たず、各モジュールは `bind*(api)` の依存注入。

## Phase 5 — 配布方針（文書化済み・実装は段階的）

正本: [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md)

| 段階 | 内容 | 状態 |
|------|------|------|
| 方針確定 | 本命＝Windows 版付き zip＋SendTo。副＝npm。システムブラウザ PDF を改善枠に | 完了（文書） |
| 段階 1 | 版付き zip（`npm run pack` → `dist/md-outlet-<ver>.zip`）。GitHub Release または手元配布 | **完了（0.2.0）** |
| 段階 2 | PDF はシステム Edge/Chrome（`puppeteer-core`）。推奨環境をドキュメントに記載 | **完了** |
| 段階 3 | Node 同梱ポータブル **または** 簡易インストーラのどちらか一方 | 必要になるまで保留 |

## 初学者向けドキュメント

- [docs/START.md](docs/START.md) — 設置〜 UI で PDF までの日本語ガイド
- [docs/DISTRIBUTION.md](docs/DISTRIBUTION.md) — 配布チャネル・Release zip・ブラウザ検出の方針
- [docs/RELEASE-v0.2.0.md](docs/RELEASE-v0.2.0.md) — v0.2.0 リリースノート（貼り付け用）
- [examples/sample.md](examples/sample.md) — 基本サンプル
- [start-ui.bat](start-ui.bat) — Windows ダブルクリック起動（Node 検出 → install → UI）
- [start-ui.sh](start-ui.sh) — macOS / Linux 起動（同上）
- [install-sendto.bat](install-sendto.bat) — エクスプローラー「送る」登録
- `npm run pack` — `dist/md-outlet-<ver>.zip` 生成

## やらないこと（現時点）

- 章単位の自動 Fit-to-page（縮小ループ）— 難易度が高く、約束しない
- クラウド変換 API
- IDE 拡張を Phase 1〜3 より先に本命化する
- タブごとのプロファイル／分割ビュー／シェル複数本運用
- UI クライアントの予防的な細分割（機能変更に合わせた切り出しは可）
- Electron/Tauri を主配布にする／Docker をデスクトップ入口にする
- 依存完全同梱の巨大多 OS zip をデフォルトにする
- npm だけで一般ユーザー獲得を狙う
