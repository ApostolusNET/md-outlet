import type { ProfileBreaks, HeadingTag } from "./types.js";

/**
 * Resolve which heading tags actually get breaks.
 *
 * Many Japanese docs use a single `#` title and `##` for chapters
 * (e.g. docs/START.md). If the profile asks for H1 breaks but the
 * HTML has fewer than two H1s, treat H2 as the chapter level instead.
 */
export function resolveBreakHeadingTags(
  html: string,
  breaks: ProfileBreaks
): HeadingTag[] {
  const requested = breaks.beforeHeadings;
  if (requested.length === 0) return [];

  const wantsH1 = requested.includes("h1");
  const alreadyH2 = requested.includes("h2");
  if (!wantsH1 || alreadyH2) return [...requested];

  const h1Count = (html.match(/<h1\b/gi) || []).length;
  if (h1Count < 2) return ["h2"];
  return [...requested];
}

/**
 * SPEC-compliant page-break injection.
 *
 * Chromium PDF renderer does not always honor `break-before: page` on
 * H1 elements. To make `breaks.beforeHeadings` reliably effective we
 * inject a real element with `page-break-after: always` just before
 * every matching heading (skipping the first when configured).
 *
 * Idempotency guarantee (SPEC v1):
 *   If the author already placed an explicit page-break element
 *   (`<div class="page-break">` or `<div class="md-outlet-page-break">`)
 *   immediately before a target heading, we do NOT inject another one.
 *   This prevents blank pages when a document is written by an author
 *   who wants "chapter per H1" AND is loaded with a profile that also
 *   forces it.
 */
export function injectPageBreaks(html: string, breaks: ProfileBreaks): string {
  const targets = new Set<HeadingTag>(resolveBreakHeadingTags(html, breaks));
  if (targets.size === 0) return html;

  const tagPattern = Array.from(targets).join("|");
  // Capture optional preceding page-break element + whitespace, then the heading tag.
  // Groups:
  //   1: existing page-break div (or empty)
  //   2: heading tag name
  const re = new RegExp(
    `(<div\\s+class=(?:"|')(?:md-outlet-page-break|page-break)(?:"|')[^>]*>\\s*</div>\\s*)?<(${tagPattern})(\\s[^>]*)?>`,
    "gi"
  );

  let firstSeen = false;
  return html.replace(re, (match, existingBreak: string | undefined) => {
    const isFirst = !firstSeen;
    firstSeen = true;

    if (breaks.skipFirst && isFirst) {
      // Keep whatever the author wrote as-is (no injection, no removal).
      return match;
    }
    if (existingBreak) {
      // Author-provided break already handles the split. Leave it alone.
      return match;
    }
    // Insert canonical break just before the heading.
    const headingStart = match; // no existing break captured
    return `<div class="md-outlet-page-break" aria-hidden="true"></div>${headingStart}`;
  });
}
