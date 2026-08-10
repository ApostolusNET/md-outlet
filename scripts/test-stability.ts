import { readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  assertMarkdownSize,
  MAX_MARKDOWN_CHARS,
  resolveSafeAssetPath,
  rewriteLocalImageSources,
  assetRootFromMarkdownPath,
} from "../src/assets.js";
import { loadProfile } from "../src/load-profile.js";
import { renderHtml } from "../src/render-html.js";
import { exportPdf } from "../src/export-pdf.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const fixtures = resolve(pkgRoot, "examples", "fixtures");
const dotPng = resolve(fixtures, "dot.png");
const withImageMd = resolve(fixtures, "with-image.md");

let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (!ok) failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

function expectThrow(name: string, fn: () => void, needle: string) {
  try {
    fn();
    check(name, false, "expected throw");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(name, msg.includes(needle), msg.slice(0, 120));
  }
}

async function main() {
  check("fixture png exists", existsSync(dotPng));
  check("fixture md exists", existsSync(withImageMd));

  const root = fixtures;
  const abs = resolveSafeAssetPath(root, "dot.png");
  check("resolveSafeAssetPath finds dot.png", abs === resolve(dotPng));

  const missing = resolveSafeAssetPath(root, "no-such.png");
  check("missing asset returns null", missing === null);

  const escape = resolveSafeAssetPath(root, "../sample.md");
  check("path traversal rejected", escape === null);

  const htmlIn = `<p><img src="dot.png" alt="d"><img src="no-such.png" alt="m"><img src="https://example.com/x.png" alt="r"></p>`;
  const fileOut = rewriteLocalImageSources(htmlIn, { rootDir: root, mode: "file" });
  check(
    "file mode rewrites existing to file://",
    fileOut.includes(pathToFileURL(dotPng).href)
  );
  check(
    "file mode leaves missing src alone",
    /src="no-such\.png"/.test(fileOut)
  );
  check(
    "file mode leaves remote src alone",
    fileOut.includes('src="https://example.com/x.png"')
  );

  const apiOut = rewriteLocalImageSources(htmlIn, {
    rootDir: root,
    mode: "api",
    apiOrigin: "http://127.0.0.1:5760",
  });
  check(
    "api mode uses absolute /api/asset",
    apiOut.includes("http://127.0.0.1:5760/api/asset?p=dot.png")
  );
  check("api mode leaves missing alone", /src="no-such\.png"/.test(apiOut));

  const dataOut = rewriteLocalImageSources(htmlIn, {
    rootDir: root,
    mode: "data",
  });
  check("data mode embeds existing as data:", dataOut.includes('src="data:image/png;base64,'));
  check("data mode leaves missing alone", /src="no-such\.png"/.test(dataOut));

  assertMarkdownSize("ok");
  check("small markdown accepted", true);
  expectThrow(
    "oversized markdown rejected",
    () => assertMarkdownSize("x".repeat(MAX_MARKDOWN_CHARS + 1)),
    "too large"
  );

  const profile = loadProfile("default");
  const largeBody = "# Large\n\n" + ("paragraph text. ".repeat(80) + "\n\n").repeat(400);
  check("large markdown under limit", largeBody.length < MAX_MARKDOWN_CHARS);
  const { html: largeHtml } = renderHtml(largeBody, profile, {
    assetRoot: fixtures,
    assetMode: "file",
  });
  check("large markdown renders", largeHtml.includes("<h1"));

  const md = readFileSync(withImageMd, "utf8");
  const { html } = renderHtml(md, profile, {
    assetRoot: assetRootFromMarkdownPath(withImageMd),
    assetMode: "data",
  });
  check("fixture md embeds data: image", html.includes("data:image/png;base64,"));
  check("fixture md keeps missing image src", html.includes("no-such.png"));

  const pdf = await exportPdf({ html, profile, quiet: true });
  check("PDF with missing image does not crash", pdf.byteLength > 500, `${pdf.byteLength} bytes`);

  // Fixture with SVG asset
  check(
    "fixture md embeds SVG as data",
    html.includes("data:image/svg+xml;base64,")
  );

  if (failed) {
    console.error(`\n${failed} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nStability checks passed.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
