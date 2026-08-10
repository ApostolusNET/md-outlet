import { existsSync, readdirSync } from "node:fs";
import { resolve, basename, extname } from "node:path";
import { loadProfile } from "./load-profile.js";
import { PROFILES_DIR } from "./paths.js";
import { saveProfileFile } from "./serialize-profile.js";
import type { Profile } from "./types.js";

const NAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]*$/;

export interface InitOptions {
  /** New profile id (also default file stem). */
  name: string;
  /** Built-in name or path to copy from. */
  basedOn: string;
  /** Destination path (.yaml/.yml/.json). */
  outputPath: string;
  force?: boolean;
  description?: string;
}

export function listBuiltInProfiles(): string[] {
  return readdirSync(PROFILES_DIR)
    .filter((f) => [".yaml", ".yml", ".json"].includes(extname(f).toLowerCase()))
    .map((f) => basename(f, extname(f)))
    .sort();
}

export function assertProfileName(name: string): string {
  if (!NAME_RE.test(name)) {
    throw new Error(
      `Invalid profile name "${name}". Use letters, digits, hyphen, underscore; must start with a letter.`
    );
  }
  return name;
}

/**
 * Create a new profile YAML by copying a built-in (or path) base.
 * Returns the absolute path written.
 */
export function initProfile(opts: InitOptions): string {
  const name = assertProfileName(opts.name);
  const outAbs = resolve(process.cwd(), opts.outputPath);
  if (existsSync(outAbs) && !opts.force) {
    throw new Error(
      `Refusing to overwrite existing file: ${outAbs}\nPass --force to replace it.`
    );
  }

  const base = loadProfile(opts.basedOn);
  const description =
    opts.description?.trim() ||
    `Created from "${opts.basedOn}" via md-outlet init.`;

  const profile: Profile = {
    ...base,
    meta: {
      ...base.meta,
      name,
      description,
    },
  };

  return saveProfileFile(profile, outAbs, { force: true });
}

export function defaultOutputPath(name: string): string {
  return `${name}.yaml`;
}
