import { loadProfile } from "./load-profile.js";
import {
  applyOverrides,
  type ProfileOverrides,
} from "./apply-overrides.js";
import {
  extractMdOutletBlock,
  splitFrontMatter,
} from "./front-matter.js";
import { mergeProfilePartial } from "./merge-profile.js";
import type { Profile } from "./types.js";

export interface ResolveDocumentOptions {
  markdown: string;
  /** CLI --profile value (default "default"). */
  profileRef: string;
  /** True when the user explicitly passed --profile / -p. */
  profileExplicit?: boolean;
  /** CLI page overrides (highest precedence). */
  overrides?: ProfileOverrides;
}

export interface ResolvedDocument {
  body: string;
  profile: Profile;
  /** Base profile name actually loaded. */
  baseProfile: string;
  /** Whether an md-outlet front-matter block was applied. */
  usedFrontMatter: boolean;
}

/**
 * Resolve order (SPEC Phase 2):
 *   1. Base profile
 *      - If --profile was explicit → that name
 *      - Else if front matter `extends` → that name
 *      - Else → --profile value (usually "default")
 *   2. Front-matter `md-outlet` partial (minus `extends`) merged onto base
 *   3. CLI overrides (--format, --margin, …)
 *
 * Front matter is stripped from the Markdown body before render.
 */
export function resolveDocument(
  opts: ResolveDocumentOptions
): ResolvedDocument {
  const { data, body } = splitFrontMatter(opts.markdown);
  const block = extractMdOutletBlock(data);

  let extendsName: string | undefined;
  let overlay: Record<string, unknown> = {};
  if (block) {
    const { extends: ext, profile: legacyProfile, ...rest } = block;
    const candidate =
      (typeof ext === "string" && ext) ||
      (typeof legacyProfile === "string" && legacyProfile) ||
      undefined;
    extendsName = candidate || undefined;
    overlay = rest;
  }

  const baseName = opts.profileExplicit
    ? opts.profileRef
    : extendsName ?? opts.profileRef;

  const base = loadProfile(baseName);
  const merged = block ? mergeProfilePartial(base, overlay) : base;
  const profile = applyOverrides(merged, opts.overrides ?? {});

  return {
    body,
    profile,
    baseProfile: baseName,
    usedFrontMatter: Boolean(block),
  };
}
