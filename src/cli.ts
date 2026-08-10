import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, extname } from "node:path";
import { renderHtml } from "./render-html.js";
import { exportPdf } from "./export-pdf.js";
import { startPreview } from "./preview-server.js";
import {
  parseFormat,
  parseOrientation,
  parseScale,
  type ProfileOverrides,
} from "./apply-overrides.js";
import { resolveDocument } from "./resolve-document.js";
import {
  defaultOutputPath,
  initProfile,
  listBuiltInProfiles,
} from "./init-profile.js";
import { startUiServer } from "./ui-server.js";
import { resolveUiSavePath } from "./ui-save-path.js";
import { assetRootFromMarkdownPath, assertMarkdownSize } from "./assets.js";
import { handoffToExistingUi, probeMdOutletUi } from "./ui-handoff.js";

type Command = "pdf" | "html" | "preview" | "init" | "ui" | "help" | "version";

interface Args {
  command: Command;
  input?: string;
  /** init: new profile name */
  initName?: string;
  profile: string;
  profileExplicit: boolean;
  /** init: --based-on */
  basedOn: string;
  output?: string;
  port: number;
  force: boolean;
  description?: string;
  listProfiles: boolean;
  /** ui: skip opening the browser */
  noOpen: boolean;
  overrides: ProfileOverrides;
}

function parseArgs(argv: string[]): Args {
  const out: Args = {
    command: "help",
    profile: "default",
    profileExplicit: false,
    basedOn: "default",
    port: 5757,
    force: false,
    listProfiles: false,
    noOpen: false,
    overrides: {},
  };
  if (argv.length === 0) return out;
  const cmd = argv[0];
  if (cmd === "-h" || cmd === "--help") out.command = "help";
  else if (cmd === "-v" || cmd === "--version") out.command = "version";
  else if (
    cmd === "pdf" ||
    cmd === "html" ||
    cmd === "preview" ||
    cmd === "init" ||
    cmd === "ui"
  ) {
    out.command = cmd;
  } else {
    console.error(`Unknown command: ${cmd}`);
    out.command = "help";
    return out;
  }

  // ui defaults to a different port to avoid clashing with preview
  if (out.command === "ui") {
    out.port = 5760;
    out.profile = "simple-preview";
  }

  const rest = argv.slice(1);
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    const next = () => {
      const v = rest[++i];
      if (v === undefined) throw new Error(`Missing value for ${a}`);
      return v;
    };
    if (a === "--profile" || a === "-p") {
      out.profile = next();
      out.profileExplicit = true;
    } else if (a === "--based-on" || a === "-b") {
      out.basedOn = next();
    } else if (a === "--output" || a === "-o") {
      out.output = next();
    } else if (a === "--port") {
      out.port = Number(next());
    } else if (a === "--force" || a === "-f") {
      out.force = true;
    } else if (a === "--description" || a === "-d") {
      out.description = next();
    } else if (a === "--list" || a === "-l") {
      out.listProfiles = true;
    } else if (a === "--no-open") {
      out.noOpen = true;
    } else if (a === "--simple") {
      // Shortcut: select the simple-preview template (layout follows the template)
      if (!out.profileExplicit) out.profile = "simple-preview";
    } else if (a === "--format") {
      out.overrides.format = parseFormat(next());
    } else if (a === "--orientation") {
      out.overrides.orientation = parseOrientation(next());
    } else if (a === "--margin") {
      out.overrides.marginAll = next();
    } else if (a === "--margin-top") {
      out.overrides.marginTop = next();
    } else if (a === "--margin-right") {
      out.overrides.marginRight = next();
    } else if (a === "--margin-bottom") {
      out.overrides.marginBottom = next();
    } else if (a === "--margin-left") {
      out.overrides.marginLeft = next();
    } else if (a === "--scale") {
      out.overrides.scale = parseScale(next());
    } else if (a.startsWith("-")) {
      throw new Error(`Unknown option: ${a}`);
    } else if (out.command === "init" && !out.initName) {
      out.initName = a;
    } else if (!out.input) {
      out.input = a;
    } else {
      throw new Error(`Unexpected argument: ${a}`);
    }
  }
  return out;
}

function help(): void {
  const text = `md-outlet — reproducible Markdown output (PDF / preview)

Usage:
  md-outlet pdf     <input.md> [options]
  md-outlet html    <input.md> [options]
  md-outlet preview <input.md> [options]
  md-outlet init    <name> [--based-on <profile>] [-o <path>] [--force]
  md-outlet ui      [input.md] [--profile <name|path>] [-o <save.yaml>] [--port 5760] [--simple]

Profile:
  --profile, -p <name|path>   Built-in name or path to YAML/JSON
                              (default: simple-preview for ui, default otherwise)
  --output,  -o <path>        Output path (pdf/html/init/ui-save)
  --port <n>                  preview default 5757 / ui default 5760

Init (Phase 3):
  --based-on, -b <name|path>  Template profile (default: default)
  --description, -d <text>    meta.description for the new profile
  --force, -f                 Overwrite existing output file
  --list, -l                  List built-in profiles and exit

UI (Phase 4):
  Local editor + preview + PDF. Markdown path is optional.
  With no file, starts empty and shows recent files to reopen.
  Header「ガイド」menu opens start guide / sample.
  Save YAML never overwrites bundled profiles/ (-o for a copy).
  Opens the browser by default; pass --no-open to skip.
  --simple   Shortcut for --profile simple-preview (ui default already)

Page overrides (do not modify the profile file; win over front matter):
  --format A4|A3|Letter|Legal
  --orientation portrait|landscape
  --margin <length>           All four sides (e.g. 15mm)
  --margin-top|--margin-right|--margin-bottom|--margin-left <length>
  --scale <0.1-2.0>           PDF only; shrink/enlarge whole page

Front matter (Phase 2) — put at the top of the Markdown file:
  ---
  md-outlet:
    extends: ops-manual
    page:
      orientation: landscape
  ---

Resolve order: base profile → front matter → CLI overrides.

Examples:
  md-outlet ui
  md-outlet ui examples/sample.md
  md-outlet init my-report
  md-outlet ui examples/sample.md --profile default -o ./my-report.yaml
  md-outlet ui doc.md --profile ./my-report.yaml
  md-outlet pdf doc.md --profile ./my-report.yaml

Docs: docs/START.md  README.md  README.ja.md  SPEC.md
`;
  process.stdout.write(text);
}

function replaceExt(inputPath: string, ext: string): string {
  const base = inputPath.replace(new RegExp(`${extname(inputPath)}$`), "");
  return `${base}${ext}`;
}

function resolveFromArgs(args: Args, mdAbs: string) {
  const md = readFileSync(mdAbs, "utf8");
  assertMarkdownSize(md);
  return resolveDocument({
    markdown: md,
    profileRef: args.profile,
    profileExplicit: args.profileExplicit,
    overrides: args.overrides,
  });
}

async function runPdf(args: Args): Promise<void> {
  if (!args.input) throw new Error("Missing input Markdown file.");
  const mdAbs = resolve(process.cwd(), args.input);
  const { body, profile, baseProfile, usedFrontMatter } = resolveFromArgs(
    args,
    mdAbs
  );
  const { html } = renderHtml(body, profile, {
    assetRoot: assetRootFromMarkdownPath(mdAbs),
    assetMode: "data",
  });
  const pdf = await exportPdf({ html, profile });
  const out = resolve(
    process.cwd(),
    args.output ?? replaceExt(mdAbs, ".pdf")
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, pdf);
  const note = usedFrontMatter ? ` (base=${baseProfile}, +front-matter)` : "";
  console.log(`Wrote ${out}${note}`);
}

function runHtml(args: Args): void {
  if (!args.input) throw new Error("Missing input Markdown file.");
  const mdAbs = resolve(process.cwd(), args.input);
  const { body, profile, baseProfile, usedFrontMatter } = resolveFromArgs(
    args,
    mdAbs
  );
  const { html } = renderHtml(body, profile, {
    assetRoot: assetRootFromMarkdownPath(mdAbs),
    assetMode: "file",
  });
  const out = resolve(
    process.cwd(),
    args.output ?? replaceExt(mdAbs, ".html")
  );
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html, "utf8");
  const note = usedFrontMatter ? ` (base=${baseProfile}, +front-matter)` : "";
  console.log(`Wrote ${out}${note}`);
}

function runInit(args: Args): void {
  if (args.listProfiles) {
    const names = listBuiltInProfiles();
    process.stdout.write(
      `Built-in profiles:\n${names.map((n) => `  - ${n}`).join("\n")}\n`
    );
    return;
  }
  if (!args.initName) {
    throw new Error(
      'Missing profile name.\nUsage: md-outlet init <name> [--based-on default|ops-manual]\n       md-outlet init --list'
    );
  }
  const outPath = args.output ?? defaultOutputPath(args.initName);
  const written = initProfile({
    name: args.initName,
    basedOn: args.basedOn,
    outputPath: outPath,
    force: args.force,
    description: args.description,
  });
  console.log(`Wrote ${written}`);
  console.log(`Next: md-outlet pdf your.md --profile ${written}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  switch (args.command) {
    case "help":
      help();
      return;
    case "version": {
      const pkg = JSON.parse(
        readFileSync(new URL("../package.json", import.meta.url), "utf8")
      );
      process.stdout.write(`${pkg.version}\n`);
      return;
    }
    case "pdf":
      await runPdf(args);
      return;
    case "html":
      runHtml(args);
      return;
    case "init":
      runInit(args);
      return;
    case "ui": {
      const savePath = resolveUiSavePath(args.profile, args.output);
      const host = "127.0.0.1";
      const tryHandoff = async (reason: string): Promise<never> => {
        const result = await handoffToExistingUi({
          host,
          port: args.port,
          mdPath: args.input,
          open: !args.noOpen,
        });
        if (!result.ok) {
          console.error(result.error);
          if (result.kind === "full") {
            console.error(`Existing UI: ${result.url}`);
          } else if (result.kind === "not-ui") {
            console.error(
              `Port ${args.port} busy (${reason}). Stop the other process or use --port.`
            );
          }
          process.exit(1);
        }
        if (result.kind === "already") {
          console.log(`md-outlet ui already running: ${result.url}`);
        } else {
          console.log(`Opened in existing UI: ${result.path}`);
          console.log(`md-outlet ui: ${result.url}`);
        }
        process.exit(0);
      };

      // Single-instance: if UI is already up, open there (SendTo / second launch).
      if (await probeMdOutletUi(host, args.port)) {
        await tryHandoff("already listening");
      }

      try {
        await startUiServer({
          mdPath: args.input,
          profileRef: args.profile,
          savePath,
          port: args.port,
          open: !args.noOpen,
        });
      } catch (err) {
        const code =
          err && typeof err === "object" && "code" in err
            ? String((err as { code?: unknown }).code)
            : "";
        if (code === "EADDRINUSE") {
          await tryHandoff("EADDRINUSE");
        }
        throw err;
      }
      return;
    }
    case "preview":
      if (!args.input) throw new Error("Missing input Markdown file.");
      await startPreview({
        mdPath: args.input,
        profileRef: args.profile,
        profileExplicit: args.profileExplicit,
        port: args.port,
        overrides: args.overrides,
      });
      return;
  }
}

main()
  .then(() => {
    const cmd = process.argv[2];
    if (cmd !== "preview" && cmd !== "ui") process.exit(0);
  })
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
