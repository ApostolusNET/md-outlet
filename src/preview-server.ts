import { createServer } from "node:http";
import { readFileSync, watch, existsSync } from "node:fs";
import { resolve } from "node:path";
import { renderHtml } from "./render-html.js";
import { type ProfileOverrides } from "./apply-overrides.js";
import { resolveDocument } from "./resolve-document.js";
import {
  assertMarkdownSize,
  assetRootFromMarkdownPath,
  guessAssetMime,
  resolveSafeAssetPath,
} from "./assets.js";

export interface PreviewOptions {
  mdPath: string;
  profileRef: string;
  profileExplicit?: boolean;
  port: number;
  host?: string;
  overrides?: ProfileOverrides;
}

export async function startPreview(opts: PreviewOptions): Promise<void> {
  const mdAbs = resolve(process.cwd(), opts.mdPath);
  const assetRoot = assetRootFromMarkdownPath(mdAbs);

  const buildPage = (): string => {
    const md = readFileSync(mdAbs, "utf8");
    assertMarkdownSize(md);
    const { body, profile } = resolveDocument({
      markdown: md,
      profileRef: opts.profileRef,
      profileExplicit: opts.profileExplicit,
      overrides: opts.overrides,
    });
    const { html } = renderHtml(body, profile, {
      assetRoot,
      assetMode: "api",
      apiOrigin: `http://${opts.host ?? "127.0.0.1"}:${opts.port}`,
    });
    return html.replace(
      "</body>",
      `<script>
        (function(){
          var evt = new EventSource('/__mdoutlet/events');
          evt.addEventListener('change', function(){ location.reload(); });
        })();
      </script></body>`
    );
  };

  const listeners = new Set<(chunk: string) => void>();

  watch(mdAbs, { persistent: true }, () => {
    for (const send of listeners) send("event: change\ndata: 1\n\n");
  });

  const server = createServer((req, res) => {
    if (!req.url) {
      res.writeHead(404).end();
      return;
    }
    const url = new URL(req.url, `http://${opts.host ?? "127.0.0.1"}`);
    if (url.pathname === "/__mdoutlet/events") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      const send = (chunk: string) => res.write(chunk);
      listeners.add(send);
      req.on("close", () => listeners.delete(send));
      return;
    }
    if (url.pathname === "/api/asset") {
      const rel = url.searchParams.get("p") || "";
      const abs = resolveSafeAssetPath(assetRoot, decodeURIComponent(rel));
      if (!abs || !existsSync(abs)) {
        res.writeHead(404).end("Not found");
        return;
      }
      try {
        const buf = readFileSync(abs);
        res.writeHead(200, {
          "Content-Type": guessAssetMime(abs),
          "Cache-Control": "no-store",
        });
        res.end(buf);
      } catch (err) {
        res.writeHead(500).end(String(err));
      }
      return;
    }
    try {
      const html = buildPage();
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(String(err instanceof Error ? err.message : err));
    }
  });

  await new Promise<void>((r) =>
    server.listen(opts.port, opts.host ?? "127.0.0.1", () => r())
  );
  const url = `http://${opts.host ?? "127.0.0.1"}:${opts.port}/`;
  console.log(`md-outlet preview: ${url}`);
  console.log("Watching:", mdAbs);
  console.log("Ctrl+C to stop.");

  await new Promise<void>((resolveDone) => {
    server.on("close", () => resolveDone());
  });
}
