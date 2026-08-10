import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, isAbsolute, resolve, dirname } from "node:path";
import { parse as parseYaml } from "yaml";
import Ajv, { type ValidateFunction } from "ajv";
import type { Profile } from "./types.js";
import { PROFILES_DIR, SCHEMAS_DIR, THEMES_DIR } from "./paths.js";

let validator: ValidateFunction | null = null;

function getValidator(): ValidateFunction {
  if (validator) return validator;
  const schemaPath = resolve(SCHEMAS_DIR, "profile-v1.json");
  const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
  const ajv = new Ajv({ allErrors: true, strict: false, useDefaults: true });
  validator = ajv.compile(schema);
  return validator;
}

const DEFAULT_BREAKS = {
  beforeHeadings: [],
  skipFirst: true,
  avoidInside: ["pre", "table", "blockquote"],
  avoidAfter: ["h2", "h3", "h4"],
};

const DEFAULT_MARKDOWN = {
  gfm: true,
  highlight: true,
  highlightStyle: "github",
  allowHtml: true,
};

const DEFAULT_PAGE = {
  format: "A4",
  orientation: "portrait",
  margin: { top: "20mm", right: "18mm", bottom: "20mm", left: "18mm" },
  printBackground: true,
};

/**
 * Normalize snake_case keys to lowerCamelCase for known SPEC fields.
 * Only shallow keys we care about.
 */
function normalizeKeys(input: unknown): unknown {
  if (input === null || typeof input !== "object" || Array.isArray(input))
    return input;
  const src = input as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) {
    const key = k.includes("_")
      ? k.replace(/_([a-zA-Z])/g, (_, c: string) => c.toUpperCase())
      : k;
    out[key] = typeof v === "object" && v !== null ? normalizeKeys(v) : v;
  }
  return out;
}

function resolveProfilePath(nameOrPath: string): string {
  if (nameOrPath.includes("/") || nameOrPath.includes("\\") || extname(nameOrPath)) {
    const abs = isAbsolute(nameOrPath)
      ? nameOrPath
      : resolve(process.cwd(), nameOrPath);
    if (!existsSync(abs)) {
      throw new Error(`Profile file not found: ${abs}`);
    }
    return abs;
  }
  const candidates = [
    resolve(PROFILES_DIR, `${nameOrPath}.yaml`),
    resolve(PROFILES_DIR, `${nameOrPath}.yml`),
    resolve(PROFILES_DIR, `${nameOrPath}.json`),
  ];
  for (const c of candidates) {
    if (existsSync(c) && statSync(c).isFile()) return c;
  }
  throw new Error(
    `Built-in profile not found: "${nameOrPath}". Looked in ${PROFILES_DIR}.`
  );
}

function parseByExt(text: string, ext: string): unknown {
  if (ext === ".json") return JSON.parse(text);
  return parseYaml(text);
}

export function loadProfile(nameOrPath: string): Profile {
  const absPath = resolveProfilePath(nameOrPath);
  const raw = readFileSync(absPath, "utf8");
  const parsed = parseByExt(raw, extname(absPath).toLowerCase());
  const normalized = normalizeKeys(parsed) as Record<string, unknown>;

  if (normalized.version !== 1) {
    throw new Error(
      `Unsupported profile version: ${String(normalized.version)}. Expected 1.`
    );
  }

  const validate = getValidator();
  const valid = validate(normalized);
  if (!valid) {
    const details = (validate.errors ?? [])
      .map((e) => `  - ${e.instancePath || "/"} ${e.message}`)
      .join("\n");
    throw new Error(
      `Profile failed schema validation (${absPath}):\n${details}`
    );
  }

  const merged: Profile = {
    version: 1,
    meta: (normalized.meta as Profile["meta"]) ?? { name: "unnamed" },
    page: {
      ...DEFAULT_PAGE,
      ...((normalized.page as object) ?? {}),
      margin: {
        ...DEFAULT_PAGE.margin,
        ...(((normalized.page as { margin?: object } | undefined)?.margin) ??
          {}),
      },
    } as Profile["page"],
    theme: (normalized.theme as string) ?? "default",
    breaks: {
      ...DEFAULT_BREAKS,
      ...((normalized.breaks as object) ?? {}),
    } as Profile["breaks"],
    markdown: {
      ...DEFAULT_MARKDOWN,
      ...((normalized.markdown as object) ?? {}),
    } as Profile["markdown"],
    bodyClass: (normalized.bodyClass as string[]) ?? [],
    __sourcePath: absPath,
  };

  return merged;
}

export function resolveThemeCssPath(profile: Profile): string {
  const themeRef = profile.theme;
  const looksLikePath =
    themeRef.includes("/") ||
    themeRef.includes("\\") ||
    themeRef.endsWith(".css");
  if (looksLikePath) {
    const base = profile.__sourcePath
      ? dirname(profile.__sourcePath)
      : process.cwd();
    const abs = isAbsolute(themeRef) ? themeRef : resolve(base, themeRef);
    if (!existsSync(abs)) {
      throw new Error(`Theme CSS not found: ${abs}`);
    }
    return abs;
  }
  const abs = resolve(THEMES_DIR, themeRef, "theme.css");
  if (!existsSync(abs)) {
    throw new Error(`Built-in theme not found: "${themeRef}" (${abs}).`);
  }
  return abs;
}
