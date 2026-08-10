# md-outlet

*Preferences for Markdown output — same source, your paper.*

**Languages:** [English](README.md) · [日本語](README.ja.md)

![Write, preview, and export PDF](docs/assets/ui.jpg)

*Left: page settings · Center: Markdown · Right: preview (same HTML as PDF)*

Preview and PDF often look different — a classic Markdown pain.  
md-outlet uses the **same HTML pipeline** for both, and keeps page preferences in a versioned `profile.yaml`.

**Recommended:** Windows + current Microsoft Edge (stable) + Node 18 LTS  
**Download (Windows zip):** [Releases](https://github.com/ApostolusNET/md-outlet/releases)  
**Getting started:** [docs/START.md](docs/START.md) · [日本語ガイド](docs/START.ja.md)  
**Syntax catalog:** [examples/kitchen-sink.en.md](examples/kitchen-sink.en.md) · [日本語](examples/kitchen-sink.md)  
**Sample:** [examples/sample.en.md](examples/sample.en.md) · [日本語サンプル](examples/sample.md)

| Casual reading (default) | Manual (page break per chapter) |
|:---:|:---:|
| ![Casual layout](docs/assets/layout-simple.jpg) | ![Manual layout](docs/assets/layout-manual.jpg) |

*Switching the template changes margins and heading page breaks.*

---

## Quick start

```bash
cd md-outlet
npm install
npx md-outlet ui          # no args → opens the start guide
```

- **Windows:** double-click `start-ui.bat`  
- **macOS / Linux:** `./start-ui.sh` (first time: `chmod +x start-ui.sh`)  
- In the UI, use the language control on the far right of the header (🇯🇵 / 🇺🇸)

```bash
# Open a specific Markdown file
npx md-outlet ui path/to/notes.md

# CLI PDF (optional)
npx md-outlet pdf examples/sample.md --profile default -o examples/sample.pdf
```

On Windows, run **`install-sendto.bat`** once in the install folder to open from Explorer (Send to → md-outlet).  
Re-run after moving or renaming the folder. If the UI is already running, a second launch / Send to adds a tab (max 3).

Linux is verified with Docker (Chromium) for CLI / PDF / tests. macOS is not verified yet.

| Doc | Contents |
|-----|----------|
| [SPEC.md](SPEC.md) | Specification (Japanese) |
| [schemas/profile-v1.json](schemas/profile-v1.json) | Profile schema |
| [LICENSE](LICENSE) | MIT (Copyright © 2026 I.C.A. Co., Ltd.) |

---

## Commands

| Command | Purpose |
|---------|---------|
| `md-outlet pdf <input.md>` | Export PDF (default: next to the input) |
| `md-outlet html <input.md>` | Intermediate HTML (same as preview) |
| `md-outlet preview <input.md>` | Local live preview |
| `md-outlet ui [input.md]` | Settings UI (recommended entry) |
| `md-outlet init <name>` | Generate a profile stub |

Common flags:

- `--profile, -p <name|path>` … built-in name (`default` / `ops-manual` / `simple-preview`) or YAML/JSON path
- `--output, -o <path>` … output path
- `--port <n>` … preview port (default 5757)

Temporary overrides (do not modify the profile file):

- `--format A4|A3|Letter|Legal`
- `--orientation portrait|landscape`
- `--margin 15mm` (or `--margin-top`, etc.)
- `--scale 0.9` (PDF only, 0.1–2.0)

Keep a block on one page when possible:

```html
<div class="keep-together">
...content...
</div>
```

### Front matter (per-document settings)

Put this at the top of a Markdown file. No separate profile needed for one-offs.

```markdown
---
md-outlet:
  extends: ops-manual
  page:
    orientation: landscape
    margin: { top: 15mm, right: 15mm, bottom: 15mm, left: 15mm }
---

# Title
```

Resolution order: **base profile → front matter → CLI overrides**.  
An explicit `--profile` wins over `extends`.

```bash
npx md-outlet pdf examples/sample-frontmatter.md -o examples/sample-frontmatter.pdf
```

### Initialize a profile

```bash
npx md-outlet init my-report
npx md-outlet init my-report --based-on ops-manual -o ./my-report.yaml
npx md-outlet init --list
npx md-outlet pdf doc.md --profile ./my-report.yaml
```

Existing files are not overwritten without `--force`.

### Settings UI

```bash
npx md-outlet ui
npx md-outlet ui path/to/README.md
npx md-outlet ui examples/sample.md --profile default -o ./my-report.yaml
npx md-outlet ui --no-open   # do not open a browser (CI, etc.)
```

Opens `http://127.0.0.1:5760/` by default. If a UI is already running, a second launch / Send to **adds a tab** (max 3; a 4th is rejected).

Layout:

- **Left** … paper, theme, H1 page breaks → **Save YAML**
- **Center** … **MD menu → Edit** for the Markdown editor
- **Right** … live preview (same HTML as PDF). Data docs show a scan view
- **Header** … MD menu (New / Open / Edit / Save / Close), Export PDF, Save YAML, Guide

Built-in files under `profiles/` are never overwritten (use `-o` for a new file).  
The UI is unbundled (`ui/index.html` + `ui/styles.css` + `ui/js/*.js`).

---

## Profiles

One file (`.yaml` / `.yml` / `.json`) describes output. Full field list: [SPEC.md](SPEC.md).

```yaml
version: 1
meta:
  name: my-profile
page:
  format: A4
  margin: { top: 20mm, right: 18mm, bottom: 20mm, left: 18mm }
theme: default
breaks:
  beforeHeadings: [h1]
  skipFirst: true
```

Built-ins:

- `simple-preview` … casual reading (UI default; no forced H1 page breaks)
- `default` … general documents
- `ops-manual` … operations manuals (cover + chapter per H1)

### Page breaks

You can combine these. The implementation avoids blank pages from double breaks.

- In Markdown: `<div class="page-break"></div>`
- In the profile: `breaks.beforeHeadings: [h1]` (first H1 can be skipped with `skipFirst`)

If an author-written break already sits before a heading, automatic injection is skipped.

---

## Themes

Place CSS at `themes/<name>/theme.css`. The bundled `default` theme fills in table borders, code backgrounds, and other pieces that often drop out in browser print.

Relative paths from the profile are allowed:

```yaml
theme: ./themes/paper/theme.css
```

---

## Design commitments

Guarantees the implementation aims to keep (details in SPEC):

1. Preview and PDF use the same generated HTML  
2. `theme: default` does not lose table borders or code backgrounds  
3. `breaks.beforeHeadings` injects real elements for Chromium PDF  
4. Profiles are validated against `schemas/profile-v1.json` before render  

---

## Development

```bash
npm install
npm run test:schema   # validate bundled profiles
npm run smoke         # sample PDF
npm test              # full suite
npm run cli -- pdf examples/sample.md
```
