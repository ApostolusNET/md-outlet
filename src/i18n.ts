import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { PKG_ROOT } from "./paths.js";

export const LOCALES_DIR = resolve(PKG_ROOT, "locales");
export type Lang = "ja" | "en";

export const SUPPORTED_LANGS: readonly Lang[] = ["ja", "en"] as const;
export const DEFAULT_LANG: Lang = "ja";

type Catalog = Record<string, string>;

const cache = new Map<Lang, Catalog>();

function loadCatalog(lang: Lang): Catalog {
  const hit = cache.get(lang);
  if (hit) return hit;
  const file = resolve(LOCALES_DIR, `${lang}.json`);
  if (!existsSync(file)) {
    if (lang !== DEFAULT_LANG) return loadCatalog(DEFAULT_LANG);
    throw new Error(`Missing locale catalog: ${file}`);
  }
  const data = JSON.parse(readFileSync(file, "utf8")) as Catalog;
  cache.set(lang, data);
  return data;
}

/** Normalize Accept-Language / header / query to ja|en. Default ja. */
export function normalizeLang(raw: unknown): Lang {
  if (raw == null) return DEFAULT_LANG;
  const s = String(Array.isArray(raw) ? raw[0] : raw)
    .trim()
    .toLowerCase();
  if (!s) return DEFAULT_LANG;
  if (s === "en" || s.startsWith("en-") || s.startsWith("en,")) return "en";
  if (s === "ja" || s.startsWith("ja-") || s.startsWith("ja,")) return "ja";
  return DEFAULT_LANG;
}

export function t(
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>
): string {
  const primary = loadCatalog(lang);
  const fallback = lang === DEFAULT_LANG ? primary : loadCatalog(DEFAULT_LANG);
  let text = primary[key] ?? fallback[key] ?? key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      text = text.split(`{${k}}`).join(String(v));
    }
  }
  return text;
}

/** Clear cache (tests / hot reload). */
export function clearLocaleCache(): void {
  cache.clear();
}
