import { existsSync, readFileSync } from "node:fs";
import {
  dirname,
  extname,
  isAbsolute,
  normalize,
  resolve,
  sep,
} from "node:path";
import { pathToFileURL } from "node:url";

export type AssetRewriteMode = "file" | "api" | "data";

/** Soft ceiling so huge paste/open does not hang the process silently. */
export const MAX_MARKDOWN_CHARS = 2_000_000;

export function assertMarkdownSize(markdown: string): void {
  if (markdown.length > MAX_MARKDOWN_CHARS) {
    throw new Error(
      `Markdown too large (${markdown.length.toLocaleString()} chars; max ${MAX_MARKDOWN_CHARS.toLocaleString()}). Split the file or shorten it.`
    );
  }
}

export function guessAssetMime(filePath: string): string {
  switch (extname(filePath).toLowerCase()) {
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}

export interface RewriteAssetsOptions {
  /** Directory that relative asset paths are resolved against (usually the MD file's folder). */
  rootDir: string;
  mode: AssetRewriteMode;
  /** Prefix for API mode, e.g. "/api/asset" */
  apiPath?: string;
  /**
   * Origin for absolute API URLs (e.g. "http://127.0.0.1:5760").
   * Needed because iframe srcdoc does not reliably resolve root-relative paths.
   */
  apiOrigin?: string;
}

function isRemoteOrData(src: string): boolean {
  return /^(https?:|data:|blob:|\/\/)/i.test(src.trim());
}

/**
 * Resolve a relative asset path against rootDir and ensure it does not escape rootDir.
 * Returns null if missing or outside the root.
 */
export function resolveSafeAssetPath(
  rootDir: string,
  relativeOrAbsolute: string
): string | null {
  const root = resolve(rootDir);
  const candidate = isAbsolute(relativeOrAbsolute)
    ? resolve(relativeOrAbsolute)
    : resolve(root, relativeOrAbsolute);
  const normalized = normalize(candidate);
  const rootWithSep = root.endsWith(sep) ? root : root + sep;
  if (normalized !== root && !normalized.startsWith(rootWithSep)) {
    return null;
  }
  if (!existsSync(normalized)) return null;
  return normalized;
}

function toFileUrl(absPath: string): string {
  return pathToFileURL(absPath).href;
}

function toDataUrl(absPath: string): string {
  const buf = readFileSync(absPath);
  const mime = guessAssetMime(absPath);
  return `data:${mime};base64,${buf.toString("base64")}`;
}

function toApiUrl(
  apiPath: string,
  absPath: string,
  rootDir: string,
  apiOrigin?: string
): string {
  const root = resolve(rootDir);
  let rel = absPath.slice(root.length);
  if (rel.startsWith(sep)) rel = rel.slice(1);
  const encoded = rel.split(sep).map(encodeURIComponent).join("/");
  const pathAndQuery = `${apiPath}?p=${encoded}`;
  if (apiOrigin) {
    return `${apiOrigin.replace(/\/$/, "")}${pathAndQuery}`;
  }
  return pathAndQuery;
}

/**
 * Rewrite <img src="..."> local relative/absolute paths so preview and PDF can load them.
 * - data: embedded base64 (reliable in PDF and iframe srcdoc)
 * - file: file:///... (Puppeteer with allow-file-access-from-files)
 * - api: /api/asset?p=... or absolute origin+/api/asset (UI preview)
 */
export function rewriteLocalImageSources(
  html: string,
  opts: RewriteAssetsOptions
): string {
  const apiPath = opts.apiPath ?? "/api/asset";
  return html.replace(
    /<img\b([^>]*?)\bsrc\s*=\s*(["'])([^"']+)\2([^>]*)>/gi,
    (full, pre: string, quote: string, src: string, post: string) => {
      if (isRemoteOrData(src)) return full;
      const abs = resolveSafeAssetPath(opts.rootDir, src);
      if (!abs) return full;
      let next: string;
      if (opts.mode === "data") {
        next = toDataUrl(abs);
      } else if (opts.mode === "file") {
        next = toFileUrl(abs);
      } else {
        next = toApiUrl(apiPath, abs, opts.rootDir, opts.apiOrigin);
      }
      return `<img${pre}src=${quote}${next}${quote}${post}>`;
    }
  );
}

export function assetRootFromMarkdownPath(mdPath: string): string {
  return dirname(resolve(mdPath));
}
