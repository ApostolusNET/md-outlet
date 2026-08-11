/**
 * HTML policy for Markdown source (profile.markdown.allowHtml).
 *
 * - off: escape all raw HTML tokens from the source
 * - breaks: only page-break / keep-together helpers (SPEC layout hooks)
 * - raw: pass HTML through unchanged (trusted documents only)
 *
 * Boolean compat: false → off, true → breaks (true exists mainly for page-break).
 */

export type AllowHtmlSetting = boolean | "off" | "breaks" | "raw";
export type HtmlMode = "off" | "breaks" | "raw";

export function resolveHtmlMode(allowHtml: AllowHtmlSetting | undefined): HtmlMode {
  if (allowHtml === false || allowHtml === "off") return "off";
  if (allowHtml === "raw") return "raw";
  // true | "breaks" | undefined → breaks
  return "breaks";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** True when a marked HTML token is an allowed layout helper. */
export function isAllowedLayoutHtml(text: string): boolean {
  const s = text.trim();
  if (!s) return true;
  if (/^<\/div>$/i.test(s)) return true;
  if (/^<div\s+class=(["'])keep-together\1\s*>$/i.test(s)) return true;
  if (
    /^<div\s+class=(["'])(?:page-break|md-outlet-page-break)\1(?:\s+aria-hidden=(["'])true\2)?\s*>\s*<\/div>$/i.test(
      s
    )
  ) {
    return true;
  }
  return false;
}

/** Filter one marked `html` token according to mode. */
export function filterHtmlToken(text: string, mode: HtmlMode): string {
  if (mode === "raw") return text;
  if (mode === "off") return escapeHtml(text);
  if (isAllowedLayoutHtml(text)) return text;
  return escapeHtml(text);
}

/**
 * CSP for preview HTML (iframe srcdoc / CLI preview).
 * Default blocks scripts; `raw` relaxes script-src for intentional HTML/JS.
 * Inline theme CSS needs style-src 'unsafe-inline'. Images use 'self' + data:.
 * The UI hotkey bridge upgrades script-src 'none' to a per-load nonce.
 */
export function previewContentSecurityPolicy(mode: HtmlMode): string {
  const common = [
    "default-src 'none'",
    "img-src 'self' data: blob:",
    "style-src 'unsafe-inline'",
    "font-src 'self' data:",
    "base-uri 'self'",
    "form-action 'none'",
    "object-src 'none'",
  ];
  if (mode === "raw") {
    return [...common, "script-src 'unsafe-inline' 'unsafe-eval' 'self'"].join(
      "; "
    );
  }
  return [...common, "script-src 'none'"].join("; ");
}

/** Meta tag for srcdoc (HTTP headers are not applied when assigned to iframe.srcdoc). */
export function previewCspMetaTag(mode: HtmlMode): string {
  const csp = previewContentSecurityPolicy(mode).replace(/"/g, "");
  return `<meta http-equiv="Content-Security-Policy" content="${csp}" />`;
}
