import { extname } from "node:path";
import { buildXmlScanReport } from "./xml-scan.js";
import { buildDataScanReport } from "./data-scan.js";
import { buildPlainDataScanReport } from "./text-scan.js";
import { DEFAULT_LANG, t, type Lang } from "./i18n.js";

export type DocKind =
  | "md"
  | "xml"
  | "json"
  | "yaml"
  | "txt"
  | "log"
  | "csv"
  | "unknown";

/** Kinds displayed as a read-only "scan" (no edit / no PDF). */
export type DataDocKind = Exclude<DocKind, "md" | "unknown">;

const MD_EXT = /\.(md|markdown)$/i;
const XML_EXT = /\.xml$/i;
const JSON_EXT = /\.json$/i;
const YAML_EXT = /\.ya?ml$/i;
const TXT_EXT = /\.txt$/i;
const LOG_EXT = /\.log$/i;
const CSV_EXT = /\.(csv|tsv)$/i;

export function isMarkdownPath(p: string): boolean {
  return MD_EXT.test(p);
}

export function isXmlPath(p: string): boolean {
  return XML_EXT.test(p);
}

export function isJsonPath(p: string): boolean {
  return JSON_EXT.test(p);
}

export function isYamlPath(p: string): boolean {
  return YAML_EXT.test(p);
}

export function isTxtPath(p: string): boolean {
  return TXT_EXT.test(p);
}

export function isLogPath(p: string): boolean {
  return LOG_EXT.test(p);
}

export function isCsvPath(p: string): boolean {
  return CSV_EXT.test(p);
}

/** Structured / plain data docs — scan-only (no edit / no PDF). */
export function isDataDocPath(p: string): boolean {
  return (
    isXmlPath(p) ||
    isJsonPath(p) ||
    isYamlPath(p) ||
    isTxtPath(p) ||
    isLogPath(p) ||
    isCsvPath(p)
  );
}

/** Paths the UI may open as a document (md + data docs). */
export function isOpenableDocPath(p: string): boolean {
  return isMarkdownPath(p) || isDataDocPath(p);
}

export function detectDocKind(p: string | null | undefined): DocKind {
  if (!p) return "unknown";
  if (isXmlPath(p)) return "xml";
  if (isJsonPath(p)) return "json";
  if (isYamlPath(p)) return "yaml";
  if (isCsvPath(p)) return "csv";
  if (isLogPath(p)) return "log";
  if (isTxtPath(p)) return "txt";
  if (isMarkdownPath(p)) return "md";
  return "unknown";
}

/** True when the active document is a scan-only data view. */
export function isDataDocKind(kind: DocKind | undefined | null): boolean {
  return (
    kind === "xml" ||
    kind === "json" ||
    kind === "yaml" ||
    kind === "txt" ||
    kind === "log" ||
    kind === "csv"
  );
}

/**
 * Normalize a user-supplied open path.
 * - known openable ext: keep as-is
 * - bare name without known ext: append .md (legacy open behavior)
 */
export function normalizeOpenDocPath(requested: string): string {
  const raw = requested.trim();
  if (!raw) return raw;
  if (isOpenableDocPath(raw)) return raw;
  const ext = extname(raw);
  if (ext) return raw;
  return raw + ".md";
}

/** Light indent pretty-print (fallback / phase0). */
export function prettyXmlText(raw: string): string {
  const trimmed = raw.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return "";
  if (/\n\s+</.test(trimmed) && trimmed.split("\n").length > 3) {
    return trimmed;
  }
  const compact = trimmed.replace(/>\s+</g, "><");
  const parts = compact.replace(/(>)(<)(\/*)/g, "$1\n$2$3").split("\n");
  let indent = 0;
  const lines: string[] = [];
  for (const part of parts) {
    const line = part.trim();
    if (!line) continue;
    if (/^<\/\w/.test(line)) indent = Math.max(0, indent - 1);
    lines.push(`${"  ".repeat(indent)}${line}`);
    if (
      /^<\w[^>]*[^/]>$/.test(line) &&
      !/^<\?/.test(line) &&
      !/^<!/.test(line)
    ) {
      indent += 1;
    }
  }
  return lines.join("\n");
}

function bannerFor(kind: DataDocKind, lang: Lang): string {
  return t(lang, `scan.banner.${kind}`);
}

const FALLBACK_NAMES: Record<DataDocKind, string> = {
  xml: "document.xml",
  json: "document.json",
  yaml: "document.yaml",
  txt: "document.txt",
  log: "document.log",
  csv: "document.csv",
};

export function fallbackDataDocName(kind: DataDocKind): string {
  return FALLBACK_NAMES[kind];
}

function scanReportFor(
  kind: DataDocKind,
  raw: string,
  label: string,
  lang: Lang
): string {
  if (kind === "xml") return buildXmlScanReport(raw, label, { lang });
  if (kind === "json" || kind === "yaml") {
    return buildDataScanReport(kind, raw, label, lang);
  }
  return buildPlainDataScanReport(kind, raw, label, lang);
}

/** HTML preview for scan-only data documents. */
export function dataPreviewHtml(
  kind: DataDocKind,
  raw: string,
  fileLabel: string,
  lang: Lang = DEFAULT_LANG
): string {
  const body = scanReportFor(kind, raw, fileLabel, lang);
  const escaped = body
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  const title = fileLabel.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const banner = bannerFor(kind, lang);
  const htmlLang = lang === "en" ? "en" : "ja";
  return `<!DOCTYPE html>
<html lang="${htmlLang}">
<head>
<meta charset="utf-8" />
<title>${title}</title>
<style>
  body {
    margin: 0;
    padding: 1rem 1.25rem 2rem;
    font-family: system-ui, "Segoe UI", sans-serif;
    font-size: 14px;
    line-height: 1.5;
    color: #1f2328;
    background: #f6f8fa;
  }
  .banner {
    font-size: 0.85rem;
    color: #57606a;
    margin: 0 0 0.75rem;
  }
  pre {
    margin: 0;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-word;
    background: #fff;
    border: 1px solid #d0d7de;
    border-radius: 8px;
    padding: 0.85rem 1rem;
  }
</style>
</head>
<body>
<p class="banner">${banner} — ${title}</p>
<pre>${escaped}</pre>
</body>
</html>`;
}
