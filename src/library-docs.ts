import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DOCS_DIR, EXAMPLES_DIR, PKG_ROOT } from "./paths.js";

export interface LibraryDoc {
  id: string;
  label: string;
  /** Absolute path inside the package */
  path: string;
}

/** Built-in docs / samples shown in the UI Help menu. */
export function listLibraryDocs(): LibraryDoc[] {
  const entries: LibraryDoc[] = [
    {
      id: "start",
      label: "スタートガイド",
      path: resolve(DOCS_DIR, "START.md"),
    },
    {
      id: "sample",
      label: "サンプル文書",
      path: resolve(EXAMPLES_DIR, "sample.md"),
    },
  ];
  return entries.filter((e) => existsSync(e.path));
}

/**
 * Default Markdown when `md-outlet ui` is launched with no file argument.
 * Prefers the Japanese start guide inside the package.
 */
export function defaultUiMarkdownPath(): string {
  const start = resolve(DOCS_DIR, "START.md");
  if (existsSync(start)) return start;
  const sample = resolve(EXAMPLES_DIR, "sample.md");
  if (existsSync(sample)) return sample;
  const untitled = resolve(process.cwd(), "untitled.md");
  if (!existsSync(untitled)) {
    writeFileSync(
      untitled,
      "# Untitled\n\nヘッダーの **ガイド** メニューからスタートガイドやサンプルを開けます。\n",
      "utf8"
    );
  }
  return untitled;
}

export function packageRoot(): string {
  return PKG_ROOT;
}
