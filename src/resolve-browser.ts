import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";

export type BrowserResolution = {
  kind: "executable";
  path: string;
  source: string;
};

type Candidate = { path: string; source: string };

function envPath(name: string, env: NodeJS.ProcessEnv): string | undefined {
  const v = env[name]?.trim();
  return v || undefined;
}

/** Windows / macOS fixed install locations (stable channel only). */
export function systemBrowserCandidates(
  plat: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env
): Candidate[] {
  if (plat === "win32") {
    const pf = env["ProgramFiles"] || "C:\\Program Files";
    const pf86 = env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
    const local = env.LOCALAPPDATA || "";
    return [
      {
        path: join(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
        source: "edge",
      },
      {
        path: join(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
        source: "edge",
      },
      {
        path: join(pf, "Google", "Chrome", "Application", "chrome.exe"),
        source: "chrome",
      },
      {
        path: join(pf86, "Google", "Chrome", "Application", "chrome.exe"),
        source: "chrome",
      },
      ...(local
        ? [
            {
              path: join(
                local,
                "Google",
                "Chrome",
                "Application",
                "chrome.exe"
              ),
              source: "chrome",
            },
          ]
        : []),
    ];
  }

  if (plat === "darwin") {
    return [
      {
        path: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        source: "chrome",
      },
      {
        path: "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        source: "edge",
      },
    ];
  }

  const names = [
    { name: "google-chrome", source: "chrome" },
    { name: "google-chrome-stable", source: "chrome" },
    { name: "chromium", source: "chrome" },
    { name: "chromium-browser", source: "chrome" },
    { name: "microsoft-edge", source: "edge" },
    { name: "microsoft-edge-stable", source: "edge" },
  ];
  const pathEnv = env.PATH || "";
  const dirs = pathEnv.split(delimiter).filter(Boolean);
  const out: Candidate[] = [];
  for (const { name, source } of names) {
    for (const dir of dirs) {
      out.push({ path: join(dir, name), source });
    }
  }
  return out;
}

export function browserNotFoundMessage(plat: NodeJS.Platform = process.platform): string {
  const base =
    "PDF 用のブラウザが見つかりません。推奨環境は Windows + 最新の Microsoft Edge（安定版）+ Node 18 LTS です。";
  if (plat === "win32") {
    return (
      base +
      " Edge を入れるか、環境変数 MD_OUTLET_BROWSER に msedge.exe の絶対パスを設定してください。"
    );
  }
  return (
    base +
    " Chrome または Edge を入れるか、MD_OUTLET_BROWSER / PUPPETEER_EXECUTABLE_PATH に実行ファイルの絶対パスを設定してください。"
  );
}

/**
 * Resolve a system Chrome/Edge for PDF (puppeteer-core; no bundled Chromium).
 *
 * - `MD_OUTLET_BROWSER=<absolute path>`
 * - `PUPPETEER_EXECUTABLE_PATH`
 * - OS candidates (Windows: Edge first)
 *
 * Throws if none found. Recommended: Windows + current Edge stable.
 */
export function resolvePdfBrowser(
  env: NodeJS.ProcessEnv = process.env,
  plat: NodeJS.Platform = process.platform
): BrowserResolution {
  const forced = envPath("MD_OUTLET_BROWSER", env);
  if (forced) {
    if (!existsSync(forced)) {
      throw new Error(
        `MD_OUTLET_BROWSER のパスが見つかりません: ${forced}`
      );
    }
    return { kind: "executable", path: forced, source: "MD_OUTLET_BROWSER" };
  }

  const pptr = envPath("PUPPETEER_EXECUTABLE_PATH", env);
  if (pptr) {
    if (!existsSync(pptr)) {
      throw new Error(
        `PUPPETEER_EXECUTABLE_PATH のパスが見つかりません: ${pptr}`
      );
    }
    return {
      kind: "executable",
      path: pptr,
      source: "PUPPETEER_EXECUTABLE_PATH",
    };
  }

  for (const c of systemBrowserCandidates(plat, env)) {
    if (existsSync(c.path)) {
      return { kind: "executable", path: c.path, source: c.source };
    }
  }

  throw new Error(browserNotFoundMessage(plat));
}

export function formatBrowserResolution(r: BrowserResolution): string {
  return `${r.path} (${r.source})`;
}
