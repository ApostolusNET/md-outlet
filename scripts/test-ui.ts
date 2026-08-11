import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  unlinkSync,
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { resolveUiSavePath } from "../src/ui-save-path.js";
import {
  browseMarkdownDir,
  browseRootFrom,
  isPathInsideRoot,
  listBrowseRoots,
} from "../src/browse-md.js";
import {
  listRecent,
  rememberRecent,
  recentStorePath,
  setRecentPinned,
} from "../src/recent-files.js";
import {
  noteFileForPath,
  readDocNote,
  writeDocNote,
} from "../src/doc-notes.js";
import {
  fileUrlToFsPath,
  resolveMarkdownOpenLink,
} from "../src/resolve-md-link.js";
import { resolveDroppedMarkdownPath } from "../src/resolve-drop.js";
import { buildXmlScanReport } from "../src/xml-scan.js";
import { buildDataScanReport } from "../src/data-scan.js";
import {
  buildCsvScanReport,
  buildTextScanReport,
} from "../src/text-scan.js";
import {
  filterLogLines,
  formatFilteredLogLines,
  splitLogLines,
} from "../src/log-filter.js";
import {
  MAX_UI_TABS,
  activeTab,
  closeTab,
  emptyTabState,
  findTabByPath,
  legacyDocFields,
  openInTabs,
  switchTab,
} from "../src/ui-tabs.js";

const here = dirname(fileURLToPath(import.meta.url));
const pkgRoot = resolve(here, "..");
const port = 5769;
const emptyPort = 5770;
const savePath = resolve(pkgRoot, "examples", ".tmp-ui-profile.yaml");
const tmpMd = resolve(pkgRoot, "examples", ".tmp-ui-sample.md");
const customPdf = resolve(pkgRoot, "examples", ".tmp-ui-named.pdf");
const saveAsMd = resolve(pkgRoot, "examples", ".tmp-ui-sample-as.md");
const newMdPath = resolve(pkgRoot, "examples", ".tmp-ui-new.md");
const sampleMd = resolve(pkgRoot, "examples", "sample.md");
const recentPath = resolve(pkgRoot, "examples", ".tmp-ui-recent.json");
const TEST_API_TOKEN = "md-outlet-test-ui-token";
const recentEnv = {
  ...process.env,
  MD_OUTLET_RECENT_PATH: recentPath,
  MD_OUTLET_NO_AUTO_EXIT: "1",
  MD_OUTLET_API_TOKEN: TEST_API_TOKEN,
};

/** Attach session token for /api/* calls (matches server env). */
const _fetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (!url.includes("/api/")) return _fetch(input, init);
  const headers = new Headers(init?.headers);
  if (!headers.has("X-MD-Outlet-Token")) {
    headers.set("X-MD-Outlet-Token", TEST_API_TOKEN);
  }
  return _fetch(input, { ...init, headers });
};

let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (!ok) failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/** Force-stop spawned UI so open stdio pipes do not keep the test alive (Linux/Docker). */
function stopUiChild(child: ChildProcess): void {
  const pid = child.pid;
  if (pid && process.platform !== "win32") {
    try {
      process.kill(-pid, "SIGKILL");
    } catch {
      /* group may not exist */
    }
  }
  try {
    child.kill("SIGKILL");
  } catch {
    /* ignore */
  }
}

function spawnUi(cliArgs: string[]): ChildProcess {
  return spawn(
    process.execPath,
    [
      resolve(pkgRoot, "node_modules", "tsx", "dist", "cli.mjs"),
      resolve(pkgRoot, "src", "cli.ts"),
      ...cliArgs,
    ],
    {
      cwd: pkgRoot,
      stdio: ["ignore", "pipe", "pipe"],
      env: recentEnv,
      detached: process.platform !== "win32",
    }
  );
}

// Unit: tab model (no server) — max 3, activate same path, replace vs reject
{
  let st = emptyTabState();
  const a = openInTabs(st, "C:\\docs\\a.md", "# A");
  check("tabs unit open 1", a.ok && a.created);
  if (a.ok) st = a.state;
  const b = openInTabs(st, "C:\\docs\\b.md", "# B");
  check("tabs unit open 2", b.ok && b.created);
  if (b.ok) st = b.state;
  const c = openInTabs(st, "C:\\docs\\c.md", "# C");
  check("tabs unit open 3", c.ok && c.created);
  if (c.ok) st = c.state;
  check("tabs unit at max", st.tabs.length === MAX_UI_TABS);
  const full = openInTabs(st, "C:\\docs\\d.md", "# D", { replaceWhenFull: false });
  check("tabs unit reject 4th", !full.ok && full.code === "full");
  const same = openInTabs(st, "C:\\docs\\a.md", "# A2");
  check(
    "tabs unit same path activates",
    same.ok && same.activated && !same.created && st.tabs.length === 3
  );
  if (same.ok) st = same.state;
  check(
    "tabs unit active is a",
    activeTab(st)?.path.toLowerCase().endsWith("\\a.md") === true
  );
  const replaced = openInTabs(st, "C:\\docs\\d.md", "# D", {
    replaceWhenFull: true,
  });
  check("tabs unit replace when full", replaced.ok && replaced.created);
  if (replaced.ok) st = replaced.state;
  check("tabs unit still max after replace", st.tabs.length === MAX_UI_TABS);
  check(
    "tabs unit active is d",
    activeTab(st)?.path.toLowerCase().endsWith("\\d.md") === true
  );
  const sw = switchTab(st, st.tabs[0].id);
  check("tabs unit switch", !("error" in sw));
  if (!("error" in sw)) st = sw;
  const closed = closeTab(st, st.activeId!);
  check("tabs unit close active", !("error" in closed) && closed.tabs.length === 2);
  if (!("error" in closed)) st = closed;
  const legacy = legacyDocFields(st);
  check("tabs unit legacy mdPath", legacy.mdPath === activeTab(st)?.path);
  check("tabs unit legacy tabMax", legacy.tabMax === MAX_UI_TABS);
  check(
    "tabs unit find by path case",
    findTabByPath(st, st.tabs[0].path.toUpperCase())?.id === st.tabs[0].id
  );
}

{
  const p = resolveUiSavePath("default");
  check("bundled save path ends with default.yaml", p.endsWith("default.yaml"));
  const fileProf = resolve(pkgRoot, "examples", ".tmp-ui-profile.yaml");
  writeFileSync(
    fileProf,
    readFileSync(resolve(pkgRoot, "profiles", "default.yaml"), "utf8"),
    "utf8"
  );
  const s = resolveUiSavePath(fileProf);
  check("file profile saves to self", s === resolve(fileProf));
  const o = resolveUiSavePath("default", "./custom-out.yaml");
  check("-o wins", o.endsWith("custom-out.yaml"));

  check(
    "browse root accepts package file",
    isPathInsideRoot(resolve(pkgRoot, "examples", "sample.md"), pkgRoot)
  );
  check(
    "browse root rejects parent path",
    !isPathInsideRoot(resolve(pkgRoot, "..", "README.md"), pkgRoot)
  );
  check("browse root rejects root itself", !isPathInsideRoot(pkgRoot, pkgRoot));
  const listing = browseMarkdownDir("examples", { home: pkgRoot });
  check("browse examples has sample.md", listing.files.some((f) => f.name === "sample.md"));
  check("browse examples has parent", listing.parent === pkgRoot);
  const atPkg = browseMarkdownDir(pkgRoot, { home: pkgRoot });
  check(
    "browse can go above package",
    Boolean(atPkg.parent) && atPkg.parent !== pkgRoot
  );
  check(
    "browse root is drive/fs root",
    atPkg.root === browseRootFrom(pkgRoot)
  );
  const roots = listBrowseRoots(pkgRoot);
  check(
    "browse roots include home",
    roots.some((r) => r.id === "home" && r.path === pkgRoot)
  );
  if (roots.some((r) => r.id.startsWith("wsl"))) {
    check("browse roots include WSL", true);
    const wslRoot = roots.find((r) => r.id.startsWith("wsl"));
    if (wslRoot) {
      try {
        const wslList = browseMarkdownDir(wslRoot.path, { home: pkgRoot });
        check("browse WSL root lists dirs", wslList.dirs.length > 0, wslRoot.path);
      } catch (err) {
        // Distro listed but UNC not mounted yet — soft skip
        console.log(
          "SKIP  browse WSL root lists dirs —",
          err instanceof Error ? err.message : String(err)
        );
      }
    }
  } else {
    console.log("SKIP  browse roots include WSL — wsl.exe found no distros");
  }

  if (existsSync(recentPath)) unlinkSync(recentPath);
  process.env.MD_OUTLET_RECENT_PATH = recentPath;
  check("recent store path respects env", recentStorePath() === recentPath);
  const remembered = rememberRecent(sampleMd);
  check(
    "remember recent puts sample first",
    remembered[0]?.path === resolve(sampleMd)
  );
  check(
    "list recent returns sample",
    listRecent().some((e) => e.path === resolve(sampleMd))
  );
  const pinned = setRecentPinned(sampleMd, true);
  check(
    "pin recent marks pinned",
    pinned.some((e) => e.path === resolve(sampleMd) && e.pinned)
  );
  const unpinned = setRecentPinned(sampleMd, false);
  check(
    "unpin recent clears pin",
    unpinned.some((e) => e.path === resolve(sampleMd) && !e.pinned)
  );

  {
    const sidecar = noteFileForPath(sampleMd);
    if (sidecar && existsSync(sidecar)) unlinkSync(sidecar);
    const written = writeDocNote(sampleMd, "scratch note");
    check("doc-note write path", written.path === resolve(sampleMd));
    check("doc-note write text", written.text === "scratch note");
    check(
      "doc-note sidecar beside source",
      !!sidecar && existsSync(sidecar) && sidecar === resolve(sampleMd) + ".md-outlet-note.json"
    );
    const readBack = readDocNote(sampleMd);
    check("doc-note read back", readBack.text === "scratch note");
    const before = readFileSync(sampleMd, "utf8");
    check(
      "doc-note does not alter source",
      !before.includes("scratch note")
    );
    if (sidecar && existsSync(sidecar)) unlinkSync(sidecar);
  }

  {
    const st = statSync(sampleMd);
    const byHint = resolveDroppedMarkdownPath({
      name: "sample.md",
      pathHint: sampleMd,
    });
    check("resolve-drop pathHint", byHint.path === sampleMd);

    const byRecent = resolveDroppedMarkdownPath({
      name: "sample.md",
      size: st.size,
      lastModified: Math.round(st.mtimeMs),
    });
    check(
      "resolve-drop recent+fingerprint",
      byRecent.path === sampleMd,
      byRecent.method
    );

    const byDir = resolveDroppedMarkdownPath({
      name: "sample.md",
      size: st.size,
      lastModified: Math.round(st.mtimeMs),
      searchDirs: [resolve(pkgRoot, "examples")],
    });
    check("resolve-drop searchDir", byDir.path === sampleMd);
  }

  const linkDir = resolve(pkgRoot, "examples", ".tmp-link-dir");
  const linkMain = resolve(linkDir, "main.md");
  const linkSheet = resolve(linkDir, "sheet.md");
  mkdirSync(linkDir, { recursive: true });
  writeFileSync(linkMain, "# main\n");
  writeFileSync(linkSheet, "# sheet\n");
  const relOpen = resolveMarkdownOpenLink("./sheet.md", linkMain);
  check(
    "resolve relative md link",
    relOpen.ok === true && relOpen.path === linkSheet
  );
  const unc =
    fileUrlToFsPath(
      "file:////wsl.localhost/Ubuntu-24.04/home/someone/writing/sheet.md"
    ) || "";
  check(
    "file UNC parses to wsl path",
    unc.replace(/\//g, "\\").toLowerCase() ===
      "\\\\wsl.localhost\\ubuntu-24.04\\home\\someone\\writing\\sheet.md"
  );
  const skipHttp = resolveMarkdownOpenLink("https://example.com/a.md", linkMain);
  check("http link skipped", !skipHttp.ok && skipHttp.reason === "skip");
  rmSync(linkDir, { recursive: true, force: true });
}

async function waitFor(url: string, ms = 8000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await fetch(url);
      if (r.ok || r.status === 404) return;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`Server did not become ready: ${url}`);
}

if (existsSync(savePath)) unlinkSync(savePath);
if (existsSync(recentPath)) unlinkSync(recentPath);
{
  const sampleNote = noteFileForPath(sampleMd);
  if (sampleNote && existsSync(sampleNote)) unlinkSync(sampleNote);
  const tmpNote = noteFileForPath(tmpMd);
  if (tmpNote && existsSync(tmpNote)) unlinkSync(tmpNote);
}
copyFileSync(sampleMd, tmpMd);

const child = spawnUi([
  "ui",
  "examples/.tmp-ui-sample.md",
  "--profile",
  "default",
  "-o",
  savePath,
  "--port",
  String(port),
  "--no-open",
]);

let stderr = "";
child.stderr?.on("data", (d) => {
  stderr += String(d);
});
child.stdout?.on("data", (d) => {
  stderr += String(d);
});

const baseProfile = {
  version: 1 as const,
  meta: { name: "ui-test", description: "from test" },
  page: {
    format: "A4",
    orientation: "landscape",
    margin: {
      top: "12mm",
      right: "12mm",
      bottom: "12mm",
      left: "12mm",
    },
    printBackground: true,
    scale: 0.95,
  },
  theme: "default",
  breaks: {
    beforeHeadings: ["h1"],
    skipFirst: true,
    avoidInside: ["pre", "table", "blockquote"],
    avoidAfter: ["h2", "h3", "h4"],
  },
  markdown: {
    gfm: true,
    highlight: true,
    highlightStyle: "github",
    allowHtml: true,
  },
  bodyClass: [],
};

try {
  await waitFor(`http://127.0.0.1:${port}/api/state`);

  const stateRes = await fetch(`http://127.0.0.1:${port}/api/state`);
  const state = (await stateRes.json()) as {
    profile: { page: { orientation: string }; meta: { name: string } };
    bundledSource: boolean;
    savePath: string;
    pdfOutputPath: string;
    themes: string[];
    builtins: string[];
    markdown: string;
    empty?: boolean;
    recent?: { path: string }[];
    workspaceRoot?: string;
    browseRoot?: string;
    library?: { id: string }[];
    tabs?: { id: string; path: string; kind: string; label: string }[];
    activeTabId?: string | null;
    tabMax?: number;
    mdPath?: string | null;
    fileKind?: string;
    docNote?: string;
  };
  check("state ok", stateRes.ok);
  check("state not empty with file arg", state.empty !== true);
  check(
    "state recent includes opened file",
    Array.isArray(state.recent) &&
      state.recent.some((e) => e.path === resolve(tmpMd))
  );
  check("workspaceRoot is package", state.workspaceRoot === pkgRoot);
  check(
    "browseRoot is drive/fs root",
    state.browseRoot === browseRootFrom(pkgRoot)
  );
  check(
    "state has tabs snapshot",
    Array.isArray(state.tabs) &&
      state.tabs.length >= 1 &&
      state.tabMax === MAX_UI_TABS &&
      typeof state.activeTabId === "string"
  );
  check("state has docNote field", typeof state.docNote === "string");

  {
    const badTok = await fetch(`http://127.0.0.1:${port}/api/state`, {
      headers: { "X-MD-Outlet-Token": "not-the-test-token" },
    });
    check("api rejects bad token", badTok.status === 401);
    const badBody = (await badTok.json()) as { error?: string };
    check(
      "api bad token body",
      typeof badBody.error === "string" && badBody.error.length > 0
    );
  }

  {
    const outsidePath = resolve(pkgRoot, "..", ".tmp-md-outlet-outside-p1.md");
    if (existsSync(outsidePath)) unlinkSync(outsidePath);
    const deny = await fetch(`http://127.0.0.1:${port}/api/save-md`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        markdown: "# Outside package (should need confirm)\n",
        path: outsidePath,
      }),
    });
    const denyBody = (await deny.json()) as {
      code?: string;
      needsConfirm?: boolean;
      path?: string;
      error?: string;
    };
    check("outside package save 409", deny.status === 409, denyBody.error);
    check(
      "outside package code",
      denyBody.code === "OUTSIDE_PACKAGE" && denyBody.needsConfirm === true
    );
    const allow = await fetch(`http://127.0.0.1:${port}/api/save-md`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        markdown: "# Outside package confirmed\n",
        path: outsidePath,
        confirmOutside: true,
      }),
    });
    const allowBody = (await allow.json()) as {
      path?: string;
      error?: string;
    };
    check("outside package confirm ok", allow.ok, allowBody.error);
    check(
      "outside package wrote file",
      existsSync(outsidePath) &&
        readFileSync(outsidePath, "utf8").includes("Outside package confirmed")
    );
    if (existsSync(outsidePath)) unlinkSync(outsidePath);
    // Restore active editor path to the in-package tmp sample.
    await fetch(`http://127.0.0.1:${port}/api/open-md`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: tmpMd }),
    });
  }

  {
    const htmlRes = await fetch(`http://127.0.0.1:${port}/`);
    const htmlBody = await htmlRes.text();
    check("ui index served", htmlRes.ok);
    check(
      "ui index references split assets",
      htmlBody.includes("/styles.css") && htmlBody.includes("/js/app.js")
    );
    const cssRes = await fetch(`http://127.0.0.1:${port}/styles.css`);
    check(
      "ui styles.css 200",
      cssRes.ok && cssRes.headers.get("content-type")?.startsWith("text/css") === true
    );
    const jsRes = await fetch(`http://127.0.0.1:${port}/js/app.js`);
    check(
      "ui js/app.js 200",
      jsRes.ok &&
        (jsRes.headers.get("content-type")?.includes("javascript") ?? false)
    );
    const traversalRes = await fetch(
      `http://127.0.0.1:${port}/js/../package.json`
    );
    check("ui asset traversal blocked", traversalRes.status === 404);
  }
  {
    const noteRes = await fetch(`http://127.0.0.1:${port}/api/doc-note`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: tmpMd, text: "ui-note-test" }),
    });
    const noteBody = (await noteRes.json()) as {
      ok?: boolean;
      text?: string;
      error?: string;
    };
    check("doc-note api save ok", noteRes.ok, noteBody.error);
    check("doc-note api save text", noteBody.text === "ui-note-test");
    const noteGet = await fetch(
      `http://127.0.0.1:${port}/api/doc-note?path=${encodeURIComponent(tmpMd)}`
    );
    const got = (await noteGet.json()) as { text?: string };
    check("doc-note api get", noteGet.ok && got.text === "ui-note-test");
    const src = readFileSync(tmpMd, "utf8");
    check("doc-note api leaves source", !src.includes("ui-note-test"));
  }
  const browseRes = await fetch(
    `http://127.0.0.1:${port}/api/browse-md?dir=${encodeURIComponent("examples")}`
  );
  const browse = (await browseRes.json()) as {
    files?: { name: string }[];
    error?: string;
  };
  check("browse-md ok", browseRes.ok, browse.error);
  check(
    "browse-md lists sample.md",
    Array.isArray(browse.files) && browse.files.some((f) => f.name === "sample.md")
  );
  const browsePdfRes = await fetch(
    `http://127.0.0.1:${port}/api/browse-md?ext=pdf&dir=${encodeURIComponent("examples")}`
  );
  const browsePdf = (await browsePdfRes.json()) as {
    files?: { name: string }[];
    error?: string;
  };
  check("browse-md pdf ok", browsePdfRes.ok, browsePdf.error);
  check(
    "browse-md pdf has no .md",
    Array.isArray(browsePdf.files) &&
      browsePdf.files.every((f) => /\.pdf$/i.test(f.name))
  );

  const dropName = ".tmp-ui-dropped.md";
  const dropPath = resolve(pkgRoot, "examples", dropName);
  if (existsSync(dropPath)) unlinkSync(dropPath);
  const importRes = await fetch(`http://127.0.0.1:${port}/api/import-md`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: dropName,
      markdown: "# Dropped\n\nfrom test\n",
      dir: resolve(pkgRoot, "examples"),
    }),
  });
  const imported = (await importRes.json()) as {
    path?: string;
    error?: string;
    recent?: { path: string }[];
  };
  check("import-md ok", importRes.ok, imported.error);
  check("import-md path", imported.path === dropPath);
  check("import-md file exists", existsSync(dropPath));
  const importAgain = await fetch(`http://127.0.0.1:${port}/api/import-md`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      filename: dropName,
      markdown: "# Dropped again\n",
      dir: resolve(pkgRoot, "examples"),
    }),
  });
  check("import-md conflict 409", importAgain.status === 409);
  // Restore active Markdown for subsequent save-md / open-md checks.
  const restoreRes = await fetch(`http://127.0.0.1:${port}/api/open-md`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: tmpMd }),
  });
  check("restore tmp md after import", restoreRes.ok);

  const resolveDropRes = await fetch(`http://127.0.0.1:${port}/api/resolve-drop`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "sample.md",
      pathHint: sampleMd,
    }),
  });
  const resolvedDrop = (await resolveDropRes.json()) as {
    path?: string;
    error?: string;
  };
  check("api resolve-drop ok", resolveDropRes.ok, resolvedDrop.error);
  check("api resolve-drop path", resolvedDrop.path === sampleMd);

  const sampleXml = resolve(pkgRoot, "examples", "sample.xml");
  const openXmlRes = await fetch(`http://127.0.0.1:${port}/api/open-md`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: sampleXml }),
  });
  const openedXml = (await openXmlRes.json()) as {
    path?: string;
    fileKind?: string;
    markdown?: string;
    error?: string;
  };
  check("open-xml ok", openXmlRes.ok, openedXml.error);
  check("open-xml kind", openedXml.fileKind === "xml");
  check(
    "open-xml content",
    typeof openedXml.markdown === "string" &&
      openedXml.markdown.includes("sampleRoot")
  );
  const xmlPrevRes = await fetch(`http://127.0.0.1:${port}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile: baseProfile,
      markdown: openedXml.markdown,
    }),
  });
  const xmlPrevHtml = await xmlPrevRes.text();
  check("xml preview 200", xmlPrevRes.ok);
  check(
    "xml preview is pre text",
    xmlPrevHtml.includes("<pre>") &&
      (xmlPrevHtml.includes("sampleRoot") ||
        xmlPrevHtml.includes("サンプルルート"))
  );
  check(
    "xml scan report style",
    (xmlPrevHtml.includes("■ item") || xmlPrevHtml.includes("■ 項目")) &&
      (xmlPrevHtml.includes("name: alpha") ||
        xmlPrevHtml.includes("名前: alpha"))
  );

  const typedXml = resolve(pkgRoot, "examples", "sample-typed.xml");
  const typedRaw = readFileSync(typedXml, "utf8");
  const typedReport = buildXmlScanReport(typedRaw, "sample-typed.xml");
  check(
    "xml date group",
    typedReport.includes("発行日: 令和6年8月8日"),
    typedReport.split("\n").slice(0, 20).join(" | ")
  );
  check(
    "xml date Gengo alias",
    typedReport.includes("支払日: 令和8年6月30日") &&
      !typedReport.includes("paidDtGengo:")
  );
  check(
    "xml money format",
    typedReport.includes("金額（円）: 12,345 円")
  );
  check(
    "xml fee money",
    typedReport.includes("手数料（円）: 1,000 円")
  );
  check(
    "xml office line label",
    typedReport.includes("事業所名称（1行目）: テスト事業所")
  );
  check(
    "xml html strip",
    typedReport.includes("お知らせです") &&
      typedReport.includes("ここ (https://example.com)") &&
      !typedReport.includes("<br")
  );
  check(
    "xml dict auto-pick",
    typedReport.includes("辞書: example") &&
      typedReport.includes("お知らせ:")
  );
  const noDictReport = buildXmlScanReport(typedRaw, "sample-typed.xml", {
    noDict: true,
  });
  check(
    "xml noDict keeps tags",
    noDictReport.includes("issuedYmd: 令和6年8月8日") &&
      noDictReport.includes("辞書: なし")
  );
  const xmlPdfRes = await fetch(`http://127.0.0.1:${port}/api/export-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: baseProfile }),
  });
  check("xml export-pdf rejected", xmlPdfRes.status === 400);
  const browseXmlRes = await fetch(
    `http://127.0.0.1:${port}/api/browse-md?ext=${encodeURIComponent("md,xml")}&dir=${encodeURIComponent("examples")}`
  );
  const browseXml = (await browseXmlRes.json()) as {
    files?: { name: string }[];
    error?: string;
  };
  check("browse md,xml ok", browseXmlRes.ok, browseXml.error);
  check(
    "browse lists sample.xml",
    Array.isArray(browseXml.files) &&
      browseXml.files.some((f) => f.name === "sample.xml")
  );

  const jsonReport = buildDataScanReport(
    "json",
    readFileSync(resolve(pkgRoot, "examples", "sample.json"), "utf8"),
    "sample.json"
  );
  check("json header", jsonReport.startsWith("JSON スキャン表示"));
  check(
    "json nested + array",
    jsonReport.includes("■ server") &&
      jsonReport.includes("items (1/2)") &&
      jsonReport.includes("items (2/2)")
  );
  check(
    "json scalar types",
    jsonReport.includes("enabled: true") &&
      jsonReport.includes("notes: null") &&
      jsonReport.includes("empty: {}")
  );
  const brokenJson = buildDataScanReport(
    "json",
    "{not json",
    "broken.json"
  );
  check(
    "json parse fallback",
    brokenJson.includes("解釈できませんでした") &&
      brokenJson.includes("{not json")
  );

  const yamlReport = buildDataScanReport(
    "yaml",
    readFileSync(resolve(pkgRoot, "examples", "sample.yaml"), "utf8"),
    "sample.yaml"
  );
  check("yaml header", yamlReport.startsWith("YAML スキャン表示"));
  check(
    "yaml multiline block",
    yamlReport.includes("description:") &&
      yamlReport.includes("複数行のテキストも") &&
      yamlReport.includes("そのまま読み下します。")
  );

  const sampleJson = resolve(pkgRoot, "examples", "sample.json");
  const openJsonRes = await fetch(`http://127.0.0.1:${port}/api/open-md`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: sampleJson }),
  });
  const openedJson = (await openJsonRes.json()) as {
    fileKind?: string;
    markdown?: string;
    error?: string;
  };
  check("open-json ok", openJsonRes.ok, openedJson.error);
  check("open-json kind", openedJson.fileKind === "json");
  const jsonPrevRes = await fetch(`http://127.0.0.1:${port}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile: baseProfile,
      markdown: openedJson.markdown,
    }),
  });
  const jsonPrevHtml = await jsonPrevRes.text();
  check("json preview 200", jsonPrevRes.ok);
  check(
    "json preview banner",
    jsonPrevHtml.includes("JSON スキャン表示") &&
      jsonPrevHtml.includes("<pre>")
  );
  const jsonPdfRes = await fetch(`http://127.0.0.1:${port}/api/export-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: baseProfile }),
  });
  check("json export-pdf rejected", jsonPdfRes.status === 400);

  const sampleYaml = resolve(pkgRoot, "examples", "sample.yaml");
  const openYamlRes = await fetch(`http://127.0.0.1:${port}/api/open-md`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: sampleYaml }),
  });
  const openedYaml = (await openYamlRes.json()) as {
    fileKind?: string;
    markdown?: string;
    error?: string;
  };
  check("open-yaml ok", openYamlRes.ok, openedYaml.error);
  check("open-yaml kind", openedYaml.fileKind === "yaml");
  const yamlPrevRes = await fetch(`http://127.0.0.1:${port}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile: baseProfile,
      markdown: openedYaml.markdown,
    }),
  });
  const yamlPrevHtml = await yamlPrevRes.text();
  check("yaml preview 200", yamlPrevRes.ok);
  check(
    "yaml preview banner",
    yamlPrevHtml.includes("YAML スキャン表示") &&
      yamlPrevHtml.includes("<pre>")
  );
  const yamlSaveMdRes = await fetch(`http://127.0.0.1:${port}/api/save-md`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ markdown: "should not save" }),
  });
  check("yaml save-md rejected", yamlSaveMdRes.status === 400);

  const browseAllRes = await fetch(
    `http://127.0.0.1:${port}/api/browse-md?ext=${encodeURIComponent(
      "md,xml,json,yaml,yml"
    )}&dir=${encodeURIComponent("examples")}`
  );
  const browseAll = (await browseAllRes.json()) as {
    files?: { name: string }[];
    error?: string;
  };
  check("browse md,xml,json,yaml ok", browseAllRes.ok, browseAll.error);
  check(
    "browse lists sample.json + sample.yaml",
    Array.isArray(browseAll.files) &&
      browseAll.files.some((f) => f.name === "sample.json") &&
      browseAll.files.some((f) => f.name === "sample.yaml")
  );

  const txtReport = buildTextScanReport(
    "txt",
    readFileSync(resolve(pkgRoot, "examples", "sample.txt"), "utf8"),
    "sample.txt"
  );
  check("txt header", txtReport.startsWith("TXT 表示"));
  check("txt body", txtReport.includes("プレーンテキスト"));

  const logReport = buildTextScanReport(
    "log",
    readFileSync(resolve(pkgRoot, "examples", "sample.log"), "utf8"),
    "sample.log"
  );
  check("log header", logReport.startsWith("LOG 表示"));
  check(
    "log line numbers",
    logReport.includes("1 | ") &&
      logReport.includes("ERROR export failed") &&
      logReport.includes("フィルタ")
  );

  {
    const logLines = splitLogLines(
      readFileSync(resolve(pkgRoot, "examples", "sample.log"), "utf8")
    );
    const byError = filterLogLines(logLines, { levels: ["ERROR"] });
    check("log filter ERROR count", byError.matched === 1);
    check(
      "log filter keeps original line no",
      formatFilteredLogLines(logLines, byError.indices).includes(
        String(byError.indices[0] + 1) + " |"
      ) && formatFilteredLogLines(logLines, byError.indices).includes("ERROR")
    );
    const byQuery = filterLogLines(logLines, { query: "preview" });
    check("log filter query", byQuery.matched >= 1);
    const byBoth = filterLogLines(logLines, {
      query: "export",
      levels: ["ERROR", "INFO"],
    });
    check(
      "log filter query AND levels",
      byBoth.matched >= 2 &&
        byBoth.indices.every((i) => /export/i.test(logLines[i]))
    );
    const cleared = filterLogLines(logLines, { query: "", levels: [] });
    check("log filter clear = all", cleared.matched === cleared.total);
  }

  const csvReport = buildCsvScanReport(
    readFileSync(resolve(pkgRoot, "examples", "sample.csv"), "utf8"),
    "sample.csv"
  );
  check("csv header", csvReport.startsWith("CSV スキャン表示"));
  check(
    "csv rows",
    csvReport.includes("■ 行 1") &&
      csvReport.includes("name: alpha") &&
      csvReport.includes("note: second, with comma")
  );

  const sampleTxt = resolve(pkgRoot, "examples", "sample.txt");
  const openTxtRes = await fetch(`http://127.0.0.1:${port}/api/open-md`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: sampleTxt }),
  });
  const openedTxt = (await openTxtRes.json()) as {
    fileKind?: string;
    markdown?: string;
    error?: string;
  };
  check("open-txt ok", openTxtRes.ok, openedTxt.error);
  check("open-txt kind", openedTxt.fileKind === "txt");
  const txtPrevRes = await fetch(`http://127.0.0.1:${port}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile: baseProfile,
      markdown: openedTxt.markdown,
    }),
  });
  check(
    "txt preview",
    txtPrevRes.ok && (await txtPrevRes.text()).includes("TXT 表示")
  );

  const sampleLog = resolve(pkgRoot, "examples", "sample.log");
  const openLogRes = await fetch(`http://127.0.0.1:${port}/api/open-md`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: sampleLog }),
  });
  const openedLog = (await openLogRes.json()) as {
    fileKind?: string;
    markdown?: string;
    error?: string;
  };
  check("open-log ok", openLogRes.ok, openedLog.error);
  check("open-log kind", openedLog.fileKind === "log");
  const logPrevRes = await fetch(`http://127.0.0.1:${port}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile: baseProfile,
      markdown: openedLog.markdown,
    }),
  });
  const logPrevHtml = await logPrevRes.text();
  check(
    "log preview",
    logPrevRes.ok &&
      logPrevHtml.includes("LOG 表示") &&
      logPrevHtml.includes("1 | ")
  );

  const sampleCsv = resolve(pkgRoot, "examples", "sample.csv");
  const openCsvRes = await fetch(`http://127.0.0.1:${port}/api/open-md`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: sampleCsv }),
  });
  const openedCsv = (await openCsvRes.json()) as {
    fileKind?: string;
    markdown?: string;
    error?: string;
  };
  check("open-csv ok", openCsvRes.ok, openedCsv.error);
  check("open-csv kind", openedCsv.fileKind === "csv");
  const csvPrevRes = await fetch(`http://127.0.0.1:${port}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile: baseProfile,
      markdown: openedCsv.markdown,
    }),
  });
  check(
    "csv preview",
    csvPrevRes.ok && (await csvPrevRes.text()).includes("CSV スキャン表示")
  );
  const csvPdfRes = await fetch(`http://127.0.0.1:${port}/api/export-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: baseProfile }),
  });
  check("csv export-pdf rejected", csvPdfRes.status === 400);

  const browseTextRes = await fetch(
    `http://127.0.0.1:${port}/api/browse-md?ext=${encodeURIComponent(
      "md,xml,json,yaml,yml,txt,log,csv,tsv"
    )}&dir=${encodeURIComponent("examples")}`
  );
  const browseText = (await browseTextRes.json()) as {
    files?: { name: string }[];
    error?: string;
  };
  check("browse text types ok", browseTextRes.ok, browseText.error);
  check(
    "browse lists txt/log/csv",
    Array.isArray(browseText.files) &&
      browseText.files.some((f) => f.name === "sample.txt") &&
      browseText.files.some((f) => f.name === "sample.log") &&
      browseText.files.some((f) => f.name === "sample.csv")
  );

  // Restore markdown active file for later save/open checks.
  const restoreAfterXml = await fetch(`http://127.0.0.1:${port}/api/open-md`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: tmpMd }),
  });
  check("restore tmp md after xml", restoreAfterXml.ok);
  check("bundled flagged", state.bundledSource === true);
  check("has profile name", state.profile.meta.name === "default");
  check(
    "themes listed",
    Array.isArray(state.themes) &&
      state.themes.includes("default") &&
      state.themes.includes("compact")
  );
  check(
    "markdown in state",
    typeof state.markdown === "string" &&
      state.markdown.includes("md-outlet Sample")
  );
  check(
    "builtins include simple-preview",
    Array.isArray(state.builtins) && state.builtins.includes("simple-preview")
  );
  check(
    "library includes start guide",
    Array.isArray(state.library) && state.library.some((x) => x.id === "start")
  );
  check(
    "library includes kitchen-sink",
    Array.isArray(state.library) &&
      state.library.some((x) => x.id === "kitchen-sink")
  );
  check(
    "library includes sample",
    Array.isArray(state.library) && state.library.some((x) => x.id === "sample")
  );

  const switchRes = await fetch(`http://127.0.0.1:${port}/api/use-template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: "simple-preview" }),
  });
  const switched = (await switchRes.json()) as {
    profileRef?: string;
    profile?: { meta: { name: string } };
    error?: string;
  };
  check("use-template ok", switchRes.ok, switched.error);
  check(
    "profileRef is simple-preview",
    switched.profileRef === "simple-preview"
  );
  check(
    "profile name is simple-preview",
    switched.profile?.meta?.name === "simple-preview"
  );

  const backRes = await fetch(`http://127.0.0.1:${port}/api/use-template`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ profile: "default" }),
  });
  const back = (await backRes.json()) as {
    profileRef?: string;
    error?: string;
  };
  check("switch back to default", backRes.ok, back.error);
  check("profileRef is default again", back.profileRef === "default");
  check(
    "pdfOutputPath suggested",
    typeof state.pdfOutputPath === "string" && state.pdfOutputPath.endsWith(".pdf")
  );

  const customPdfPath = customPdf;
  if (existsSync(customPdfPath)) unlinkSync(customPdfPath);
  const exportRes = await fetch(`http://127.0.0.1:${port}/api/export-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile: baseProfile,
      markdown: "# Named Export\n\nHello PDF.\n",
      outputPath: customPdfPath,
    }),
  });
  const exported = (await exportRes.json()) as { path?: string; error?: string };
  check("export-pdf ok", exportRes.ok, exported.error);
  check(
    "export used named path",
    exported.path === customPdfPath,
    exported.path
  );
  check("named pdf exists", existsSync(customPdfPath));

  const jpPdf = resolve(pkgRoot, "examples", ".tmp-ui-日本語.pdf");
  if (existsSync(jpPdf)) unlinkSync(jpPdf);
  const jpExport = await fetch(`http://127.0.0.1:${port}/api/export-pdf`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile: baseProfile,
      markdown: "# JP\n",
      outputPath: jpPdf,
    }),
  });
  check("export-pdf japanese path ok", jpExport.ok);
  const jpView = await fetch(`http://127.0.0.1:${port}/api/pdf`);
  const disp = jpView.headers.get("content-disposition") || "";
  check("pdf view 200", jpView.ok);
  check(
    "pdf Content-Disposition ascii-safe",
    jpView.ok &&
      !/[^\x20-\x7E]/.test(disp) &&
      disp.includes("filename*=")
  );
  {
    // Browser <img> / tab navigation cannot send X-MD-Outlet-Token.
    const barePdf = await _fetch(`http://127.0.0.1:${port}/api/pdf`);
    check("pdf view without token 200", barePdf.ok, String(barePdf.status));
  }
  if (existsSync(jpPdf)) unlinkSync(jpPdf);

  const liveMd = "# Live From Editor\n\nHello **UI** edit pane.\n";
  const previewRes = await fetch(`http://127.0.0.1:${port}/api/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      profile: baseProfile,
      markdown: liveMd,
    }),
  });
  const html = await previewRes.text();
  check("preview 200", previewRes.ok, String(previewRes.status));
  check("preview uses editor md", html.includes("Live From Editor"));
  check("preview renders bold", html.includes("<strong>UI</strong>"));
  check(
    "preview csp header blocks script",
    (previewRes.headers.get("content-security-policy") || "").includes(
      "script-src 'none'"
    )
  );
  check(
    "preview csp meta blocks script",
    html.includes('http-equiv="Content-Security-Policy"') &&
      html.includes("script-src 'none'")
  );

  const saveMdRes = await fetch(`http://127.0.0.1:${port}/api/save-md`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      markdown: "# Saved Via API\n\n<div class=\"page-break\"></div>\n\n# Next\n",
    }),
  });
  const saveMd = (await saveMdRes.json()) as { path?: string; error?: string };
  check("save-md ok", saveMdRes.ok, saveMd.error);
  const disk = readFileSync(tmpMd, "utf8");
  check("save-md wrote file", disk.includes("Saved Via API"));
  check("save-md kept page-break", disk.includes('class="page-break"'));

  const saveAsMdPath = saveAsMd;
  if (existsSync(saveAsMdPath)) unlinkSync(saveAsMdPath);
  const saveAsRes = await fetch(`http://127.0.0.1:${port}/api/save-md`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      markdown: "# Saved As Copy\n",
      path: saveAsMdPath,
    }),
  });
  const savedAs = (await saveAsRes.json()) as {
    path?: string;
    switched?: boolean;
    pdfOutputPath?: string;
    error?: string;
  };
  check("save-md as ok", saveAsRes.ok, savedAs.error);
  check("save-md as switched", savedAs.switched === true);
  check("save-md as path", savedAs.path === saveAsMdPath);
  check("save-md as file exists", existsSync(saveAsMdPath));
  check(
    "save-md as updates pdf hint",
    typeof savedAs.pdfOutputPath === "string" &&
      savedAs.pdfOutputPath.endsWith(".tmp-ui-sample-as.pdf")
  );
  const stateAfter = await fetch(`http://127.0.0.1:${port}/api/state`);
  const after = (await stateAfter.json()) as { mdPath?: string };
  check("active md switched", after.mdPath === saveAsMdPath);

  // Switch back by opening the original temp file
  const openRes = await fetch(`http://127.0.0.1:${port}/api/open-md`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: tmpMd }),
  });
  const opened = (await openRes.json()) as {
    path?: string;
    markdown?: string;
    pdfOutputPath?: string;
    error?: string;
  };
  check("open-md ok", openRes.ok, opened.error);
  check("open-md path", opened.path === tmpMd);
  check(
    "open-md content",
    typeof opened.markdown === "string" &&
      opened.markdown.includes("Saved Via API")
  );
  const missingRes = await fetch(`http://127.0.0.1:${port}/api/open-md`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: "./examples/.no-such-file-ui.md" }),
  });
  check("open-md missing is 404", missingRes.status === 404);

  const newMdPathReq = newMdPath;
  if (existsSync(newMdPathReq)) unlinkSync(newMdPathReq);
  // new-md rejects when tabs are full — drain so create can open a slot.
  for (let i = 0; i < 5; i++) {
    const stRes = await fetch(`http://127.0.0.1:${port}/api/state`);
    const st = (await stRes.json()) as { tabs?: unknown[] };
    if (!st.tabs?.length) break;
    await fetch(`http://127.0.0.1:${port}/api/close-md`, { method: "POST" });
  }
  const newRes = await fetch(`http://127.0.0.1:${port}/api/new-md`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: newMdPathReq }),
  });
  const created = (await newRes.json()) as {
    path?: string;
    markdown?: string;
    error?: string;
  };
  check("new-md ok", newRes.ok, created.error);
  check("new-md path", created.path === newMdPathReq);
  check(
    "new-md content",
    typeof created.markdown === "string" &&
      created.markdown.includes("# Untitled")
  );
  check("new-md file exists", existsSync(newMdPathReq));
  const conflict = await fetch(`http://127.0.0.1:${port}/api/new-md`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: newMdPathReq }),
  });
  check("new-md conflict is 409", conflict.status === 409);
  const forced = await fetch(`http://127.0.0.1:${port}/api/new-md`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path: newMdPathReq, force: true }),
  });
  check("new-md force ok", forced.ok);

  // Multi-tab API (phase 1): strict open / switch / close / 409; open-md still replaces
  {
    type TabSnap = {
      ok?: boolean;
      error?: string;
      path?: string | null;
      mdPath?: string | null;
      markdown?: string;
      tabs?: { id: string; path: string; label: string }[];
      activeTabId?: string | null;
      tabMax?: number;
    };
    const tabFiles = [
      resolve(pkgRoot, "examples", "sample.md"),
      resolve(pkgRoot, "examples", "sample-frontmatter.md"),
      resolve(pkgRoot, "examples", "sample.txt"),
      resolve(pkgRoot, "examples", "sample.xml"),
    ];
    // Drain to empty so counts are deterministic
    for (let i = 0; i < 5; i++) {
      const stRes = await fetch(`http://127.0.0.1:${port}/api/state`);
      const st = (await stRes.json()) as TabSnap;
      if (!st.tabs?.length) break;
      await fetch(`http://127.0.0.1:${port}/api/close-md`, { method: "POST" });
    }
    const o1 = await fetch(`http://127.0.0.1:${port}/api/tabs/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: tabFiles[0] }),
    });
    const t1 = (await o1.json()) as TabSnap;
    check("tabs/open 1 ok", o1.ok, t1.error);
    check("tabs/open 1 count", t1.tabs?.length === 1);
    const o2 = await fetch(`http://127.0.0.1:${port}/api/tabs/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: tabFiles[1],
        markdown: "# kept on tab1\n",
      }),
    });
    const t2 = (await o2.json()) as TabSnap;
    check("tabs/open 2 ok", o2.ok, t2.error);
    check("tabs/open 2 count", t2.tabs?.length === 2);
    const syncRes = await fetch(`http://127.0.0.1:${port}/api/tabs/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ markdown: "# sync active\n" }),
    });
    check("tabs/sync ok", syncRes.ok);
    const o3 = await fetch(`http://127.0.0.1:${port}/api/tabs/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: tabFiles[2] }),
    });
    const t3 = (await o3.json()) as TabSnap;
    check("tabs/open 3 ok", o3.ok, t3.error);
    check("tabs/open 3 count", t3.tabs?.length === 3);
    check("tabs/open 3 active", t3.mdPath === tabFiles[2]);
    const o4 = await fetch(`http://127.0.0.1:${port}/api/tabs/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: tabFiles[3] }),
    });
    const t4 = (await o4.json()) as TabSnap;
    check("tabs/open 4th is 409", o4.status === 409, t4.error);
    check("tabs/open 4th still 3", t4.tabs?.length === 3);
    const again = await fetch(`http://127.0.0.1:${port}/api/tabs/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: tabFiles[0] }),
    });
    const againBody = (await again.json()) as TabSnap;
    check("tabs/open same path ok", again.ok, againBody.error);
    check("tabs/open same path count", againBody.tabs?.length === 3);
    check("tabs/open same path active", againBody.mdPath === tabFiles[0]);
    const idKitchen = againBody.tabs?.find((t) => t.path === tabFiles[1])?.id;
    const swTab = await fetch(`http://127.0.0.1:${port}/api/tabs/switch`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: idKitchen }),
    });
    const swBody = (await swTab.json()) as TabSnap;
    check("tabs/switch ok", swTab.ok, swBody.error);
    check("tabs/switch active", swBody.mdPath === tabFiles[1]);
    const closeTabRes = await fetch(`http://127.0.0.1:${port}/api/tabs/close`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: idKitchen }),
    });
    const closeBody = (await closeTabRes.json()) as TabSnap;
    check("tabs/close ok", closeTabRes.ok, closeBody.error);
    check("tabs/close count", closeBody.tabs?.length === 2);
    check(
      "tabs/close picks neighbor",
      typeof closeBody.mdPath === "string" && closeBody.mdPath !== tabFiles[1]
    );
    // Legacy open-md replaces when full — reopen to 3 then open 4th via open-md
    await fetch(`http://127.0.0.1:${port}/api/tabs/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: tabFiles[1] }),
    });
    await fetch(`http://127.0.0.1:${port}/api/tabs/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: tabFiles[2] }),
    });
    const legacyOpen = await fetch(`http://127.0.0.1:${port}/api/open-md`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: tabFiles[3] }),
    });
    const legacyBody = (await legacyOpen.json()) as TabSnap;
    check("open-md when full still ok", legacyOpen.ok, legacyBody.error);
    check("open-md when full still 3 tabs", legacyBody.tabs?.length === 3);
    check("open-md when full active is 4th file", legacyBody.mdPath === tabFiles[3]);
  }

  // Single-instance handoff probe (phase 3): running UI is recognized
  {
    for (let i = 0; i < 5; i++) {
      const stRes = await fetch(`http://127.0.0.1:${port}/api/state`);
      const st = (await stRes.json()) as { tabs?: unknown[] };
      if (!st.tabs?.length) break;
      await fetch(`http://127.0.0.1:${port}/api/close-md`, { method: "POST" });
    }
    const { probeMdOutletUi, handoffToExistingUi } = await import(
      "../src/ui-handoff.js"
    );
    const isUi = await probeMdOutletUi("127.0.0.1", port);
    check("handoff probe recognizes ui", isUi);
    const handed = await handoffToExistingUi({
      host: "127.0.0.1",
      port,
      mdPath: resolve(pkgRoot, "examples", "sample.txt"),
      open: false,
    });
    check("handoff open ok", handed.ok, !handed.ok ? handed.error : "");
    if (handed.ok) {
      check(
        "handoff open path",
        handed.kind === "opened" &&
          typeof handed.path === "string" &&
          handed.path.toLowerCase().endsWith("sample.txt")
      );
    }
    const flashState = await fetch(`http://127.0.0.1:${port}/api/state`);
    const flashBody = (await flashState.json()) as {
      uiFlash?: { id?: number; kind?: string; message?: string } | null;
    };
    check(
      "uiFlash after open",
      Boolean(
        flashBody.uiFlash &&
          flashBody.uiFlash.kind === "ok" &&
          typeof flashBody.uiFlash.message === "string" &&
          flashBody.uiFlash.message.includes("sample.txt")
      )
    );
    // Fill 3 tabs then reject 4th — UI should get err flash even though tabs unchanged.
    for (let i = 0; i < 5; i++) {
      const stRes = await fetch(`http://127.0.0.1:${port}/api/state`);
      const st = (await stRes.json()) as { tabs?: unknown[] };
      if (!st.tabs?.length) break;
      await fetch(`http://127.0.0.1:${port}/api/close-md`, { method: "POST" });
    }
    for (const p of [
      resolve(pkgRoot, "examples", "sample.md"),
      resolve(pkgRoot, "examples", "sample-frontmatter.md"),
      resolve(pkgRoot, "examples", "sample.xml"),
    ]) {
      await fetch(`http://127.0.0.1:${port}/api/tabs/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: p }),
      });
    }
    const reject4 = await fetch(`http://127.0.0.1:${port}/api/tabs/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: resolve(pkgRoot, "examples", "sample.json"),
      }),
    });
    check("uiFlash setup 4th is 409", reject4.status === 409);
    const errFlashRes = await fetch(`http://127.0.0.1:${port}/api/state`);
    const errFlash = (await errFlashRes.json()) as {
      uiFlash?: { kind?: string; message?: string } | null;
    };
    check(
      "uiFlash on tab full",
      Boolean(
        errFlash.uiFlash &&
          errFlash.uiFlash.kind === "err" &&
          typeof errFlash.uiFlash.message === "string" &&
          errFlash.uiFlash.message.includes("上限")
      ),
      errFlash.uiFlash?.message
    );
  }

  const saveRes = await fetch(`http://127.0.0.1:${port}/api/save`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ savePath, profile: baseProfile }),
  });
  const saved = (await saveRes.json()) as { path?: string; error?: string };
  check("save ok", saveRes.ok, saved.error);
  check("save file exists", existsSync(savePath));
  if (existsSync(savePath)) {
    const doc = parseYaml(readFileSync(savePath, "utf8")) as {
      meta: { name: string };
      page: { orientation: string };
      breaks: { beforeHeadings: string[] };
    };
    check("saved name", doc.meta.name === "ui-test");
    check("saved landscape", doc.page.orientation === "landscape");
    check("saved h1 breaks", doc.breaks.beforeHeadings.includes("h1"));
  }
} catch (err) {
  failed += 1;
  console.log(
    "FAIL  ui server flow —",
    err instanceof Error ? err.message : err
  );
  if (stderr) console.log(stderr.slice(-800));
} finally {
  stopUiChild(child);
  if (existsSync(savePath)) unlinkSync(savePath);
  if (existsSync(tmpMd)) unlinkSync(tmpMd);
  if (existsSync(customPdf)) unlinkSync(customPdf);
  if (existsSync(saveAsMd)) unlinkSync(saveAsMd);
  if (existsSync(newMdPath)) unlinkSync(newMdPath);
  const dropCleanup = resolve(pkgRoot, "examples", ".tmp-ui-dropped.md");
  if (existsSync(dropCleanup)) unlinkSync(dropCleanup);
}

// Empty startup: no md arg → empty flag + recent list from prior opens
{
  // Seed recent with sample.md via env store left by previous server
  process.env.MD_OUTLET_RECENT_PATH = recentPath;
  rememberRecent(sampleMd);

  const emptyChild = spawnUi([
    "ui",
    "--profile",
    "default",
    "--port",
    String(emptyPort),
    "--no-open",
  ]);
  try {
    await waitFor(`http://127.0.0.1:${emptyPort}/api/state`);
    const emptyRes = await fetch(`http://127.0.0.1:${emptyPort}/api/state`);
    const emptyState = (await emptyRes.json()) as {
      empty?: boolean;
      mdPath?: string | null;
      recent?: { path: string }[];
      markdown?: string;
      error?: string;
    };
    check("empty state ok", emptyRes.ok, emptyState.error);
    check("empty startup flag", emptyState.empty === true);
    check("empty startup mdPath null", emptyState.mdPath == null);
    check(
      "empty startup markdown blank",
      emptyState.markdown === ""
    );
    check(
      "empty startup recent has sample",
      Array.isArray(emptyState.recent) &&
        emptyState.recent.some((e) => e.path === resolve(sampleMd))
    );

    const openFromRecent = await fetch(
      `http://127.0.0.1:${emptyPort}/api/open-md`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: sampleMd }),
      }
    );
    const openedRecent = (await openFromRecent.json()) as {
      path?: string;
      error?: string;
    };
    check("open from recent ok", openFromRecent.ok, openedRecent.error);
    check("open from recent path", openedRecent.path === resolve(sampleMd));

    const closeRes = await fetch(`http://127.0.0.1:${emptyPort}/api/close-md`, {
      method: "POST",
    });
    const closed = (await closeRes.json()) as {
      empty?: boolean;
      mdPath?: string | null;
      recent?: { path: string }[];
      error?: string;
    };
    check("close-md ok", closeRes.ok, closed.error);
    check("close-md empty again", closed.empty === true);
    check("close-md clears path", closed.mdPath == null);
    check(
      "close-md keeps recent",
      Array.isArray(closed.recent) &&
        closed.recent.some((e) => e.path === resolve(sampleMd))
    );
  } catch (err) {
    failed += 1;
    console.log(
      "FAIL  empty ui startup —",
      err instanceof Error ? err.message : err
    );
  } finally {
    stopUiChild(emptyChild);
  }
}

if (existsSync(recentPath)) unlinkSync(recentPath);

if (failed > 0) {
  console.error(`${failed} ui case(s) failed.`);
  process.exit(1);
}
console.log("All ui cases passed.");
process.exit(0);
