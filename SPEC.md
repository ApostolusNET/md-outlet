# md-outlet Profile Spec v1

Status: Draft (Stable within v1 minor)
Schema: [`schemas/profile-v1.json`](schemas/profile-v1.json)

## 目的

同じ Markdown ソースから、同じ PDF／プレビューを **再現可能に** 生成するための
「好み」の契約を定義する。プロファイルは 1 ファイルで自己完結し、
バージョン管理・共有・持ち運びができる。

- ソースは Markdown。プロファイルは出力の見た目・改ページ・紙面のみを扱う。
- プレビューと PDF は **同一 HTML パイプライン** を通ること（実装制約）。

## ファイル形式

- 拡張子: `.yaml` / `.yml` / `.json`
- 文字コード: UTF-8
- キーは lowerCamelCase または snake_case のどちらか一貫させる（実装は両方受理する）。

## 最小プロファイル

```yaml
version: 1
meta:
  name: default
page:
  format: A4
  margin: { top: 20mm, right: 18mm, bottom: 20mm, left: 18mm }
theme: default
```

## フィールド定義

### `version` (required)

- 型: integer
- 値: `1`
- v1 以外は明示エラーで停止する（前方互換ではなく厳格）。

### `meta` (required)

| キー | 型 | 必須 | 説明 |
|------|----|------|------|
| `name` | string | ✅ | プロファイル ID。ファイル名と一致推奨 |
| `description` | string | | 用途の一行説明 |
| `authors` | string[] | | 作者・所属 |

### `page` (required)

| キー | 型 | 既定 | 説明 |
|------|----|------|------|
| `format` | enum(`A4`,`A3`,`Letter`,`Legal`) | `A4` | 用紙サイズ |
| `orientation` | enum(`portrait`,`landscape`) | `portrait` | 向き |
| `margin.top` \| `right` \| `bottom` \| `left` | CSS length | 上下 `20mm` / 左右 `18mm` | 余白 |
| `printBackground` | boolean | `true` | 背景色・罫線を印刷に含めるか |
| `scale` | number (0.1–2.0) | `1` | **PDF のみ**の全体スケール。HTML／プレビューでは無視 |

### 本文ユーティリティ（テーマ契約）

組み込み `default` テーマは次のクラスを保証する。

| クラス | 効果 |
|--------|------|
| `page-break` / `md-outlet-page-break` | 直後で改ページ |
| `keep-together` | 可能な限りブロック途中で切らない（best-effort。紙面より大きい塊は分割され得る） |

例:

```html
<div class="keep-together">

## この節は途中で切らない

| a | b |
|---|---|
| 1 | 2 |

</div>
```

### CLI 上書き（実装層・SPEC 互換）

プロファイルを正本としつつ、実行時に紙面だけ試すための CLI 上書きを許可する。
上書きはプロファイルファイルを変更しない。永続化は YAML 保存または将来の UI で行う。

| フラグ | 対応フィールド |
|--------|----------------|
| `--format` | `page.format` |
| `--orientation` | `page.orientation` |
| `--margin` | 四辺まとめて `page.margin.*` |
| `--margin-top` 等 | `page.margin.*` |
| `--scale` | `page.scale`（PDF のみ） |

### Front matter（Phase 2）

Markdown 冒頭の YAML front matter に `md-outlet:` ブロックを置ける。
文書と設定を **1 ファイルで配布** するための手段。レンダ時に本文から除去される。

```markdown
---
md-outlet:
  extends: ops-manual
  page:
    orientation: landscape
    margin: { top: 15mm, right: 15mm, bottom: 15mm, left: 15mm }
  breaks:
    beforeHeadings: [h1]
    skipFirst: true
---

# 本文
```

| キー | 意味 |
|------|------|
| `extends` | ベースにするプロファイル名／パス（任意）。`profile` も同義で受理 |
| その他 | Profile Spec の部分フィールド（`page` / `theme` / `breaks` / `markdown` / `bodyClass` / `meta`） |

**解決順（低 → 高）:**

1. ベースプロファイル  
   - `--profile` を明示した場合 → その値  
   - 未明示で `extends` がある場合 → `extends`  
   - それ以外 → `--profile` の既定（`default`）
2. front matter の部分上書き（`extends` 以外を deep-merge）
3. CLI 上書き（`--format` 等）

`--profile` 明示時は `extends` より CLI が勝つ（コマンドライン意図を優先）。

### `md-outlet init`（Phase 3）

既存プロファイルをコピーして、編集可能な新しいプロファイルファイルを作る。

```bash
md-outlet init <name> [--based-on <profile>] [-o <path>] [--force]
md-outlet init --list
```

| 項目 | 内容 |
|------|------|
| `<name>` | 新プロファイルの `meta.name`（英字始まり、英数・`-`・`_`） |
| `--based-on` | コピー元（既定 `default`）。組み込み名またはパス |
| `-o` | 出力パス（既定 `./<name>.yaml`） |
| `--force` | 既存ファイルを上書き |
| `--list` | 組み込みプロファイル一覧 |

生成物は Profile Spec v1 準拠の YAML（または `.json`）。コメント付きで、すぐ `--profile` に渡せる。

組み込みプロファイル:

| 名前 | 用途 |
|------|------|
| `simple-preview` | 気軽な閲覧用。H1 強制改ページなし。**`ui` の既定** |
| `default` | 一般文書 |
| `ops-manual` | 運用マニュアル（表紙＋ H1 で章立て） |

### UI レイアウト（一本化）

テンプレートを変えても画面構成は同じです。

- 左: 設定（常時表示）
- 右: プレビュー
- **Edit MD**: 中央にエディタを開く

```bash
md-outlet ui
```

### `md-outlet ui`（Phase 4）

ローカル設定画面。YAML の編集フロントエンド（別ストアを持たない）。

```bash
md-outlet ui [input.md] [--profile <name|path>] [-o <save.yaml>] [--port 5760] [--simple]
```

| 項目 | 内容 |
|------|------|
| 既定起動 | `md-outlet ui`（引数なし可）。ファイルなしなら空／最近一覧から開始可 |
| Windows 起動 | `start-ui.bat` / SendTo（`install-sendto.bat` → `start-ui-sendto.ps1`） |
| macOS / Linux 起動 | `start-ui.sh`（同上。初回 `chmod +x`） |
| ガイドメニュー | スタートガイド / サンプル文書 |
| 文書タブ | 最大 3（path / kind / text）。紙面設定は全タブ共有。4 つ目は拒否 |
| 単一インスタンス | 既定ポートで UI 稼働中なら、追加起動は既存へ `/api/tabs/open`（送るも同じ） |
| レイアウト | 設定常時＋プレビュー。ヘッダー下にタブバー。Edit MD でエディタ |
| 左パネル | 用紙・向き・余白・scale・テーマ・H1改ページ → Save YAML |
| 中央パネル | Markdown 編集（Edit MD で表示）→ Page break / Keep together、Save MD |
| 右パネル | 同一 HTML パイプラインのライブプレビュー（データ文書はスキャン表示） |
| New MD | パス指定で新規作成（既存なら確認／タブ満杯なら拒否）。作成後に編集ペインを開く |
| Open MD | タブに追加または既存タブをアクティブ（満杯かつ新規 path は拒否） |
| Save MD | **上書き保存** / **別名で保存**（アクティブな Markdown のみ） |
| Export PDF | **上書き保存** / **別名で保存**（アクティブな Markdown のみ） |
| ブラウザ | 起動時に自動で開く（`--no-open` で抑制）。ブラウザタブ閉鎖でサーバ終了 |
| 保護 | パッケージ同梱の `profiles/` は上書き拒否 |

### UI クライアント構成（Phase 4c）

バンドラなし。静的配信は UI サーバ（`styles.css` / `js/*`、パスサンドボックス、`no-store`）。

| パス | 役割 |
|------|------|
| `ui/index.html` | マークアップのみ |
| `ui/styles.css` | 画面 CSS |
| `ui/js/dom.js` | `$` / toast |
| `ui/js/notes.js` | 文書メモ |
| `ui/js/tabs.js` | タブ／handoff |
| `ui/js/browse.js` | フォルダ一覧ピッカー |
| `ui/js/shortcuts.js` | ショートカット／検索 |
| `ui/js/profile-form.js` | 用紙・テーマ・YAML／ひな形 |
| `ui/js/preview.js` | プレビュー・LOG フィルタ |
| `ui/js/app.js` | 起動・配線・文書操作の残り |

モジュール間は共有ストアを持たず `bind*(api)` で配線する。`app.js` の追加分割は、当該塊を変更するタイミングでのみ行う（予防的な細分化はしない）。

### `theme` (required)

- 型: string
- 意味:
  - 組み込みテーマ名（例: `default`）
  - または プロファイルファイルからの相対パス（例: `./themes/paper/theme.css`）
  - 組み込みテーマは表罫線・コード背景・本文タイポを保証する（本 SPEC の再現要件）。

### `breaks` (optional)

改ページ規則。プロファイルで宣言する。本文に手書きの `<div class="page-break">` があれば尊重する。

| キー | 型 | 既定 | 説明 |
|------|----|------|------|
| `beforeHeadings` | string[] (`h1`〜`h6`) | `[]` | 指定した見出しの直前で改ページ。`h1` のみ指定で文書内の `h1` が 2 未満のときは実装が `h2` にフォールバック（単一タイトル＋`##` 章の文書向け） |
| `skipFirst` | boolean | `true` | 文書先頭の見出しでは改ページしない（表紙用途） |
| `avoidInside` | string[] | `["pre","table","blockquote"]` | 途中で切らない要素 |
| `avoidAfter` | string[] | `["h2","h3","h4"]` | 直後で切らない要素（見出しと本文の分離防止） |

実装は HTML 生成時に「確実な改ページノード」（`page-break-after: always` を持つ要素）を
注入する。CSS の `break-before` のみに依存してはならない。

**冪等性（Idempotency, v1 必須）:**
対象見出しの直前に、書き手が明示的に配置した改ページ要素
（`<div class="page-break">` または `<div class="md-outlet-page-break">`）が
既に存在する場合、実装は **追加の注入を行ってはならない**。
これにより「H1 で章を切る」プロファイルと、
本文に手書きの改ページを持つ MD が同時に指定されても、
空ページが発生しない。

### `markdown` (optional)

| キー | 型 | 既定 | 説明 |
|------|----|------|------|
| `gfm` | boolean | `true` | GitHub Flavored Markdown |
| `highlight` | boolean | `true` | コードハイライト |
| `highlightStyle` | string | `github` | highlight.js のスタイル名 |
| `allowHtml` | boolean | `true` | 生 HTML を許可（`<div class="page-break">` の受理に必要） |

### `bodyClass` (optional)

- 型: string[]
- 用途: テーマ CSS の切り替え用フック。`<body>` に付与する。

## 予約（Reserved for v2+）

以下は v1 では未実装だが、フィールド名を予約する。未知フィールドは v1 実装では警告扱いで無視する。

- `toc`: 目次生成
- `header` / `footer`: ヘッダ・フッタ（ページ番号・タイトル）
- `watermark`: 透かし
- `cover`: 表紙テンプレート
- `assets`: 画像・フォント同梱ポリシー

## 互換ポリシー

- 未知フィールド: v1 実装では **警告して無視**（前方互換のため）。
- `version` 不一致: エラーで停止。
- キー命名（camel/snake）: 実装は両受理するが、公式サンプルは lowerCamelCase を採用。
- テーマの CSS API（クラス名など）は v1 では **契約しない**。テーマは丸ごと差し替える単位。

## 実装制約（Conformance）

準拠実装は次を満たすこと。

1. プレビュー出力と PDF 出力は同一の HTML から生成される。
2. `theme: default` を選択したとき、表罫線・コード背景・本文タイポが失われない。
3. `breaks.beforeHeadings` の指定は Chromium 系の PDF 生成でも実効すること
   （必要なら DOM に改ページノードを注入して保証する）。
4. 対象見出しの直前に手書きの改ページ要素がある場合、追加注入をしない
   （二重改ページによる空ページの禁止）。
5. プロファイル読み込みは JSON Schema [`schemas/profile-v1.json`](schemas/profile-v1.json)
   に対して validate 通過を必須とする。
