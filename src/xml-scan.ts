/**
 * XML → human-scannable text report.
 * Phase 1: structure walk
 * Phase 2: date grouping, money formatting, HTML-ish strip
 * Phase 3: optional field label dictionaries (dicts/*.yaml)
 */

import { labelXmlName, listXmlDicts, pickXmlDict } from "./xml-dict.js";
import { DEFAULT_LANG, t, type Lang } from "./i18n.js";

export type XmlScanNode = {
  name: string;
  attrs: Record<string, string>;
  children: XmlScanNode[];
  text: string;
};

export type XmlScanResult =
  | { ok: true; root: XmlScanNode }
  | { ok: false; error: string };

/** Longer first: Gengou before Gengo. Gengo is an alternate spelling in some notices. */
const DATE_SUFFIXES = ["Gengou", "Gengo", "Year", "Month", "Date", "Day"] as const;
type DateSuffix = (typeof DATE_SUFFIXES)[number];
type DatePartKey = "Gengou" | "Year" | "Month" | "Date" | "Day";

function normalizeDateSuffix(suffix: DateSuffix): DatePartKey {
  return suffix === "Gengo" ? "Gengou" : suffix;
}

function localName(tag: string): string {
  const raw = tag.trim();
  if (raw.includes("}")) return raw.slice(raw.indexOf("}") + 1);
  if (raw.includes(":")) return raw.slice(raw.lastIndexOf(":") + 1);
  return raw;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function parseAttrs(chunk: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const re = /([^\s=]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(chunk))) {
    attrs[localName(m[1])] = decodeEntities(m[3] ?? m[4] ?? "");
  }
  return attrs;
}

function stripNoise(xml: string): string {
  return xml
    .replace(/^\uFEFF/, "")
    .replace(/<\?[\s\S]*?\?>/g, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<!DOCTYPE[\s\S]*?>/gi, "")
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .trim();
}

export function parseXmlForScan(
  raw: string,
  lang: Lang = DEFAULT_LANG
): XmlScanResult {
  const src = stripNoise(raw);
  if (!src) return { ok: false, error: t(lang, "scan.xml.empty") };

  const tokenRe = /<\/?([^\s/>]+)([^>]*?)\/?>|([^<]+)/g;
  const stack: XmlScanNode[] = [];
  let root: XmlScanNode | null = null;
  let m: RegExpExecArray | null;

  while ((m = tokenRe.exec(src))) {
    if (m[1] !== undefined) {
      const full = m[0];
      const name = localName(m[1]);
      const rest = m[2] || "";
      const isClose = full.startsWith("</");
      const isSelf = /\/>$/.test(full);

      if (isClose) {
        if (!stack.length) {
          return {
            ok: false,
            error: t(lang, "scan.xml.extraClose", { name }),
          };
        }
        const top = stack[stack.length - 1];
        if (top.name !== name) {
          return {
            ok: false,
            error: t(lang, "scan.xml.mismatch", {
              open: top.name,
              close: name,
            }),
          };
        }
        stack.pop();
        continue;
      }

      const node: XmlScanNode = {
        name,
        attrs: parseAttrs(rest),
        children: [],
        text: "",
      };
      if (!root) {
        root = node;
      } else if (stack.length) {
        stack[stack.length - 1].children.push(node);
      } else {
        return { ok: false, error: t(lang, "scan.xml.multiRoot") };
      }
      if (!isSelf) stack.push(node);
      continue;
    }

    const text = decodeEntities((m[3] || "").replace(/\s+/g, " ").trim());
    if (!text) continue;
    if (!stack.length) continue;
    const cur = stack[stack.length - 1];
    cur.text = cur.text ? `${cur.text} ${text}` : text;
  }

  if (stack.length) {
    return {
      ok: false,
      error: t(lang, "scan.xml.unclosed", {
        name: stack[stack.length - 1].name,
      }),
    };
  }
  if (!root) return { ok: false, error: t(lang, "scan.xml.noElement") };
  return { ok: true, root };
}

/** Remove simple HTML-ish markup often embedded in XML text fields. */
export function stripHtmlIsh(value: string): string {
  let text = decodeEntities(value.trim());
  text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(
    /<a\s+[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi,
    "$2 ($1)"
  );
  text = text.replace(/<[^>]+>/g, "");
  return text.replace(/[ \t]+\n/g, "\n").trim();
}

function looksLikeMoneyName(name: string): boolean {
  return (
    /(Ryou|Kingaku|Amount|Price|Gaku|KyoshutsuKin|Kyoshutsu|Kin|total|Total|Sum)$/i.test(
      name
    ) || /(?:^|_)(total|amount|price|kin|ryou)(?:_|$)/i.test(name)
  );
}

export function formatMoneyValue(
  raw: string,
  lang: Lang = DEFAULT_LANG
): string | null {
  const text = stripHtmlIsh(raw).replace(/,/g, "").trim();
  if (!text) return t(lang, "scan.empty");
  if (!/^-?\d+$/.test(text)) return null;
  const n = Number(text);
  if (!Number.isFinite(n)) return null;
  const formatted = n.toLocaleString(lang === "en" ? "en-US" : "ja-JP");
  return t(lang, "scan.yen", { n: formatted });
}

function splitDateSuffix(
  name: string
): { prefix: string; suffix: DateSuffix } | null {
  for (const suffix of DATE_SUFFIXES) {
    if (name.length > suffix.length && name.endsWith(suffix)) {
      return { prefix: name.slice(0, -suffix.length), suffix };
    }
  }
  return null;
}

function formatDateParts(
  fields: Partial<Record<DatePartKey, string>>,
  lang: Lang
): string | null {
  const gengou = fields.Gengou?.trim();
  const year = fields.Year?.trim();
  const month = fields.Month?.trim();
  const day = (fields.Date || fields.Day)?.trim();
  if (!gengou && !year && !month && !day) return null;
  const parts: string[] = [];
  if (gengou) parts.push(gengou);
  if (year) parts.push(t(lang, "scan.date.year", { n: year }));
  if (month) parts.push(t(lang, "scan.date.month", { n: month }));
  if (day) parts.push(t(lang, "scan.date.day", { n: day }));
  return parts.length ? parts.join("") : null;
}

function leafValue(node: XmlScanNode): string {
  const bits: string[] = [];
  for (const k of Object.keys(node.attrs)) {
    bits.push(`@${k}=${node.attrs[k]}`);
  }
  if (node.text) bits.push(node.text);
  return bits.join(" · ");
}

function formatLeafDisplay(name: string, raw: string, lang: Lang): string {
  const cleaned = stripHtmlIsh(raw);
  if (!cleaned) return t(lang, "scan.empty");
  if (looksLikeMoneyName(name)) {
    const money = formatMoneyValue(cleaned, lang);
    if (money) return money;
  }
  if (
    /^\d{4,}$/.test(cleaned.replace(/,/g, "")) &&
    /yen|円|kin|ryou/i.test(name)
  ) {
    const money = formatMoneyValue(cleaned, lang);
    if (money) return money;
  }
  if (cleaned.includes("\n")) {
    return (
      "\n" +
      cleaned
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean)
        .join("\n")
    );
  }
  return cleaned;
}

export type XmlScanOptions = {
  /** Explicit labels (skips auto-pick). */
  labels?: Record<string, string> | null;
  /** Shown in header when labels are explicit. */
  dictName?: string;
  /** Directory of YAML dicts for auto-pick (default: package dicts/). */
  dictsDir?: string;
  /** Disable dictionary lookup entirely. */
  noDict?: boolean;
  /** UI language for report headers (default ja). */
  lang?: Lang;
};

type ScanCtx = {
  labels: Record<string, string> | null;
  lang: Lang;
};

function nodeLabel(
  name: string,
  ctx: ScanCtx,
  siblingIndex?: { i: number; total: number }
): string {
  const base = labelXmlName(name, ctx.labels);
  if (siblingIndex && siblingIndex.total > 1) {
    return `${base} (${siblingIndex.i}/${siblingIndex.total})`;
  }
  return base;
}

function renderChildren(
  children: XmlScanNode[],
  indent: number,
  lines: string[],
  ctx: ScanCtx
): void {
  const pad = "  ".repeat(indent);
  const leafMap = new Map<string, string>();
  for (const c of children) {
    if (c.children.length === 0) {
      leafMap.set(c.name, leafValue(c));
    }
  }

  const prefixParts = new Map<string, Partial<Record<DatePartKey, string>>>();
  for (const [name, value] of leafMap) {
    const split = splitDateSuffix(name);
    if (!split) continue;
    const bag = prefixParts.get(split.prefix) || {};
    bag[normalizeDateSuffix(split.suffix)] = value;
    prefixParts.set(split.prefix, bag);
  }
  const consumed = new Set<string>();
  const dateLines: { prefix: string; text: string }[] = [];
  for (const [prefix, parts] of prefixParts) {
    const keys = Object.keys(parts);
    if (keys.length < 2) continue;
    const formatted = formatDateParts(parts, ctx.lang);
    if (!formatted) continue;
    dateLines.push({ prefix, text: formatted });
    for (const suffix of DATE_SUFFIXES) {
      if (parts[normalizeDateSuffix(suffix)] !== undefined) {
        consumed.add(prefix + suffix);
      }
    }
  }

  dateLines.sort((a, b) => a.prefix.localeCompare(b.prefix));
  for (const d of dateLines) {
    lines.push(`${pad}${nodeLabel(d.prefix, ctx)}: ${d.text}`);
  }

  const counts = new Map<string, number>();
  for (const c of children) {
    if (consumed.has(c.name)) continue;
    counts.set(c.name, (counts.get(c.name) || 0) + 1);
  }
  const seen = new Map<string, number>();
  for (const c of children) {
    if (consumed.has(c.name)) continue;
    const total = counts.get(c.name) || 1;
    const n = (seen.get(c.name) || 0) + 1;
    seen.set(c.name, n);
    renderNode(
      c,
      indent,
      lines,
      ctx,
      total > 1 ? { i: n, total } : undefined
    );
  }
}

function renderNode(
  node: XmlScanNode,
  indent: number,
  lines: string[],
  ctx: ScanCtx,
  siblingIndex?: { i: number; total: number }
): void {
  const pad = "  ".repeat(indent);
  const hasKids = node.children.length > 0;
  const attrKeys = Object.keys(node.attrs);
  const label = nodeLabel(node.name, ctx, siblingIndex);

  if (hasKids) {
    lines.push(`${pad}■ ${label}`);
    for (const k of attrKeys) {
      lines.push(`${pad}  @${k}: ${stripHtmlIsh(node.attrs[k])}`);
    }
    if (node.text) {
      const textDisp = formatLeafDisplay(node.name, node.text, ctx.lang);
      if (textDisp.startsWith("\n")) {
        lines.push(`${pad}  (text):`);
        for (const line of textDisp.trim().split("\n")) {
          lines.push(`${pad}    ${line}`);
        }
      } else {
        lines.push(`${pad}  (text): ${textDisp}`);
      }
    }
    renderChildren(node.children, indent + 1, lines, ctx);
    return;
  }

  let raw = leafValue(node);
  if (!raw && attrKeys.length === 0) raw = "";
  if (attrKeys.length && node.text) {
    const formattedText = formatLeafDisplay(node.name, node.text, ctx.lang);
    const attrBit = attrKeys.map((k) => `@${k}=${node.attrs[k]}`).join(" · ");
    if (formattedText.startsWith("\n")) {
      lines.push(`${pad}${label}: ${attrBit}`);
      for (const line of formattedText.trim().split("\n")) {
        lines.push(`${pad}  ${line}`);
      }
    } else {
      lines.push(`${pad}${label}: ${attrBit} · ${formattedText}`);
    }
    return;
  }

  const display = formatLeafDisplay(node.name, raw || node.text || "", ctx.lang);
  if (display.startsWith("\n")) {
    lines.push(`${pad}${label}:`);
    for (const line of display.trim().split("\n")) {
      lines.push(`${pad}  ${line}`);
    }
  } else {
    lines.push(`${pad}${label}: ${display}`);
  }
}

/** Build a scannable plain-text report from XML source. */
export function buildXmlScanReport(
  raw: string,
  fileLabel: string,
  options: XmlScanOptions = {}
): string {
  const lang = options.lang ?? DEFAULT_LANG;
  const parsed = parseXmlForScan(raw, lang);
  if (!parsed.ok) {
    return [
      t(lang, "scan.parseFail", { label: "XML" }),
      t(lang, "scan.reason", { reason: parsed.error }),
      "",
      raw.trim(),
      "",
    ].join("\n");
  }

  let labels: Record<string, string> | null = null;
  let dictLine = t(lang, "scan.dict.none");

  if (options.noDict) {
    labels = null;
  } else if (options.labels) {
    labels = options.labels;
    dictLine = options.dictName
      ? t(lang, "scan.dict.named", { name: options.dictName })
      : t(lang, "scan.dict.explicit");
  } else {
    const picked = pickXmlDict(parsed.root, listXmlDicts(options.dictsDir));
    if (picked) {
      labels = picked.dict.labels;
      dictLine = t(lang, "scan.dict.picked", {
        name: picked.dict.name,
        hits: picked.hits,
      });
    }
  }

  const rootLabel = labelXmlName(parsed.root.name, labels);
  const lines: string[] = [
    t(lang, "scan.report.xml"),
    t(lang, "scan.file", { name: fileLabel }),
    t(lang, "scan.root", { name: rootLabel }),
    dictLine,
    "",
  ];
  renderNode(parsed.root, 0, lines, { labels, lang });
  lines.push("");
  return lines.join("\n");
}
