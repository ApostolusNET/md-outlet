/**
 * Per-document scratch notes stored as a sidecar next to the source file
 * (never written into the Markdown/XML itself).
 *
 * Example: report.md → report.md.md-outlet-note.json
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

export const NOTE_SIDECAR_SUFFIX = ".md-outlet-note.json";

export type DocNoteRecord = {
  version: 1;
  /** Absolute path of the document this note belongs to */
  path: string;
  text: string;
  updatedAt: string;
};

function normalizeDocPath(p: string): string {
  const raw = String(p || "").trim();
  if (!raw) return "";
  return isAbsolute(raw) ? resolve(raw) : resolve(process.cwd(), raw);
}

/** Sidecar path beside the document (portable with the folder). */
export function noteFileForPath(docPath: string): string | null {
  const abs = normalizeDocPath(docPath);
  if (!abs) return null;
  return abs + NOTE_SIDECAR_SUFFIX;
}

export function readDocNote(docPath: string): { path: string; text: string } {
  const abs = normalizeDocPath(docPath);
  if (!abs) return { path: "", text: "" };
  const file = noteFileForPath(abs);
  if (!file || !existsSync(file)) return { path: abs, text: "" };
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as Partial<DocNoteRecord>;
    if (typeof raw.text !== "string") return { path: abs, text: "" };
    return { path: abs, text: raw.text };
  } catch {
    return { path: abs, text: "" };
  }
}

export function writeDocNote(docPath: string, text: string): { path: string; text: string } {
  const abs = normalizeDocPath(docPath);
  if (!abs) throw new Error("NO_DOC_PATH");
  const file = noteFileForPath(abs);
  if (!file) throw new Error("NO_DOC_PATH");
  mkdirSync(dirname(file), { recursive: true });
  const record: DocNoteRecord = {
    version: 1,
    path: abs,
    text: String(text ?? ""),
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(file, JSON.stringify(record, null, 2) + "\n", "utf8");
  return { path: abs, text: record.text };
}
