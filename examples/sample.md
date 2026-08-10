# md-outlet Sample Document

このサンプルは md-outlet の基本要素を含みます。表・コードブロック・引用・複数の H1 を持つ構成で、
プロファイルとテーマの再現性を確認できます。

同じ Markdown・同じプロファイルからは、同じ PDF が得られることを目的にしています。

# 1. 表とコード

## 1.1 表

| 種類 | 用途 | 備考 |
|------|------|------|
| default | 一般文書 | A4 縦、H1 改ページなし |
| ops-manual | 運用マニュアル | H1 で章を切る |

## 1.2 コード

```ts
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

## 1.3 引用

> 好みを保存できる出力レイヤが標準化されれば、
> Markdown は「メモ」から「配布できる文書のソース」に化ける。

# 2. 改ページの扱い

- プロファイルで `breaks.beforeHeadings: [h1]` を指定すると、章立てが分かれます。
- 本文中の `<div class="page-break"></div>` は常に尊重されます。

<div class="page-break"></div>

## 2.1 手書き改ページ後

このセクションは手書き改ページ直後です。
<div class="page-break"></div>

# 3. 品質チェック

## まとめて切らない例

<div class="keep-together">

| 項目 | 状態 |
|------|------|
| 表罫線 | 残っていること |
| コード背景 | 残っていること |
| keep-together | この表ごと途中で切れないこと |

</div>

- [ ] 表罫線が残っている
- [ ] コード背景が残っている
- [ ] リンクが読める色である
- [ ] 見出しと本文の間が離れすぎていない
