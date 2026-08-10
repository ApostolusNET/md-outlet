import { existsSync } from "node:fs";
import { resolve, sep, isAbsolute, extname } from "node:path";
import { loadProfile } from "./load-profile.js";
import { PROFILES_DIR } from "./paths.js";
import { listBuiltInProfiles } from "./init-profile.js";

function isBundledPath(sourcePath?: string): boolean {
  if (!sourcePath) return false;
  const src = resolve(sourcePath);
  const root = resolve(PROFILES_DIR);
  return src === root || src.startsWith(root + sep);
}

/**
 * Decide where the UI should Save YAML.
 * - Explicit --output wins
 * - Else if profile is a file path → that file
 * - Else (built-in) → ./<meta.name>.yaml in cwd
 */
export function resolveUiSavePath(
  profileRef: string,
  outputOpt?: string
): string {
  if (outputOpt) return resolve(process.cwd(), outputOpt);

  const looksLikePath =
    profileRef.includes("/") ||
    profileRef.includes("\\") ||
    Boolean(extname(profileRef));

  if (looksLikePath) {
    const abs = isAbsolute(profileRef)
      ? profileRef
      : resolve(process.cwd(), profileRef);
    if (existsSync(abs) && !isBundledPath(abs)) return abs;
  }

  if (listBuiltInProfiles().includes(profileRef)) {
    const p = loadProfile(profileRef);
    return resolve(process.cwd(), `${p.meta.name}.yaml`);
  }

  // Fallback: try load and use source if not bundled
  const p = loadProfile(profileRef);
  if (p.__sourcePath && !isBundledPath(p.__sourcePath)) {
    return p.__sourcePath;
  }
  return resolve(process.cwd(), `${p.meta.name}.yaml`);
}
