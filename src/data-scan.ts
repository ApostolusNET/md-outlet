/**
 * JSON / YAML → human-scannable text report.
 *
 * Goal: a readable dump of structure (not a form reconstruction).
 * - object → `■ key` + children
 * - array → enumerate as `key (i/n)`
 * - scalar → `key: value`
 * - parse failure → reason + raw text
 */

import { parse as parseYaml } from "yaml";
import { DEFAULT_LANG, t, type Lang } from "./i18n.js";

export type DataKind = "json" | "yaml";

const KIND_LABEL: Record<DataKind, string> = {
  json: "JSON",
  yaml: "YAML",
};

function parseData(kind: DataKind, raw: string): unknown {
  const src = raw.replace(/^\uFEFF/, "");
  if (kind === "json") return JSON.parse(src);
  return parseYaml(src);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Root descriptor for the header line. */
function describeRoot(root: unknown): string {
  if (root === null) return "(null)";
  if (Array.isArray(root)) return `(array, ${root.length} 件)`;
  if (isObject(root)) return `(object, ${Object.keys(root).length} キー)`;
  return `(${typeof root})`;
}

function formatScalar(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "（未定義）";
  if (typeof v === "string") {
    if (v === "") return "（空文字）";
    return v;
  }
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return String(v);
    return String(v);
  }
  if (typeof v === "bigint") return v.toString();
  return String(v);
}

function pushKeyValue(
  lines: string[],
  indent: number,
  key: string,
  value: unknown
): void {
  const pad = "  ".repeat(indent);
  if (isObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      lines.push(`${pad}${key}: {} （空）`);
      return;
    }
    lines.push(`${pad}■ ${key}`);
    renderObject(value, indent + 1, lines);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(`${pad}${key}: [] （空）`);
      return;
    }
    renderArray(key, value, indent, lines);
    return;
  }
  const s = formatScalar(value);
  if (typeof value === "string" && value.includes("\n")) {
    lines.push(`${pad}${key}:`);
    for (const line of splitLines(value)) {
      lines.push(`${pad}  ${line}`);
    }
    return;
  }
  lines.push(`${pad}${key}: ${s}`);
}

function splitLines(text: string): string[] {
  const parts = text.split(/\r?\n/);
  while (parts.length && parts[parts.length - 1] === "") parts.pop();
  return parts;
}

function renderObject(
  obj: Record<string, unknown>,
  indent: number,
  lines: string[]
): void {
  for (const key of Object.keys(obj)) {
    pushKeyValue(lines, indent, key, obj[key]);
  }
}

function renderArray(
  key: string,
  arr: unknown[],
  indent: number,
  lines: string[]
): void {
  const pad = "  ".repeat(indent);
  const total = arr.length;
  for (let i = 0; i < arr.length; i += 1) {
    const label = `${key} (${i + 1}/${total})`;
    const item = arr[i];
    if (isObject(item)) {
      const keys = Object.keys(item);
      if (keys.length === 0) {
        lines.push(`${pad}${label}: {} （空）`);
        continue;
      }
      lines.push(`${pad}■ ${label}`);
      renderObject(item, indent + 1, lines);
      continue;
    }
    if (Array.isArray(item)) {
      if (item.length === 0) {
        lines.push(`${pad}${label}: [] （空）`);
        continue;
      }
      lines.push(`${pad}■ ${label}`);
      renderArray("(要素)", item, indent + 1, lines);
      continue;
    }
    const s = formatScalar(item);
    if (typeof item === "string" && item.includes("\n")) {
      lines.push(`${pad}${label}:`);
      for (const line of splitLines(item)) {
        lines.push(`${pad}  ${line}`);
      }
      continue;
    }
    lines.push(`${pad}${label}: ${s}`);
  }
}

/** Build a scannable plain-text report from JSON/YAML source. */
export function buildDataScanReport(
  kind: DataKind,
  raw: string,
  fileLabel: string,
  lang: Lang = DEFAULT_LANG
): string {
  const label = KIND_LABEL[kind];
  let root: unknown;
  try {
    root = parseData(kind, raw);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    return [
      `${label} を解釈できませんでした（生テキストを下に表示します）`,
      `理由: ${reason}`,
      "",
      raw.trim(),
      "",
    ].join("\n");
  }

  const reportKey =
    kind === "json" ? "scan.report.json" : "scan.report.yaml";
  const lines: string[] = [
    t(lang, reportKey) || `${label} スキャン表示`,
    t(lang, "scan.file", { name: fileLabel }) || `ファイル: ${fileLabel}`,
    t(lang, "scan.root", { name: describeRoot(root) }) ||
      `ルート: ${describeRoot(root)}`,
    "",
  ];

  if (root === null || root === undefined) {
    lines.push(formatScalar(root));
  } else if (Array.isArray(root)) {
    renderArray("(要素)", root, 0, lines);
  } else if (isObject(root)) {
    renderObject(root, 0, lines);
  } else {
    lines.push(formatScalar(root));
  }

  lines.push("");
  return lines.join("\n");
}
