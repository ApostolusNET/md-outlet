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
function describeRoot(root: unknown, lang: Lang): string {
  if (root === null) return "(null)";
  if (Array.isArray(root)) {
    return t(lang, "scan.rootArray", { n: root.length });
  }
  if (isObject(root)) {
    return t(lang, "scan.rootObject", { n: Object.keys(root).length });
  }
  return `(${typeof root})`;
}

function formatScalar(v: unknown, lang: Lang): string {
  if (v === null) return "null";
  if (v === undefined) return t(lang, "scan.undefined");
  if (typeof v === "string") {
    if (v === "") return t(lang, "scan.emptyString");
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
  value: unknown,
  lang: Lang
): void {
  const pad = "  ".repeat(indent);
  if (isObject(value)) {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      lines.push(`${pad}${key}: ${t(lang, "scan.emptyObject")}`);
      return;
    }
    lines.push(`${pad}■ ${key}`);
    renderObject(value, indent + 1, lines, lang);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      lines.push(`${pad}${key}: ${t(lang, "scan.emptyArray")}`);
      return;
    }
    renderArray(key, value, indent, lines, lang);
    return;
  }
  const s = formatScalar(value, lang);
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
  lines: string[],
  lang: Lang
): void {
  for (const key of Object.keys(obj)) {
    pushKeyValue(lines, indent, key, obj[key], lang);
  }
}

function renderArray(
  key: string,
  arr: unknown[],
  indent: number,
  lines: string[],
  lang: Lang
): void {
  const pad = "  ".repeat(indent);
  const total = arr.length;
  const element = t(lang, "scan.element");
  for (let i = 0; i < arr.length; i += 1) {
    const label = `${key} (${i + 1}/${total})`;
    const item = arr[i];
    if (isObject(item)) {
      const keys = Object.keys(item);
      if (keys.length === 0) {
        lines.push(`${pad}${label}: ${t(lang, "scan.emptyObject")}`);
        continue;
      }
      lines.push(`${pad}■ ${label}`);
      renderObject(item, indent + 1, lines, lang);
      continue;
    }
    if (Array.isArray(item)) {
      if (item.length === 0) {
        lines.push(`${pad}${label}: ${t(lang, "scan.emptyArray")}`);
        continue;
      }
      lines.push(`${pad}■ ${label}`);
      renderArray(element, item, indent + 1, lines, lang);
      continue;
    }
    const s = formatScalar(item, lang);
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
      t(lang, "scan.parseFail", { label }),
      t(lang, "scan.reason", { reason }),
      "",
      raw.trim(),
      "",
    ].join("\n");
  }

  const reportKey =
    kind === "json" ? "scan.report.json" : "scan.report.yaml";
  const rootDesc = describeRoot(root, lang);
  const lines: string[] = [
    t(lang, reportKey),
    t(lang, "scan.file", { name: fileLabel }),
    t(lang, "scan.root", { name: rootDesc }),
    "",
  ];

  if (root === null || root === undefined) {
    lines.push(formatScalar(root, lang));
  } else if (Array.isArray(root)) {
    renderArray(t(lang, "scan.element"), root, 0, lines, lang);
  } else if (isObject(root)) {
    renderObject(root, 0, lines, lang);
  } else {
    lines.push(formatScalar(root, lang));
  }

  lines.push("");
  return lines.join("\n");
}
