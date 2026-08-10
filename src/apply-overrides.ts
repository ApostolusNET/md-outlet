import type { Orientation, PageFormat, Profile } from "./types.js";

export interface ProfileOverrides {
  format?: PageFormat;
  orientation?: Orientation;
  /** Apply the same length to all four margins. */
  marginAll?: string;
  marginTop?: string;
  marginRight?: string;
  marginBottom?: string;
  marginLeft?: string;
  /** PDF print scale (0.1–2.0). Ignored for HTML/preview. */
  scale?: number;
}

const FORMATS = new Set<PageFormat>(["A4", "A3", "Letter", "Legal"]);
const ORIENTATIONS = new Set<Orientation>(["portrait", "landscape"]);

/** CSS length like `15mm`, `0.5in`, `12pt`. */
const CSS_LENGTH = /^\d+(\.\d+)?(mm|cm|in|pt|px|em|rem|%)$/i;

export function assertCssLength(value: string, label: string): string {
  const v = value.trim();
  if (!CSS_LENGTH.test(v)) {
    throw new Error(
      `Invalid ${label}: "${value}". Expected a CSS length (e.g. 15mm, 0.5in).`
    );
  }
  return v;
}

export function parseFormat(value: string): PageFormat {
  const v = value.trim() as PageFormat;
  if (!FORMATS.has(v)) {
    throw new Error(
      `Invalid --format: "${value}". Allowed: A4, A3, Letter, Legal.`
    );
  }
  return v;
}

export function parseOrientation(value: string): Orientation {
  const v = value.trim().toLowerCase() as Orientation;
  if (!ORIENTATIONS.has(v)) {
    throw new Error(
      `Invalid --orientation: "${value}". Allowed: portrait, landscape.`
    );
  }
  return v;
}

export function parseScale(value: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0.1 || n > 2) {
    throw new Error(
      `Invalid --scale: "${value}". Expected a number between 0.1 and 2.0.`
    );
  }
  return n;
}

/**
 * Apply CLI (or UI) overrides on top of a loaded profile.
 * Does not mutate the original; returns a shallow-cloned profile.
 */
export function applyOverrides(
  profile: Profile,
  overrides: ProfileOverrides
): Profile {
  const page = {
    ...profile.page,
    margin: { ...profile.page.margin },
  };

  if (overrides.format) page.format = overrides.format;
  if (overrides.orientation) page.orientation = overrides.orientation;

  if (overrides.marginAll) {
    const m = assertCssLength(overrides.marginAll, "--margin");
    page.margin = { top: m, right: m, bottom: m, left: m };
  }
  if (overrides.marginTop)
    page.margin.top = assertCssLength(overrides.marginTop, "--margin-top");
  if (overrides.marginRight)
    page.margin.right = assertCssLength(
      overrides.marginRight,
      "--margin-right"
    );
  if (overrides.marginBottom)
    page.margin.bottom = assertCssLength(
      overrides.marginBottom,
      "--margin-bottom"
    );
  if (overrides.marginLeft)
    page.margin.left = assertCssLength(overrides.marginLeft, "--margin-left");

  if (overrides.scale !== undefined) page.scale = overrides.scale;

  return { ...profile, page };
}
