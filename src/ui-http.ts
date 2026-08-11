import type { IncomingMessage, ServerResponse } from "node:http";
import { HttpError, MAX_REQUEST_BODY_BYTES } from "./ui-validate.js";

/** Read the full request body as UTF-8 text (bounded). */
export function readBody(
  req: IncomingMessage,
  maxBytes = MAX_REQUEST_BODY_BYTES
): Promise<string> {
  return new Promise((resolveBody, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      try {
        req.destroy();
      } catch {
        /* ignore */
      }
      reject(err);
    };
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > maxBytes) {
        fail(
          new HttpError(
            413,
            `Request body too large (max ${maxBytes.toLocaleString()} bytes)`
          )
        );
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => {
      if (settled) return;
      settled = true;
      resolveBody(Buffer.concat(chunks).toString("utf8"));
    });
    req.on("error", (err) => fail(err instanceof Error ? err : new Error(String(err))));
  });
}

/** Parse JSON body (throws HttpError 400 on invalid JSON). */
export async function readJsonBody<T = unknown>(
  req: IncomingMessage
): Promise<T> {
  const text = await readBody(req);
  if (!text.trim()) {
    throw new HttpError(400, "Empty JSON body");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON body");
  }
}

/** Send a JSON response with no-store cache. */
export function json(res: ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(body);
}
