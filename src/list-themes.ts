import { existsSync, readdirSync, statSync } from "node:fs";
import { basename, resolve } from "node:path";
import { THEMES_DIR } from "./paths.js";

/**
 * List built-in theme directory names that contain theme.css.
 */
export function listBuiltInThemes(): string[] {
  if (!existsSync(THEMES_DIR)) return [];
  return readdirSync(THEMES_DIR)
    .filter((name) => {
      const dir = resolve(THEMES_DIR, name);
      try {
        return (
          statSync(dir).isDirectory() &&
          existsSync(resolve(dir, "theme.css"))
        );
      } catch {
        return false;
      }
    })
    .sort();
}
