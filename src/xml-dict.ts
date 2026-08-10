/**
 * Optional XML field dictionaries (phase 3).
 * Unknown tags stay as tag names; add YAML under dicts/ to grow coverage.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, resolve } from "node:path";
import { parse as parseYaml } from "yaml";
import { XML_DICTS_DIR } from "./paths.js";
import type { XmlScanNode } from "./xml-scan.js";

export type XmlDict = {
  name: string;
  description?: string;
  labels: Record<string, string>;
  sourcePath: string;
};

export type XmlDictPick = {
  dict: XmlDict;
  hits: number;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}

/** Load one dictionary YAML. */
export function loadXmlDict(filePath: string): XmlDict {
  const abs = resolve(filePath);
  const raw = readFileSync(abs, "utf8");
  const doc = parseYaml(raw);
  if (!isRecord(doc)) {
    throw new Error(`Invalid xml dict (not an object): ${abs}`);
  }
  const meta = isRecord(doc.meta) ? doc.meta : {};
  const labelsRaw = isRecord(doc.labels) ? doc.labels : {};
  const labels: Record<string, string> = {};
  for (const [k, v] of Object.entries(labelsRaw)) {
    if (typeof v === "string" && v.trim()) labels[k] = v.trim();
  }
  const name =
    (typeof meta.name === "string" && meta.name.trim()) ||
    basename(abs).replace(/\.ya?ml$/i, "");
  const description =
    typeof meta.description === "string" ? meta.description : undefined;
  return { name, description, labels, sourcePath: abs };
}

function loadYamlDictsFromDir(dir: string): XmlDict[] {
  if (!existsSync(dir)) return [];
  const files = readdirSync(dir)
    .filter((f) => /\.ya?ml$/i.test(f))
    .sort();
  const out: XmlDict[] = [];
  for (const f of files) {
    try {
      out.push(loadXmlDict(resolve(dir, f)));
    } catch {
      // skip broken dict files
    }
  }
  return out;
}

/**
 * List bundled (or custom-dir) dictionaries. Missing dir → [].
 * Also loads `dicts/local/*.yaml` when scanning the package dicts dir
 * (personal dictionaries; gitignored / not shipped in Release zip).
 */
export function listXmlDicts(dir: string = XML_DICTS_DIR): XmlDict[] {
  const out = loadYamlDictsFromDir(dir);
  if (resolve(dir) === resolve(XML_DICTS_DIR)) {
    out.push(...loadYamlDictsFromDir(resolve(dir, "local")));
  }
  return out;
}

/** Collect element local names in the tree. */
export function collectXmlTagNames(root: XmlScanNode): Set<string> {
  const names = new Set<string>();
  const walk = (n: XmlScanNode) => {
    names.add(n.name);
    for (const c of n.children) walk(c);
  };
  walk(root);
  return names;
}

/** Count how many tag names in the tree hit the dictionary. */
export function countXmlDictHits(
  root: XmlScanNode,
  labels: Record<string, string>
): number {
  let hits = 0;
  for (const name of collectXmlTagNames(root)) {
    if (labels[name]) hits += 1;
  }
  return hits;
}

/**
 * Pick the dictionary with the most tag hits.
 * Ties: first in list order. Zero hits → null (keep raw tag names).
 */
export function pickXmlDict(
  root: XmlScanNode,
  dicts: XmlDict[]
): XmlDictPick | null {
  let best: XmlDictPick | null = null;
  for (const dict of dicts) {
    const hits = countXmlDictHits(root, dict.labels);
    if (hits <= 0) continue;
    if (!best || hits > best.hits) best = { dict, hits };
  }
  return best;
}

/** Resolve display label: JP if known, else tag name. */
export function labelXmlName(
  name: string,
  labels?: Record<string, string> | null
): string {
  if (!labels) return name;
  return labels[name] || name;
}
