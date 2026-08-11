import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";
import { t } from "../i18n.js";
import {
  assertMarkdownSize,
  guessAssetMime,
  resolveSafeAssetPath,
} from "../assets.js";
import {
  dataPreviewHtml,
  detectDocKind,
  fallbackDataDocName,
  isDataDocKind,
  type DataDocKind,
} from "../file-kind.js";
import { activeTab, setActiveText } from "../ui-tabs.js";
import { profileFromPayload } from "../serialize-profile.js";
import { renderHtml } from "../render-html.js";
import { json, readJsonBody } from "../ui-http.js";
import { stripSource } from "../ui-profile-util.js";
import { requirePlainObject } from "../ui-validate.js";
import {
  previewContentSecurityPolicy,
  resolveHtmlMode,
} from "../html-mode.js";
import type { UiContext } from "../ui-context.js";

/**
 * Preview HTML + sandboxed document assets.
 * @returns true if the request was handled.
 */
export async function tryHandlePreviewRoutes(ctx: UiContext): Promise<boolean> {
  const { req, res, url, path, method, lang, session } = ctx;

  if (method === "GET" && path === "/api/asset") {
    const rel = url.searchParams.get("p") || "";
    const assetRoot = session.activeAssetRoot();
    const abs = resolveSafeAssetPath(assetRoot, decodeURIComponent(rel));
    if (!abs || !existsSync(abs)) {
      res.writeHead(404).end("Not found");
      return true;
    }
    const buf = readFileSync(abs);
    res.writeHead(200, {
      "Content-Type": guessAssetMime(abs),
      "Cache-Control": "no-store",
    });
    res.end(buf);
    return true;
  }

  if (method === "POST" && path === "/api/preview") {
    const raw = await readJsonBody<{
      profile?: Record<string, unknown>;
      markdown?: string;
    }>(req);
    const mdAbs = session.activePath();
    let tabState = session.getTabState();
    const text =
      typeof raw.markdown === "string"
        ? raw.markdown
        : activeTab(tabState)?.text ??
          (mdAbs && existsSync(mdAbs) ? readFileSync(mdAbs, "utf8") : "");

    // Data docs (xml/json/yaml/txt/log/csv): scan-only preview (not MD→HTML).
    {
      const kind = detectDocKind(mdAbs);
      if (isDataDocKind(kind)) {
        assertMarkdownSize(text);
        // Keep in-memory text in sync when the client sends editor contents.
        if (typeof raw.markdown === "string") {
          tabState = setActiveText(tabState, raw.markdown);
          session.setTabState(tabState);
        }
        const html = dataPreviewHtml(
          kind as DataDocKind,
          text,
          mdAbs
            ? basename(mdAbs)
            : fallbackDataDocName(kind as DataDocKind),
          lang
        );
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy": previewContentSecurityPolicy("breaks"),
        });
        res.end(html);
        return true;
      }
    }

    if (!raw.profile || typeof raw.profile !== "object") {
      json(res, 400, { error: "Missing profile object" });
      return true;
    }
    const profileObj = requirePlainObject(raw.profile, "profile object");
    assertMarkdownSize(text);
    const body = session.bodyFromMarkdown(text);
    const profile = profileFromPayload(session.getBaseProfile(), profileObj);
    const host =
      req.headers.host || `${session.host}:${session.port}`;
    const apiOrigin = `${url.protocol}//${host}`;
    const htmlMode = resolveHtmlMode(profile.markdown.allowHtml);
    const { html } = renderHtml(body, stripSource(profile), {
      assetRoot: session.activeAssetRoot(),
      assetMode: "api",
      apiOrigin,
    });
    // Screen chrome only (not used for PDF): readable measure + side/bottom padding.
    // <base> helps any remaining root-relative URLs inside iframe srcdoc.
    const pageBreakCss = JSON.stringify(t(lang, "preview.pageBreakLabel"));
    const withChrome = html.replace(
      "</head>",
      `<base href="${apiOrigin}/" />
<style data-md-outlet="preview-chrome">
html {
  --md-outlet-page-break-label: ${pageBreakCss};
  background: #fff;
}
body {
  max-width: 46rem;
  margin: 0 auto;
  padding: 1.75rem 2rem 3rem;
  box-sizing: border-box;
}
img { max-width: 100%; height: auto; }
</style></head>`
    );
    res.writeHead(200, {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Security-Policy": previewContentSecurityPolicy(htmlMode),
    });
    res.end(withChrome);
    return true;
  }

  return false;
}
