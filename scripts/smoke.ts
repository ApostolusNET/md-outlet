import { readFileSync, existsSync, statSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProfile } from "../src/load-profile.js";
import { renderHtml } from "../src/render-html.js";
import { exportPdf } from "../src/export-pdf.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const examplesDir = resolve(pkgRoot, "examples");

async function run() {
  const cases = [
    { md: "sample.md", profile: "default", out: "sample.pdf" },
    { md: "sample.md", profile: "ops-manual", out: "sample-ops.pdf" },
  ];

  for (const c of cases) {
    const mdPath = resolve(examplesDir, c.md);
    if (!existsSync(mdPath)) throw new Error(`missing ${mdPath}`);
    const md = readFileSync(mdPath, "utf8");
    const profile = loadProfile(c.profile);
    const { html } = renderHtml(md, profile);
    const pdf = await exportPdf({ html, profile });
    const outPath = resolve(examplesDir, c.out);
    const { writeFileSync } = await import("node:fs");
    writeFileSync(outPath, pdf);
    const size = statSync(outPath).size;
    if (size < 1024) {
      throw new Error(`PDF too small: ${outPath} (${size} bytes)`);
    }
    console.log(`OK  ${c.profile.padEnd(12)}  ${outPath}  ${size} bytes`);
  }
  console.log("Smoke passed.");
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.stack ?? err.message : err);
    process.exit(1);
  });
