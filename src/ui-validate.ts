import { isAbsolute, basename, resolve } from "node:path";
import { MAX_MARKDOWN_CHARS } from "./assets.js";

/** Soft ceiling for a single HTTP request body (UTF-8). */
export const MAX_REQUEST_BODY_BYTES = Math.max(8 * 1024 * 1024, MAX_MARKDOWN_CHARS * 4);

export class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.statusCode = statusCode;
  }
}

/** Reject null bytes / newlines that break path handling or logs. */
export function assertSafePathString(pathStr: string, label = "path"): void {
  if (typeof pathStr !== "string" || !pathStr.trim()) {
    throw new HttpError(400, `Missing ${label}`);
  }
  if (/[\0\r\n]/.test(pathStr)) {
    throw new HttpError(400, `Invalid ${label}`);
  }
}

/**
 * Resolve a user-supplied path (absolute / UNC keep their root; else cwd-relative).
 */
export function resolveUserPath(requested: string): string {
  assertSafePathString(requested);
  const trimmed = requested.trim();
  return isAbsolute(trimmed) ? resolve(trimmed) : resolve(process.cwd(), trimmed);
}

/**
 * Basename-only filename for imports (no traversal segments).
 * @returns null when invalid
 */
export function safeBasename(filename: string): string | null {
  const raw = String(filename || "").trim();
  if (!raw) return null;
  const name = basename(raw);
  if (!name || name === "." || name === ".." || /[/\\]/.test(name)) return null;
  if (/[\0\r\n]/.test(name)) return null;
  return name;
}

/** Ensure a save/export path ends with the given extension (case-insensitive). */
export function ensureExtension(pathStr: string, extWithDot: string): string {
  const ext = extWithDot.startsWith(".") ? extWithDot : `.${extWithDot}`;
  const re = new RegExp(`${ext.replace(".", "\\.")}$`, "i");
  return re.test(pathStr) ? pathStr : pathStr + ext;
}

/** Require a plain object (JSON object payload). */
export function requirePlainObject(
  value: unknown,
  label = "object"
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new HttpError(400, `Missing ${label}`);
  }
  return value as Record<string, unknown>;
}
