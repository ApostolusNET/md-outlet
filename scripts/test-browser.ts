import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  browserNotFoundMessage,
  formatBrowserResolution,
  resolvePdfBrowser,
  systemBrowserCandidates,
} from "../src/resolve-browser.js";

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
    check(name, msg.includes(needle), msg.slice(0, 160));
  }
}

const scratch = join(tmpdir(), `md-outlet-browser-test-${process.pid}`);
mkdirSync(scratch, { recursive: true });
const fakeEdge = join(scratch, "msedge.exe");
writeFileSync(fakeEdge, "");

try {
  const winCandidates = systemBrowserCandidates("win32", {
    ProgramFiles: "C:\\Program Files",
    "ProgramFiles(x86)": "C:\\Program Files (x86)",
  });
  check(
    "win32 lists Edge before Chrome",
    winCandidates[0]?.source === "edge" &&
      winCandidates.some((c) => c.source === "chrome")
  );

  const macCandidates = systemBrowserCandidates("darwin", {});
  check("darwin lists Chrome first", macCandidates[0]?.source === "chrome");

  const forced = resolvePdfBrowser(
    { MD_OUTLET_BROWSER: fakeEdge },
    "linux"
  );
  check(
    "MD_OUTLET_BROWSER absolute path",
    forced.kind === "executable" && forced.path === fakeEdge
  );

  expectThrow(
    "MD_OUTLET_BROWSER missing path throws",
    () =>
      resolvePdfBrowser(
        { MD_OUTLET_BROWSER: join(scratch, "no-such.exe") },
        "win32"
      ),
    "見つかりません"
  );

  const viaPptr = resolvePdfBrowser(
    { PUPPETEER_EXECUTABLE_PATH: fakeEdge },
    "linux"
  );
  check(
    "PUPPETEER_EXECUTABLE_PATH",
    viaPptr.kind === "executable" && viaPptr.source === "PUPPETEER_EXECUTABLE_PATH"
  );

  const mdWins = resolvePdfBrowser(
    {
      MD_OUTLET_BROWSER: fakeEdge,
      PUPPETEER_EXECUTABLE_PATH: join(scratch, "other.exe"),
    },
    "win32"
  );
  check(
    "MD_OUTLET_BROWSER wins over PUPPETEER_EXECUTABLE_PATH",
    mdWins.kind === "executable" && mdWins.path === fakeEdge
  );

  expectThrow(
    "no system browser → clear error",
    () =>
      resolvePdfBrowser(
        {
          ProgramFiles: join(scratch, "empty-pf"),
          "ProgramFiles(x86)": join(scratch, "empty-pf86"),
          LOCALAPPDATA: join(scratch, "empty-local"),
          PATH: "",
        },
        "win32"
      ),
    "推奨環境"
  );

  check(
    "browserNotFoundMessage mentions Edge",
    browserNotFoundMessage("win32").includes("Edge")
  );

  const live = resolvePdfBrowser();
  check(
    "live resolve finds a browser",
    live.kind === "executable",
    formatBrowserResolution(live)
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}

if (failed) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nBrowser resolve checks passed.");
process.exit(0);
