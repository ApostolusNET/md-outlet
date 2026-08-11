import type { UiContext, UiRouteHandler } from "../ui-context.js";
import { tryHandleDocumentRoutes } from "./document.js";
import { tryHandlePdfRoutes } from "./pdf.js";
import { tryHandlePreviewRoutes } from "./preview.js";
import { tryHandleSessionRoutes } from "./session.js";
import { tryHandleTabRoutes } from "./tabs.js";

/**
 * Ordered API route table (first match wins).
 * Static UI assets and /api/shutdown stay in ui-server (lifecycle).
 */
export const apiRouteTable: UiRouteHandler[] = [
  tryHandleSessionRoutes,
  tryHandlePreviewRoutes,
  tryHandleDocumentRoutes,
  tryHandleTabRoutes,
  tryHandlePdfRoutes,
];

/** Run handlers until one reports handled. */
export async function dispatchApiRoutes(ctx: UiContext): Promise<boolean> {
  for (const handler of apiRouteTable) {
    if (await handler(ctx)) return true;
  }
  return false;
}
