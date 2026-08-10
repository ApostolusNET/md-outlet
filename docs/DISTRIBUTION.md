# md-outlet 配布方針

実装ロードマップではなく、**誰に・何を・どの順で配るか**の正本。  
技術変更（システムブラウザ PDF など）はここに書いた設計に沿って別タスクで入れる。

---

## 1. 本命の相手（確定）

| 優先 | 相手 | 入口 |
|------|------|------|
| **本命** | Windows の手元利用（自分／少人数／知り合い。ダブルクリック・「送る」） | 版付き zip → `start-ui.bat` / SendTo |
| **副** | 開発者・CI（OSS） | npm / `npx`（任意） |
| **後回し** | Node を頼めない一般大衆向けの製品インストーラ／ストア | 段階 3 以降 |

仮定しないこと: 「npm だけで一般ユーザーを獲得する」「Docker をデスクトップ入口にする」。

---

## 2. チャネル方針（確定）

1. **主チャネル:** Windows 向け **版付き zip**（フォルダ運用。設置先を動かさない）
2. **副チャネル:** **npm**（開発者・CI。UI／SendTo の本命にはしない）
3. **技術前提:** PDF は **システムの Edge/Chrome**（`puppeteer-core`）。Chromium 同梱 DL なし。説明には **推奨環境** を書く。
4. **当面やらない:** Electron/Tauri 主配布、Docker デスクトップ入口、依存完全同梱の巨大多 OS zip をデフォルトにする、npm のみ戦略

```text
段階1  Release zip（完了 — npm run pack / v0.2.0）
   ↓
段階2  システムブラウザ PDF（完了 — puppeteer-core）
   ↓
段階3  Node 同梱ポータブル zip か 簡易インストーラのどちらか一方（必要になったら）
```

### 推奨環境

| 項目 | 内容 |
|------|------|
| OS | Windows |
| ブラウザ | 最新の Microsoft Edge（安定版） |
| ランタイム | Node.js 18+（LTS 推奨） |

配布文・README・START に上記を載せる。ドキュメント上の前提は推奨環境とする。

### 動作確認の状況

| 環境 | 状況 |
|------|------|
| Windows + Edge | 実機（推奨環境） |
| **Linux** | **Docker（Chromium）で確認済み** — `npm test` + `npm run smoke`（`OK_LINUX_CHECKS`） |
| macOS | 未確認 |

Linux 確認時はホストの `node_modules` を汚さないよう、名前付きボリュームで隔離する（下記「Linux 確認手順」）。

---

## 3. 段階 1 — Release zip（完了）

### 目的

中身の技術は変えず、「どれを配ったか」「更新して」が言える状態にする。

### 成果物

| 項目 | 内容 |
|------|------|
| 置き場 | GitHub Releases（タグ `vX.Y.Z` ＝ `package.json` の `version`） |
| ファイル名例 | `md-outlet-X.Y.Z.zip` |
| ルート | 解凍すると `md-outlet/`（または `md-outlet-X.Y.Z/`）が1つ |

### zip に含める

`package.json` の `files` と揃える（実行に必要なソース＋起動スクリプト＋docs/examples）。

- `bin/`, `src/`, `schemas/`, `profiles/`, `themes/`, `dicts/`, `ui/`
- `examples/`, `docs/`（本ファイル含む）
- `start-ui.bat`, `start-ui.sh`, `start-ui-sendto.ps1`
- `install-sendto.bat`, `uninstall-sendto.bat`
- `SPEC.md`, `ROADMAP.md`, `README.md`, `LICENSE`, `package.json`, `package-lock.json`

### zip に含めない

| 除外 | 理由 |
|------|------|
| `node_modules/` | OS／CPU 差・肥大。利用者が `npm install`（または bat/sh） |
| Puppeteer の Chromium キャッシュ | 同上（段階 2 後は原則不要になる想定） |
| `*.pdf` 生成物、一時ファイル | 再現不要 |
| `scripts/_extract/`、`ui/js/_backup-*` | 開発残骸 |
| `.git/` | ソース配布でも Release zip には不要 |

### リリースノートに必ず書くこと

1. Node.js 18+（LTS 推奨）が必要
2. 初回はフォルダ内で `start-ui.bat` / `start-ui.sh`（内部で `npm install`）。**PDF 用 Chromium は取得しない**（システムの Edge を使用）
3. **推奨環境:** Windows + 最新 Edge（安定版）+ Node 18 LTS
4. Windows「送る」は設置後に `install-sendto.bat` を一度実行
5. **フォルダは好きな場所・名前で可。** 移動・リネーム・別場所への更新展開後、「送る」を使うなら **`install-sendto.bat` を再実行**
6. 更新手順: 旧フォルダを残すなら SendTo が古いパスを指いたままになる → 新フォルダで `install-sendto.bat`、不要なら旧フォルダ削除

### リリースノート文面（v0.2.0・貼り付け用）

```markdown
## md-outlet 0.2.0（軽い版）

Markdown を書いて、見たまま PDF にするローカルツールです。

### 必要環境（推奨）
- Windows
- 最新の Microsoft Edge（安定版）
- Node.js 18 以降（LTS 推奨）

### 使い方
1. zip を好きな場所に展開（フォルダ名は変更可）
2. `start-ui.bat` をダブルクリック（初回だけ `npm install`）
3. エクスプローラー「送る」を使う場合は、設置フォルダで `install-sendto.bat` を一度実行

### この版について
- PDF はシステムの Edge / Chrome を使います（別途 Chromium はダウンロードしません）
- フォルダを移動・リネーム・別場所へ更新展開したら、`install-sendto.bat` を再実行してください
- 詳しい手順: 展開後の `docs/START.md`

### 更新時
古いフォルダを残したまま新しい zip を別場所に置くと、「送る」が古いパスを指いたままになります。新しいフォルダで `install-sendto.bat` を実行し、不要なら旧フォルダを削除してください。
```

### zip の作り方（メンテナ）

```bash
npm run pack
# → dist/md-outlet-<version>.zip
```

### 利用者側の置き方

好きな場所・好きなフォルダ名で使える（ポータブル運用可）。

| 方針 | 内容 |
|------|------|
| 例 | `C:\Tools\md-outlet\`、`ドキュメント\apps\md-outlet` など |
| フォルダ名 | `md-outlet` 以外でも可。起動（`start-ui.bat`）はパス相対なので問題なし |
| 「送る」 | 登録時の絶対パスを覚える → **移動／改名／別フォルダへ更新したら `install-sendto.bat` 再実行** |
| 複数コピー | 同時常用しない（SendTo がどれを指すか不明になる） |
| 履歴 | `.md-outlet-recent.json` はツール隣。フォルダごと移すと履歴ファイルも一緒に動く。中の文書パスが消えていれば一覧から無効になる |

利用者向けの表は [START.md](START.md) の「設置」にも載せる（配布 zip に同梱）。

### npm 副チャネル（任意）

- 同じバージョンタグで `npm publish` してよい
- グローバル配置は SendTo と噛み合いにくい → README では **UI 本命は zip／フォルダ** と明記
- CI は `npx md-outlet pdf …` を想定

### 段階 1 でやらないこと

- インストーラ作成
- `node_modules` 同梱
- 自動更新チェッカー

---

## 4. 段階 2 — システム Edge / Chrome PDF（完了）

### 目的

配布形式を問わず、**初回の Chromium ダウンロードを不要**にする。

### 実装

[`src/resolve-browser.ts`](../src/resolve-browser.ts) で検出 → [`src/export-pdf.ts`](../src/export-pdf.ts) が `puppeteer-core` で起動。

1. `MD_OUTLET_BROWSER`（絶対パス）
2. `PUPPETEER_EXECUTABLE_PATH`
3. OS 上の安定チャネル Edge / Chrome（Windows は Edge 優先）
4. **見つからなければ明確なエラー**（同梱フォールバックなし）

依存は `puppeteer-core` のみ（ブラウザ DL なし）。

### 検出順

**Windows（推奨・本命）**

1. 環境変数 `MD_OUTLET_BROWSER`（絶対パス）
2. 環境変数 `PUPPETEER_EXECUTABLE_PATH`
3. Microsoft Edge の定番パス
4. Google Chrome の定番パス（次点）
5. 失敗 → 推奨環境とパス指定を案内するエラー

**macOS / Linux（推奨外）**

上記 env のあと、定番アプリパスまたは `PATH` 上の chrome / chromium / edge。  
**Linux:** Docker（Chromium）で CLI／PDF／既存テストを確認済み。  
**macOS:** 未確認。

### API／依存

| 項目 | 方針 |
|------|------|
| パッケージ | `puppeteer-core` |
| 起動 | `launch({ executablePath, headless: true, args: […] })` |
| 上書き | `MD_OUTLET_BROWSER` / `PUPPETEER_EXECUTABLE_PATH` |
| ログ | stderr に `PDF browser: …` 1 行 |
| テスト | `npm run test:browser` ＋既存 PDF テスト（検出可能なブラウザが必要） |
| ドキュメント | 推奨環境を記載する |

### 段階 2 でやらないこと

- Electron への PDF 寄せ
- 同梱 Chromium の再導入
- 全環境の動作を約束すること

---

## 5. 段階 3 — 必要になったら（メモのみ）

Node を一切頼めない相手が増えたとき、**どちらか一方**:

| 案 | 向くとき |
|----|----------|
| Node 同梱ポータブル zip（Windows） | 署名前・少人数・フォルダ運用の延長 |
| 簡易インストーラ（Inno 等） | 社内展開・ショートカット／SendTo を自動登録したい |

両方は作らない（更新経路が分裂する）。段階 2 完了後に再判断。

---

## 6. 迷ったときの基準

| 質問 | Yes | No |
|------|-----|-----|
| Node を頼めない相手に配る？ | 段階 3 | 段階 1–2 で足りる |
| 初回の数分・数百 MB がつらい？ | 段階 2 を先に | 段階 1 だけでも配れる |
| SendTo を売りにする？ | 設置先固定＋再登録手順を守る | npm グローバルでも可 |
| 更新を自分で追える少人数？ | zip 差し替え | インストーラ／winget を検討 |
| 開発者に見つけてもらいたい？ | npm を副で | Release zip のみで可 |

---

## 7. Linux 確認手順（Docker）

Docker Desktop（WSL2）想定。**ホストの `node_modules` はマウント共有しない**（Linux 用依存で Windows 側が壊れる）。

PowerShell（`md-outlet` フォルダで）:

```powershell
docker run --rm -it `
  -v "${PWD}:/work" `
  -v md-outlet-nm:/work/node_modules `
  -w /work `
  node:22-bookworm-slim `
  bash -lc @"
set -euo pipefail
apt-get update
apt-get install -y --no-install-recommends chromium fonts-noto-cjk ca-certificates
rm -rf /var/lib/apt/lists/*
npm ci
export MD_OUTLET_BROWSER=/usr/bin/chromium
npm test
npm run smoke
echo OK_LINUX_CHECKS
"@
```

成功の目安: 末尾に `OK_LINUX_CHECKS`。macOS はこの手順では確認できない。

---

## 関連

- 利用者向け設置: [START.md](START.md)
- 機能ロードマップ: [ROADMAP.md](../ROADMAP.md)
- npm に載せるパス一覧: [`package.json`](../package.json) の `files`
