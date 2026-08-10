---
md-outlet:
  extends: ops-manual
  page:
    orientation: landscape
    margin:
      top: 15mm
      right: 15mm
      bottom: 15mm
      left: 15mm
    scale: 0.95
---

# Front Matter Sample

この文書は **front matter だけで** 紙面設定を同梱しています。
別プロファイルファイルは不要です（`extends: ops-manual` をベースに上書き）。

# 1. 何が効いているか

| 項目 | 値 |
|------|----|
| ベース | ops-manual（H1 で章立て） |
| 向き | landscape |
| 余白 | 15mm |
| スケール | 0.95（PDF のみ） |

# 2. 解決順

1. `extends`（または `--profile`）でベースを読む
2. front matter の `page` / `breaks` などをマージ
3. CLI の `--orientation` などが最後に勝つ

```bash
# front matter どおり
md-outlet pdf examples/sample-frontmatter.md

# CLI が勝つ例（縦に戻す）
md-outlet pdf examples/sample-frontmatter.md --orientation portrait
```
