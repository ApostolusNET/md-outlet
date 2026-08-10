# md-outlet Getting Started

*Write Markdown, preview it, export the same look as PDF — about 5 minutes*

**Languages:** [English](START.md) · [日本語](START.ja.md)

md-outlet is a **local Markdown editor + PDF export** tool.  
Preview in the browser while you write; PDF uses the same HTML pipeline.

---

## Requirements

**Recommended:**

- Windows
- Current Microsoft Edge (stable)
- [Node.js](https://nodejs.org/) 18+ (LTS recommended)

PDF uses **system Edge / Chrome** (no bundled Chromium download). Optional: `MD_OUTLET_BROWSER` = absolute path to the browser executable.  
**Linux** checked with Docker (Chromium). **macOS** not verified yet.

---

## 1. Install

Unpack anywhere (for example `C:\Tools\md-outlet\`). Renaming the folder is fine.

**Windows:** double-click `start-ui.bat` (runs `npm install` on first launch).  
**macOS / Linux:** `./start-ui.sh` (first time: `chmod +x start-ui.sh`).

Or manually:

```bash
cd (this folder)
npm install
```

If Node.js is missing, install **LTS** from [nodejs.org](https://nodejs.org/).

### Moving or renaming the folder

| Action | Effect |
|--------|--------|
| Move / unpack elsewhere | OK — start from that folder’s `start-ui.bat` |
| Rename folder | OK for launch |
| Using **Send to** | Re-run `install-sendto.bat` in the new location |
| Update into a new folder | Same — re-register Send to, then remove the old folder |

---

## 2. Launch

### Windows

Double-click **`start-ui.bat`**.

- Empty start screen with recent files
- Open the start guide anytime from the header **Guide** menu (language switch is on the far right)

### Terminal

```bash
npx md-outlet ui
```

Stop by closing the browser md-outlet tab (or `Ctrl+C` in the terminal / bat window).

Open a specific file:

```bash
npx md-outlet ui path/to/notes.md
```

### Windows “Send to”

1. Run **`install-sendto.bat`** once  
2. Right-click a file → **Send to** → **md-outlet**  

If the UI is already running, the file opens as a new tab (max 3).

---

## 3. First PDF

1. Open a file (recent list, **MD menu → Open / New**, or **Guide**)  
2. **MD menu → Edit**, change a little text  
3. Confirm the preview updates  
4. **Export PDF** → overwrite or save as  

For a longer walkthrough with screenshots, see the [Japanese start guide](START.ja.md).  
Syntax overview: [kitchen-sink.en.md](../examples/kitchen-sink.en.md) (also under **Guide** in the UI).

---

## Links

- [README (English)](../README.md) · [README (日本語)](../README.ja.md)
- [GitHub Releases](https://github.com/ApostolusNET/md-outlet/releases) (zip download)
