import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DOCS_DIR, EXAMPLES_DIR } from "./paths.js";
import { DEFAULT_LANG, t, type Lang } from "./i18n.js";

export interface LibraryDoc {
  id: string;
  label: string;
  /** Absolute path inside the package */
  path: string;
}

function startGuidePath(lang: Lang): string {
  if (lang === "ja") {
    const ja = resolve(DOCS_DIR, "START.ja.md");
    if (existsSync(ja)) return ja;
  }
  return resolve(DOCS_DIR, "START.md");
}

function sampleDocPath(lang: Lang): string {
  if (lang === "en") {
    const en = resolve(EXAMPLES_DIR, "sample.en.md");
    if (existsSync(en)) return en;
  }
  return resolve(EXAMPLES_DIR, "sample.md");
}

/** Built-in docs / samples shown in the UI Help menu. */
export function listLibraryDocs(lang: Lang = DEFAULT_LANG): LibraryDoc[] {
  const entries: LibraryDoc[] = [
    {
      id: "start",
      label: t(lang, "library.start"),
      path: startGuidePath(lang),
    },
    {
      id: "sample",
      label: t(lang, "library.sample"),
      path: sampleDocPath(lang),
    },
  ];
  return entries.filter((e) => existsSync(e.path));
}

/**
 * Default Markdown when `md-outlet ui` is launched with no file argument.
 * Prefers the start guide for the package default UI language.
 */
export function defaultUiMarkdownPath(): string {
  const start = startGuidePath(DEFAULT_LANG);
  if (existsSync(start)) return start;
  const sample = resolve(EXAMPLES_DIR, "sample.md");
  if (existsSync(sample)) return sample;
  const untitled = resolve(process.cwd(), "untitled.md");
  if (!existsSync(untitled)) {
    writeFileSync(
      untitled,
      "# Untitled\n\nOpen the **Guide** menu in the header for the start guide and samples.\n",
      "utf8"
    );
  }
  return untitled;
}
