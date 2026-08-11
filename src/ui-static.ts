import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { LOCALES_DIR } from "./i18n.js";

export const UI_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..", "ui");

/** MIME for the UI's own static assets (styles.css / js/*). */
export function uiAssetMime(abs: string): string {
  if (abs.endsWith(".css")) return "text/css; charset=utf-8";
  if (abs.endsWith(".mjs") || abs.endsWith(".js"))
    return "text/javascript; charset=utf-8";
  if (abs.endsWith(".map")) return "application/json; charset=utf-8";
  return "application/octet-stream";
}

function underRoot(abs: string, root: string): boolean {
  const rootSep = root.endsWith(sep) ? root : root + sep;
  return abs.startsWith(rootSep);
}

/**
 * Serve index.html, /locales/*, and UI static assets (/styles.css, /js/*).
 * @returns true if the request was handled (including 404 for bad static paths).
 */
export function tryServeUiStatic(
  req: IncomingMessage,
  res: ServerResponse,
  path: string,
  opts?: { apiToken?: string }
): boolean {
  if (req.method !== "GET") return false;

  if (path === "/" || path === "/index.html") {
    let html = readFileSync(resolve(UI_DIR, "index.html"), "utf8");
    if (opts?.apiToken) {
      const meta = `<meta name="md-outlet-api-token" content="${opts.apiToken.replace(/"/g, "")}" />`;
      if (html.includes("</head>")) {
        html = html.replace("</head>", `  ${meta}\n</head>`);
      } else {
        html = meta + html;
      }
    }
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return true;
  }

  if (path.startsWith("/locales/")) {
    const name = path.slice("/locales/".length);
    if (!/^(ja|en)\.json$/.test(name)) {
      res.writeHead(404).end("Not found");
      return true;
    }
    const abs = resolve(LOCALES_DIR, name);
    if (!underRoot(abs, LOCALES_DIR) || !existsSync(abs)) {
      res.writeHead(404).end("Not found");
      return true;
    }
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(readFileSync(abs));
    return true;
  }

  if (path === "/styles.css" || path.startsWith("/js/")) {
    const rel = path.replace(/^\/+/, "");
    const abs = resolve(UI_DIR, rel);
    if (!underRoot(abs, UI_DIR) || !existsSync(abs)) {
      res.writeHead(404).end("Not found");
      return true;
    }
    const mime = uiAssetMime(abs);
    res.writeHead(200, {
      "Content-Type": mime,
      "Cache-Control": "no-store",
    });
    res.end(readFileSync(abs));
    return true;
  }

  return false;
}
