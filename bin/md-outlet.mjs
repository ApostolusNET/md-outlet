#!/usr/bin/env node
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");

const distEntry = resolve(pkgRoot, "dist", "cli.js");
const srcEntry = resolve(pkgRoot, "src", "cli.ts");
const tsxCli = resolve(pkgRoot, "node_modules", "tsx", "dist", "cli.mjs");

const args = process.argv.slice(2);

function run(command, commandArgs) {
  const child = spawn(command, commandArgs, {
    stdio: "inherit",
    // Avoid spawning .cmd wrappers on Windows (Node 24+ → spawn EINVAL).
    shell: false,
    windowsHide: true,
  });
  child.on("error", (err) => {
    console.error(err.message);
    process.exit(1);
  });
  child.on("exit", (code) => process.exit(code ?? 0));
}

if (existsSync(distEntry)) {
  run(process.execPath, [distEntry, ...args]);
} else if (existsSync(tsxCli)) {
  // Prefer tsx's JS entry over node_modules/.bin/tsx.cmd (Windows-safe).
  run(process.execPath, [tsxCli, srcEntry, ...args]);
} else {
  console.error(
    "md-outlet: missing dist/ and tsx. Run `npm install` inside md-outlet/."
  );
  process.exit(1);
}
