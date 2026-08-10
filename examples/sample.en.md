# md-outlet Sample Document

This sample covers the basics of md-outlet: tables, code blocks, quotes, and multiple H1 sections so you can check that profiles and themes reproduce consistently.

Same Markdown + same profile should yield the same PDF.

# 1. Tables and code

## 1.1 Table

| Kind | Use | Notes |
|------|-----|-------|
| default | General document | A4 portrait, no H1 page breaks |
| ops-manual | Operations manual | Split chapters on H1 |

## 1.2 Code

```ts
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

## 1.3 Quote

> When a preference-aware output layer is standardized,
> Markdown stops being “just notes” and becomes a source for shareable documents.

# 2. Page breaks

- Set `breaks.beforeHeadings: [h1]` in the profile to split by chapter.
- Inline `<div class="page-break"></div>` is always honored.

<div class="page-break"></div>

## 2.1 After a manual page break

This section starts right after a handwritten page break.
<div class="page-break"></div>

# 3. Quality checks

## Keep-together example

<div class="keep-together">

| Item | Expectation |
|------|-------------|
| Table borders | Still visible |
| Code background | Still visible |
| keep-together | This table should not split mid-way |

</div>

- [ ] Table borders remain
- [ ] Code background remains
- [ ] Links use a readable color
- [ ] Heading and body spacing is not too loose
