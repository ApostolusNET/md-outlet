/**
 * TXT / LOG / CSV → human-scannable text report.
 * - txt: plain text (+ line count)
 * - log: plain text with line numbers (UI filter + Ctrl+Alt+F focuses filter)
 * - csv/tsv: row scan with header column names
 */

import { DEFAULT_LANG, t, type Lang } from "./i18n.js";

export type TextKind = "txt" | "log" | "csv";

const MAX_CSV_ROWS = 500;
const MAX_TEXT_CHARS = 400_000;

function locNum(n: number, lang: Lang): string {
  return n.toLocaleString(lang === "en" ? "en-US" : "ja-JP");
}

function stripBom(raw: string): string {
  return raw.replace(/^\uFEFF/, "");
}

function splitLines(raw: string, trimTrailingEmpty = true): string[] {
  const text = stripBom(raw).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  if (!text) return [];
  const lines = text.split("\n");
  if (trimTrailingEmpty && lines.length && lines[lines.length - 1] === "") {
    lines.pop();
  }
  return lines;
}

function truncateNote(
  lang: Lang,
  totalChars: number,
  shownChars: number
): string[] {
  if (totalChars <= shownChars) return [];
  return [
    "",
    t(lang, "scan.truncateChars", {
      shown: locNum(shownChars, lang),
      total: locNum(totalChars, lang),
    }),
  ];
}

/** Plain text / log report. */
export function buildTextScanReport(
  kind: "txt" | "log",
  raw: string,
  fileLabel: string,
  lang: Lang = DEFAULT_LANG
): string {
  const full = stripBom(raw);
  const lines = splitLines(raw);
  const lineCount = lines.length === 1 && lines[0] === "" ? 0 : lines.length;
  const reportKey = kind === "log" ? "scan.report.log" : "scan.report.txt";

  const header: string[] = [
    t(lang, reportKey),
    t(lang, "scan.file", { name: fileLabel }),
    t(lang, "scan.lines", { n: locNum(lineCount, lang) }),
  ];
  if (kind === "log") {
    header.push(t(lang, "scan.logFilterHint"));
  }
  header.push("");

  let body: string;
  if (kind === "log") {
    const width = String(Math.max(lineCount, 1)).length;
    const numbered = lines.map((line, i) => {
      const n = String(i + 1).padStart(width, " ");
      return `${n} | ${line}`;
    });
    body = numbered.join("\n");
  } else {
    body = full;
  }

  if (body.length > MAX_TEXT_CHARS) {
    const shown = body.slice(0, MAX_TEXT_CHARS);
    return [
      ...header,
      shown,
      ...truncateNote(lang, body.length, shown.length),
      "",
    ].join("\n");
  }

  return [...header, body, ""].join("\n");
}

function detectDelimiter(sampleLines: string[]): "," | "\t" | ";" {
  const candidates: Array<"," | "\t" | ";"> = [",", "\t", ";"];
  let best: "," | "\t" | ";" = ",";
  let bestScore = -1;
  for (const d of candidates) {
    let score = 0;
    let prev = -1;
    let consistent = true;
    for (const line of sampleLines) {
      if (!line.trim()) continue;
      const n = splitCsvLine(line, d).length;
      if (n < 2) continue;
      score += n;
      if (prev < 0) prev = n;
      else if (n !== prev) consistent = false;
    }
    if (consistent) score += 10;
    if (score > bestScore) {
      bestScore = score;
      best = d;
    }
  }
  return best;
}

/** Minimal CSV split (handles quotes). */
export function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delimiter) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function delimiterLabel(d: string): string {
  if (d === "\t") return "TAB";
  if (d === ";") return ";";
  return ",";
}

function cellDisplay(v: string, lang: Lang): string {
  if (v === "") return t(lang, "scan.empty");
  return v;
}

/** CSV / TSV scan report. */
export function buildCsvScanReport(
  raw: string,
  fileLabel: string,
  lang: Lang = DEFAULT_LANG
): string {
  const lines = splitLines(raw).filter((l, i, arr) => {
    // drop a single trailing empty line from final newline
    if (i === arr.length - 1 && l === "") return false;
    return true;
  });

  const title = t(lang, "scan.report.csv");
  const fileLine = t(lang, "scan.file", { name: fileLabel });

  if (!lines.length) {
    return [
      title,
      fileLine,
      t(lang, "scan.lines", { n: "0" }),
      "",
      t(lang, "scan.emptyFile"),
      "",
    ].join("\n");
  }

  const sample = lines.slice(0, Math.min(20, lines.length));
  const delimiter = detectDelimiter(sample);
  const rows = lines.map((l) => splitCsvLine(l, delimiter));
  const hasHeader = rows.length >= 2;
  const header = hasHeader ? rows[0] : [];
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const colCount = Math.max(...rows.map((r) => r.length), 0);
  const colNames = Array.from({ length: colCount }, (_, i) => {
    if (!hasHeader) return t(lang, "scan.colFallback", { n: i + 1 });
    const h = (header[i] || "").trim();
    return h || t(lang, "scan.colFallback", { n: i + 1 });
  });

  const out: string[] = [
    title,
    fileLine,
    t(lang, "scan.delimiter", { d: delimiterLabel(delimiter) }),
    t(lang, "scan.columns", { cols: colNames.join(", ") }),
    hasHeader
      ? t(lang, "scan.dataRowsHeader", {
          n: locNum(dataRows.length, lang),
        })
      : t(lang, "scan.dataRowsNoHeader", {
          n: locNum(dataRows.length, lang),
        }),
    "",
  ];

  if (!dataRows.length) {
    out.push(t(lang, "scan.noDataRows"));
    out.push("");
    return out.join("\n");
  }

  const shown = dataRows.slice(0, MAX_CSV_ROWS);
  for (let i = 0; i < shown.length; i += 1) {
    const row = shown[i];
    out.push(t(lang, "scan.row", { n: i + 1 }));
    for (let c = 0; c < colNames.length; c += 1) {
      out.push(`  ${colNames[c]}: ${cellDisplay(row[c] ?? "", lang)}`);
    }
  }

  if (dataRows.length > MAX_CSV_ROWS) {
    out.push("");
    out.push(
      t(lang, "scan.truncateRows", {
        shown: MAX_CSV_ROWS,
        total: locNum(dataRows.length, lang),
      })
    );
  }
  out.push("");
  return out.join("\n");
}

export function buildPlainDataScanReport(
  kind: TextKind,
  raw: string,
  fileLabel: string,
  lang: Lang = DEFAULT_LANG
): string {
  if (kind === "csv") return buildCsvScanReport(raw, fileLabel, lang);
  return buildTextScanReport(kind, raw, fileLabel, lang);
}
