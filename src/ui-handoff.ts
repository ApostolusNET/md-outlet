/**
 * Single-instance handoff: when UI port is already taken, open the file
 * in the running md-outlet UI instead of starting a second server.
 *
 * Does not call openBrowser — reopening http://127.0.0.1:5760/ often creates
 * a duplicate browser tab. The existing page picks up tab changes via poll.
 */

import { isAbsolute, resolve } from "node:path";
import { UI_MSG } from "./ui-messages.js";
import { API_TOKEN_HEADER, loadApiTokenForPort } from "./ui-auth.js";

export type HandoffResult =
  | { ok: true; kind: "opened" | "activated" | "already"; url: string; path?: string }
  | { ok: false; kind: "full" | "not-ui" | "error"; error: string; url: string };

function uiUrl(host: string, port: number): string {
  return `http://${host}:${port}/`;
}

function tokenHeaders(port: number): Record<string, string> {
  const token = loadApiTokenForPort(port);
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers[API_TOKEN_HEADER] = token;
  return headers;
}

/** True when /api/state looks like md-outlet UI (not some other service). */
export async function probeMdOutletUi(
  host: string,
  port: number,
  timeoutMs = 600
): Promise<boolean> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${uiUrl(host, port)}api/state`, {
      signal: ctrl.signal,
      headers: tokenHeaders(port),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      tabMax?: unknown;
      builtins?: unknown;
      profileRef?: unknown;
    };
    return (
      typeof data.tabMax === "number" ||
      Array.isArray(data.builtins) ||
      typeof data.profileRef === "string"
    );
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Hand a document (or just acknowledge) to an already-running UI on host:port.
 * `open` is accepted for API compat but ignored (never spawns a browser).
 */
export async function handoffToExistingUi(opts: {
  host?: string;
  port: number;
  mdPath?: string;
  open?: boolean;
}): Promise<HandoffResult> {
  const host = opts.host ?? "127.0.0.1";
  const url = uiUrl(host, opts.port);
  const isUi = await probeMdOutletUi(host, opts.port);
  if (!isUi) {
    return {
      ok: false,
      kind: "not-ui",
      error: UI_MSG.portNotUi(opts.port),
      url,
    };
  }

  const requested = opts.mdPath?.trim();
  if (!requested) {
    return { ok: true, kind: "already", url };
  }

  const abs = isAbsolute(requested)
    ? resolve(requested)
    : resolve(process.cwd(), requested);

  try {
    const res = await fetch(`${url}api/tabs/open`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...tokenHeaders(opts.port),
      },
      body: JSON.stringify({ path: abs }),
    });
    const data = (await res.json()) as {
      error?: string;
      path?: string;
      tabs?: unknown[];
    };
    if (res.status === 409) {
      return {
        ok: false,
        kind: "full",
        error: data.error || UI_MSG.tabFull,
        url,
      };
    }
    if (!res.ok) {
      return {
        ok: false,
        kind: "error",
        error: data.error || `Failed to open in existing UI (${res.status})`,
        url,
      };
    }
    return {
      ok: true,
      kind: "opened",
      url,
      path: typeof data.path === "string" ? data.path : abs,
    };
  } catch (err) {
    return {
      ok: false,
      kind: "error",
      error: err instanceof Error ? err.message : String(err),
      url,
    };
  }
}
