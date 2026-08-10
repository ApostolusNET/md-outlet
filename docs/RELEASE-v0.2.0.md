# md-outlet 0.2.0（軽い版）

GitHub Release 本文、または zip 同梱の案内として使えます。  
成果物: `npm run pack` → `dist/md-outlet-0.2.0.zip`

## 必要環境（推奨）

- Windows
- 最新の Microsoft Edge（安定版）
- Node.js 18 以降（LTS 推奨）

## 使い方

1. zip を好きな場所に展開（フォルダ名は変更可）
2. `start-ui.bat` をダブルクリック（初回だけ `npm install`）
3. エクスプローラー「送る」を使う場合は、設置フォルダで `install-sendto.bat` を一度実行

## この版について

- PDF はシステムの Edge / Chrome を使います（別途 Chromium はダウンロードしません）
- フォルダを移動・リネーム・別場所へ更新展開したら、`install-sendto.bat` を再実行してください
- 詳しい手順: 展開後の `docs/START.md`

## 更新時

古いフォルダを残したまま新しい zip を別場所に置くと、「送る」が古いパスを指いたままになります。新しいフォルダで `install-sendto.bat` を実行し、不要なら旧フォルダを削除してください。
