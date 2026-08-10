import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createRequire } from "node:module";
import { Marked } from "marked";
import { markedHighlight } from "marked-highlight";
import hljs from "highlight.js";
import type { Profile } from "./types.js";
import { resolveThemeCssPath } from "./load-profile.js";
import { injectPageBreaks } from "./inject-breaks.js";
import {
  rewriteLocalImageSources,
  type AssetRewriteMode,
} from "./assets.js";

const require = createRequire(import.meta.url);

function loadHighlightStyle(styleName: string): string | null {
  try {
    const hljsPkgDir = dirname(require.resolve("highlight.js/package.json"));
    const cssPath = resolve(hljsPkgDir, "styles", `${styleName}.css`);
    return readFileSync(cssPath, "utf8");
  } catch {
    return null;
  }
}

export interface RenderHtmlOptions {
  /** Resolve relative images against this directory (MD file folder). */
  assetRoot?: string;
  /** How to rewrite local image URLs. Default: "file" when assetRoot set. */
  assetMode?: AssetRewriteMode;
  /** Absolute origin for api mode (fixes iframe srcdoc). */
  apiOrigin?: string;
}

export interface RenderResult {
  html: string;
  themeCssPath: string;
}

export function renderHtml(
  markdown: string,
  profile: Profile,
  options: RenderHtmlOptions = {}
): RenderResult {
  const marked = new Marked();
  if (profile.markdown.highlight) {
    marked.use(
      markedHighlight({
        emptyLangClass: "hljs",
        langPrefix: "hljs language-",
        highlight(code, lang) {
          const language = hljs.getLanguage(lang) ? lang : "plaintext";
          return hljs.highlight(code, { language }).value;
        },
      })
    );
  }
  marked.setOptions({
    gfm: profile.markdown.gfm,
    breaks: false,
  });

  const rawBody = marked.parse(markdown, { async: false }) as string;
  const withBreaks = injectPageBreaks(rawBody, profile.breaks);

  const themeCssPath = resolveThemeCssPath(profile);
  const themeCss = readFileSync(themeCssPath, "utf8");
  const highlightCss = profile.markdown.highlight
    ? loadHighlightStyle(profile.markdown.highlightStyle)
    : null;

  const bodyClass = profile.bodyClass.join(" ");
  const title = profile.meta.name;

  let bodyHtml = withBreaks;
  if (options.assetRoot) {
    bodyHtml = rewriteLocalImageSources(bodyHtml, {
      rootDir: options.assetRoot,
      mode: options.assetMode ?? "file",
      apiOrigin: options.apiOrigin,
    });
  }

  const html = `<!DOCTYPE html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style data-md-outlet="theme">
${themeCss}
    </style>
${
  highlightCss
    ? `    <style data-md-outlet="highlight">
${highlightCss}
    </style>`
    : ""
}
  </head>
  <body class="${escapeHtml(bodyClass)}">
${bodyHtml}
  </body>
</html>
`;
  return { html, themeCssPath };
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
