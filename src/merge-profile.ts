import type { Profile } from "./types.js";

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

/**
 * Deep-merge a partial profile overlay onto a base profile.
 * Arrays replace (do not concat). Unknown top-level keys are ignored
 * except those that belong to Profile.
 */
export function mergeProfilePartial(
  base: Profile,
  overlay: Record<string, unknown>
): Profile {
  const out: Profile = {
    ...base,
    meta: { ...base.meta },
    page: {
      ...base.page,
      margin: { ...base.page.margin },
    },
    breaks: {
      ...base.breaks,
      beforeHeadings: [...base.breaks.beforeHeadings],
      avoidInside: [...base.breaks.avoidInside],
      avoidAfter: [...base.breaks.avoidAfter],
    },
    markdown: { ...base.markdown },
    bodyClass: [...base.bodyClass],
  };

  if (isPlainObject(overlay.meta)) {
    const m = overlay.meta;
    if (typeof m.name === "string" && m.name.length > 0) out.meta.name = m.name;
    if (typeof m.description === "string") out.meta.description = m.description;
    if (Array.isArray(m.authors)) {
      out.meta.authors = m.authors.filter((a) => typeof a === "string");
    }
  }

  if (isPlainObject(overlay.page)) {
    const p = overlay.page;
    if (typeof p.format === "string") {
      out.page.format = p.format as Profile["page"]["format"];
    }
    if (typeof p.orientation === "string") {
      out.page.orientation = p.orientation as Profile["page"]["orientation"];
    }
    if (typeof p.printBackground === "boolean") {
      out.page.printBackground = p.printBackground;
    }
    if (typeof p.scale === "number") {
      out.page.scale = p.scale;
    }
    if (isPlainObject(p.margin)) {
      for (const side of ["top", "right", "bottom", "left"] as const) {
        const v = p.margin[side];
        if (typeof v === "string") out.page.margin[side] = v;
      }
    }
  }

  if (typeof overlay.theme === "string" && overlay.theme.length > 0) {
    out.theme = overlay.theme;
  }

  if (isPlainObject(overlay.breaks)) {
    const b = overlay.breaks;
    if (Array.isArray(b.beforeHeadings)) {
      out.breaks.beforeHeadings = b.beforeHeadings.filter(
        (t): t is Profile["breaks"]["beforeHeadings"][number] =>
          typeof t === "string"
      );
    }
    if (typeof b.skipFirst === "boolean") out.breaks.skipFirst = b.skipFirst;
    if (Array.isArray(b.avoidInside)) {
      out.breaks.avoidInside = b.avoidInside.filter((t) => typeof t === "string");
    }
    if (Array.isArray(b.avoidAfter)) {
      out.breaks.avoidAfter = b.avoidAfter.filter((t) => typeof t === "string");
    }
  }

  if (isPlainObject(overlay.markdown)) {
    const m = overlay.markdown;
    if (typeof m.gfm === "boolean") out.markdown.gfm = m.gfm;
    if (typeof m.highlight === "boolean") out.markdown.highlight = m.highlight;
    if (typeof m.highlightStyle === "string") {
      out.markdown.highlightStyle = m.highlightStyle;
    }
    if (typeof m.allowHtml === "boolean") out.markdown.allowHtml = m.allowHtml;
    if (
      m.allowHtml === "off" ||
      m.allowHtml === "breaks" ||
      m.allowHtml === "raw"
    ) {
      out.markdown.allowHtml = m.allowHtml;
    }
  }

  if (Array.isArray(overlay.bodyClass)) {
    out.bodyClass = overlay.bodyClass.filter((c) => typeof c === "string");
  }

  return out;
}
