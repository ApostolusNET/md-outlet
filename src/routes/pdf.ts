import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname } from "node:path";
import { assertMarkdownSize } from "../assets.js";
import { detectDocKind, isDataDocKind } from "../file-kind.js";
import { exportPdf } from "../export-pdf.js";
import { renderHtml } from "../render-html.js";
import { profileFromPayload } from "../serialize-profile.js";
import { activeTab, setActiveText } from "../ui-tabs.js";
import { json, readJsonBody } from "../ui-http.js";
import { stripSource } from "../ui-profile-util.js";
import {
  ensureExtension,
  requirePlainObject,
  resolveUserPath,
} from "../ui-validate.js";
import {
  needsOutsideWriteConfirm,
  outsidePackagePayload,
  trustDirsForActiveDoc,
} from "../path-policy.js";
import type { UiContext } from "../ui-context.js";

/**
 * PDF export and last-export download.
 * @returns true if the request was handled.
 */
export async function tryHandlePdfRoutes(ctx: UiContext): Promise<boolean> {
  const { req, res, path, method, msg, session } = ctx;

  if (method === "POST" && path === "/api/export-pdf") {
    const mdAbs = session.activePath();
    {
      const kind = detectDocKind(mdAbs);
      if (isDataDocKind(kind)) {
        json(res, 400, {
          error: msg.pdfViewOnly(kind.toUpperCase()),
        });
        return true;
      }
    }
    const raw = await readJsonBody<{
      profile?: Record<string, unknown>;
      markdown?: string;
      outputPath?: string;
      confirmOutside?: boolean;
    }>(req);
    if (!raw.profile || typeof raw.profile !== "object") {
      json(res, 400, { error: "Missing profile object" });
      return true;
    }
    const profileObj = requirePlainObject(raw.profile, "profile object");
    let tabState = session.getTabState();
    const md =
      typeof raw.markdown === "string"
        ? raw.markdown
        : activeTab(tabState)?.text ??
          (mdAbs && existsSync(mdAbs) ? readFileSync(mdAbs, "utf8") : "");
    assertMarkdownSize(md);

    let requested = raw.outputPath?.trim() || "";
    if (!requested) {
      if (!mdAbs) {
        json(res, 400, {
          error: msg.pdfNoTarget,
        });
        return true;
      }
      requested = mdAbs.replace(/\.md$/i, "") + ".pdf";
    } else {
      requested = ensureExtension(requested, ".pdf");
    }
    const out = resolveUserPath(requested);
    if (
      needsOutsideWriteConfirm(out, trustDirsForActiveDoc(mdAbs)) &&
      raw.confirmOutside !== true
    ) {
      json(res, 409, outsidePackagePayload(out));
      return true;
    }

    if (typeof raw.markdown === "string") {
      tabState = setActiveText(tabState, raw.markdown);
      session.setTabState(tabState);
    }
    const body = session.bodyFromMarkdown(md);
    const profile = stripSource(
      profileFromPayload(session.getBaseProfile(), profileObj)
    );
    const { html } = renderHtml(body, profile, {
      assetRoot: session.activeAssetRoot(),
      assetMode: "data",
    });
    const pdf = await exportPdf({ html, profile });
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, pdf);
    session.setLastPdfPath(out);
    console.log(`PDF written: ${out}`);
    json(res, 200, {
      ok: true,
      path: out,
      viewUrl: "/api/pdf",
    });
    return true;
  }

  if (method === "GET" && path === "/api/pdf") {
    const lastPdfPath = session.getLastPdfPath();
    if (!lastPdfPath || !existsSync(lastPdfPath)) {
      json(res, 404, { error: "No PDF exported yet" });
      return true;
    }
    const buf = readFileSync(lastPdfPath);
    const name = basename(lastPdfPath);
    // HTTP headers must be ASCII; Japanese names use RFC 5987 filename*.
    const asciiFallback =
      name.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_") ||
      "document.pdf";
    const disposition = `inline; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(name)}`;
    res.writeHead(200, {
      "Content-Type": "application/pdf",
      "Content-Disposition": disposition,
      "Cache-Control": "no-store",
      "Content-Length": buf.byteLength,
    });
    res.end(buf);
    return true;
  }

  return false;
}
