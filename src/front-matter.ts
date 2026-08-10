import { parse as parseYaml } from "yaml";

export interface FrontMatterResult {
  /** Raw YAML object from the front matter block (may be empty). */
  data: Record<string, unknown>;
  /** Markdown body with front matter stripped. */
  body: string;
  /** True when a --- delimited block was present. */
  hasFrontMatter: boolean;
}

const FM_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

/**
 * Split optional YAML front matter from a Markdown document.
 * Only a leading `---` block is recognized (GitHub / Jekyll style).
 */
export function splitFrontMatter(markdown: string): FrontMatterResult {
  const text = markdown.replace(/^\uFEFF/, "");
  const m = text.match(FM_RE);
  if (!m) {
    return { data: {}, body: text, hasFrontMatter: false };
  }
  let data: Record<string, unknown> = {};
  try {
    const parsed = parseYaml(m[1] ?? "");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, unknown>;
    } else if (parsed != null) {
      throw new Error("Front matter must be a YAML mapping (object).");
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(`Invalid YAML front matter: ${msg}`);
  }
  return {
    data,
    body: text.slice(m[0].length),
    hasFrontMatter: true,
  };
}

/**
 * Extract the md-outlet block from front matter.
 *
 * Accepted shapes:
 *   md-outlet: { ... }
 *   mdOutlet:  { ... }
 *
 * Returns null when no block is present (other FM keys are ignored).
 */
export function extractMdOutletBlock(
  data: Record<string, unknown>
): Record<string, unknown> | null {
  const block = data["md-outlet"] ?? data.mdOutlet;
  if (block == null) return null;
  if (typeof block !== "object" || Array.isArray(block)) {
    throw new Error(
      'Front matter key "md-outlet" must be a mapping (object).'
    );
  }
  return block as Record<string, unknown>;
}
