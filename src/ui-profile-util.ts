import { resolve, sep } from "node:path";
import { PROFILES_DIR } from "./paths.js";
import type { Profile } from "./types.js";

export function isBundledProfile(sourcePath?: string): boolean {
  if (!sourcePath) return false;
  const src = resolve(sourcePath);
  const root = resolve(PROFILES_DIR);
  return src === root || src.startsWith(root + sep);
}

export function stripSource(profile: Profile): Profile {
  const { __sourcePath: _, ...rest } = profile;
  return rest as Profile;
}
