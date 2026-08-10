import { readFileSync, readdirSync } from "node:fs";
import { resolve, dirname, extname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import Ajv from "ajv";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const schema = JSON.parse(
  readFileSync(resolve(pkgRoot, "schemas", "profile-v1.json"), "utf8")
);

const ajv = new Ajv({ allErrors: true, strict: false, useDefaults: true });
const validate = ajv.compile(schema);

const profilesDir = resolve(pkgRoot, "profiles");
const files = readdirSync(profilesDir).filter((f) =>
  [".yaml", ".yml", ".json"].includes(extname(f).toLowerCase())
);

let failed = 0;
for (const f of files) {
  const abs = resolve(profilesDir, f);
  const text = readFileSync(abs, "utf8");
  const data =
    extname(abs).toLowerCase() === ".json" ? JSON.parse(text) : parseYaml(text);
  const ok = validate(data);
  if (ok) {
    console.log(`OK    ${f}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${f}`);
    for (const e of validate.errors ?? []) {
      console.log(`      - ${e.instancePath || "/"} ${e.message}`);
    }
  }
}

if (failed > 0) {
  console.error(`${failed} profile(s) failed validation.`);
  process.exit(1);
}
console.log(`All ${files.length} profile(s) valid.`);
