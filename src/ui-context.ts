import type { IncomingMessage, ServerResponse } from "node:http";
import type { Lang } from "./i18n.js";
import type { Profile } from "./types.js";
import type { UiMsgBag } from "./ui-messages.js";
import type { UiTabState } from "./ui-tabs.js";

export interface UiFlash {
  id: number;
  kind: "ok" | "err";
  message: string;
  at: number;
}

export type OpenDocPathResult =
  | { ok: true; tabState: UiTabState; kind: string; text: string }
  | { ok: false; status: number; error: string };

/**
 * Mutable UI session surface shared by route handlers.
 * Implemented inside startUiServer; handlers must not reach into closures.
 */
export interface UiSession {
  getTabState(): UiTabState;
  setTabState(next: UiTabState): void;
  activePath(): string | null;
  openDocPath(
    absPath: string,
    options: { replaceWhenFull: boolean; msg?: UiMsgBag }
  ): OpenDocPathResult;
  snapshotState(): Record<string, unknown>;
  noteSnapshot(): { docNote: string; docNotePath: string | null };
  setUiFlash(kind: "ok" | "err", message: string): void;
  /** Current flash object (may be expired for clients; handlers may still echo it). */
  getUiFlash(): UiFlash | null;
  clearLastPdf(): void;

  getBaseProfile(): Profile;
  setBaseProfile(profile: Profile): void;
  getProfileRef(): string;
  setProfileRef(ref: string): void;
  getSaveAbs(): string;
  setSaveAbs(path: string): void;
  getLastPdfPath(): string | null;
  setLastPdfPath(path: string | null): void;
  bodyFromMarkdown(markdown: string): string;
  activeAssetRoot(): string;
  host: string;
  port: number;
  /** Reload base profile from current profileRef (used by GET /api/state). */
  refreshBaseProfile(): void;
}

/** Per-request context after language adoption and URL parse. */
export interface UiContext {
  req: IncomingMessage;
  res: ServerResponse;
  url: URL;
  path: string;
  method: string;
  lang: Lang;
  msg: UiMsgBag;
  session: UiSession;
}

export interface UiSessionLang {
  adoptLangFromReq(req: IncomingMessage): Lang;
  msgFor(lang?: Lang): UiMsgBag;
}

/** Route handler: return true if the request was fully handled. */
export type UiRouteHandler = (ctx: UiContext) => boolean | Promise<boolean>;

/**
 * Build a request context (pathname, method, lang, msg) for route dispatch.
 */
export function beginUiRequest(
  req: IncomingMessage,
  res: ServerResponse,
  hostHint: string,
  session: UiSession & UiSessionLang
): UiContext {
  const url = new URL(req.url ?? "/", `http://${hostHint}`);
  const lang = session.adoptLangFromReq(req);
  const msg = session.msgFor(lang);
  return {
    req,
    res,
    url,
    path: url.pathname,
    method: (req.method || "GET").toUpperCase(),
    lang,
    msg,
    session,
  };
}
