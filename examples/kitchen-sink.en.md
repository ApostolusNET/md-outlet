# md-outlet syntax catalog (kitchen sink)

This file lists Markdown features that md-outlet supports.  
Open it from the header **Guide → Syntax catalog**.

```bash
npx md-outlet ui
```

---

## Headings

# Heading 1 (H1)

## Heading 2 (H2)

### Heading 3 (H3)

#### Heading 4 (H4)

---

## Paragraphs and emphasis

A normal paragraph. Blank lines separate paragraphs.

**Bold**, *italic*, ***bold italic***, ~~strikethrough~~, `inline code`.

A hard rule is `---` as above.

---

## Lists

Bullet list:

- Apple
- Orange
  - Early
  - Late
- Grape

Numbered:

1. Draft
2. Check preview
3. Export PDF

Task list (GFM):

- [x] Read the start guide
- [ ] Export kitchen-sink as PDF
- [ ] Open your own notes

---

## Blockquote

> Markdown is the source.  
> Look-and-feel belongs to the profile.

---

## Links

- [md-outlet README](../README.md)
- <https://example.com>

Autolink: https://example.com/docs

---

## Tables

| Feature | Example | PDF |
|---------|---------|-----|
| Table | This table | Borders remain |
| Code | Block below | Background remains |
| Page break | Page break | Chapter splits |

Alignment:

| Left | Center | Right |
|:-----|:------:|------:|
| L | C | R |
| Long cell | mid | 100 |

---

## Code

Inline like `const x = 1`.

Fenced (with language):

```ts
export function greet(name: string): string {
  return `Hello, ${name}!`;
}
```

No language:

```
plain text block
line 2
```

---

## Other GFM

URL-looking autolink: https://example.com/docs

Emoji (depends on the environment): ✨ 📄 ✅

---

## md-outlet extras (pagination)

### Manual page break

The page splits right after this block.

<div class="page-break"></div>

### After the break

This section comes after the page break.

### Keep together

<div class="keep-together">

#### Prefer keeping this block on one page

| Item | Value |
|------|-------|
| A | 1 |
| B | 2 |
| C | 3 |

Use this when you do not want a table to split alone onto the next page.

</div>

In the editor, use the **Page break** / **Keep together** buttons.

---

## HTML (when allowed)

When HTML is allowed in the profile (default: allowed):

<p style="color:#0b5fff">Inline HTML paragraph example</p>

---

## Next

**Export PDF** on this file to compare preview and paper at once.  
Then return via **Guide → Getting started** and open your own `.md`.
