import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "./ui-http.js";

export const API_TOKEN_HEADER = "x-md-outlet-token";

/** Temp file so CLI handoff can authenticate to an already-running UI. */
export function apiTokenFilePath(port: number): string {
  return join(tmpdir(), `md-outlet-ui-${port}.token`);
}

export function createApiToken(): string {
  const fromEnv = process.env.MD_OUTLET_API_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  return randomBytes(24).toString("hex");
}

export function persistApiToken(port: number, token: string): void {
  try {
    writeFileSync(apiTokenFilePath(port), token, { encoding: "utf8", mode: 0o600 });
  } catch {
    /* best-effort: browser still gets the token via index.html */
  }
}

/** Remove the temp token after a clean UI stop (tab close / Ctrl+C). */
export function clearPersistedApiToken(port: number): void {
  try {
    const file = apiTokenFilePath(port);
    if (existsSync(file)) unlinkSync(file);
  } catch {
    /* ignore */
  }
}

/** Load token for handoff / external clients (env wins, else temp file). */
export function loadApiTokenForPort(port: number): string | null {
  const fromEnv = process.env.MD_OUTLET_API_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const file = apiTokenFilePath(port);
  if (!existsSync(file)) return null;
  try {
    const t = readFileSync(file, "utf8").trim();
    return t || null;
  } catch {
    return null;
  }
}

/**
 * If Origin is present, it must be loopback and the same port.
 * Missing Origin (curl / CLI handoff / some same-origin cases) is allowed.
 */
export function isAllowedApiOrigin(
  req: IncomingMessage,
  port: number
): boolean {
  const raw = req.headers.origin;
  if (raw == null || !String(raw).trim()) return true;
  try {
    const u = new URL(String(raw));
    const host = u.hostname.toLowerCase();
    if (host !== "127.0.0.1" && host !== "localhost" && host !== "::1") {
      return false;
    }
    const originPort = u.port
      ? Number(u.port)
      : u.protocol === "https:"
        ? 443
        : 80;
    return originPort === port;
  } catch {
    return false;
  }
}

/**
 * Guard /api/* requests. Returns true when the request may proceed.
 */
export function authorizeApiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  opts: { token: string; port: number }
): boolean {
  if (!isAllowedApiOrigin(req, opts.port)) {
    json(res, 403, { error: "Forbidden origin" });
    return false;
  }
  const got = req.headers[API_TOKEN_HEADER];
  const value = Array.isArray(got) ? got[0] : got;
  if (!value || value !== opts.token) {
    json(res, 401, { error: "Unauthorized" });
    return false;
  }
  return true;
}
