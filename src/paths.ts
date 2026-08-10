import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

export const PKG_ROOT = resolve(here, "..");
export const PROFILES_DIR = resolve(PKG_ROOT, "profiles");
export const THEMES_DIR = resolve(PKG_ROOT, "themes");
export const SCHEMAS_DIR = resolve(PKG_ROOT, "schemas");
export const DOCS_DIR = resolve(PKG_ROOT, "docs");
export const EXAMPLES_DIR = resolve(PKG_ROOT, "examples");
export const XML_DICTS_DIR = resolve(PKG_ROOT, "dicts");
