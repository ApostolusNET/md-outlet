import { readFileSync, unlinkSync, existsSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import {
  initProfile,
  listBuiltInProfiles,
  assertProfileName,
  defaultOutputPath,
} from "../src/init-profile.js";
import { loadProfile } from "../src/load-profile.js";

const here = dirname(fileURLToPath(import.meta.url));
const tmpDir = resolve(here, "..", "examples", ".tmp-init");

let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (!ok) failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

mkdirSync(tmpDir, { recursive: true });

{
  const names = listBuiltInProfiles();
  check("lists default", names.includes("default"));
  check("lists ops-manual", names.includes("ops-manual"));
}

{
  let threw = false;
  try {
    assertProfileName("1bad");
  } catch {
    threw = true;
  }
  check("rejects bad name", threw);
  check("accepts good name", assertProfileName("my-report") === "my-report");
}

{
  const out = resolve(tmpDir, "my-report.yaml");
  if (existsSync(out)) unlinkSync(out);
  const written = initProfile({
    name: "my-report",
    basedOn: "ops-manual",
    outputPath: out,
    description: "Team ops profile",
  });
  check("wrote path", written === out);
  const raw = readFileSync(out, "utf8");
  check("has header comment", raw.includes("md-outlet profile"));
  const doc2 = parseYaml(raw) as {
    meta: { name: string; description: string };
    breaks: { beforeHeadings: string[] };
    page: { format: string };
  };
  check("meta.name", doc2.meta.name === "my-report");
  check("description", doc2.meta.description === "Team ops profile");
  check("copied h1 breaks", doc2.breaks.beforeHeadings.includes("h1"));
  check("loadable", loadProfile(out).meta.name === "my-report");

  let refused = false;
  try {
    initProfile({
      name: "my-report",
      basedOn: "default",
      outputPath: out,
    });
  } catch {
    refused = true;
  }
  check("refuses overwrite", refused);

  const forced = initProfile({
    name: "my-report",
    basedOn: "default",
    outputPath: out,
    force: true,
  });
  check("force overwrite", forced === out);
  check(
    "forced from default",
    loadProfile(out).breaks.beforeHeadings.length === 0
  );
  unlinkSync(out);
}

{
  check("default path", defaultOutputPath("x") === "x.yaml");
}

if (failed > 0) {
  console.error(`${failed} init case(s) failed.`);
  process.exit(1);
}
console.log("All init cases passed.");
