import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import { DEFAULT_LANG, t, type Lang } from "./i18n.js";

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

export function browserNotFoundMessage(
  plat: NodeJS.Platform = process.platform,
  lang: Lang = DEFAULT_LANG
): string {
  const base = t(lang, "msg.browserNotFound");
  if (plat === "win32") {
    return base + t(lang, "msg.browserNotFoundWin");
  }
  return base + t(lang, "msg.browserNotFoundOther");
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
  plat: NodeJS.Platform = process.platform,
  lang: Lang = DEFAULT_LANG
): BrowserResolution {
  const forced = envPath("MD_OUTLET_BROWSER", env);
  if (forced) {
    if (!existsSync(forced)) {
      throw new Error(
        t(lang, "msg.browserEnvMissing", {
          name: "MD_OUTLET_BROWSER",
          path: forced,
        })
      );
    }
    return { kind: "executable", path: forced, source: "MD_OUTLET_BROWSER" };
  }

  const pptr = envPath("PUPPETEER_EXECUTABLE_PATH", env);
  if (pptr) {
    if (!existsSync(pptr)) {
      throw new Error(
        t(lang, "msg.browserEnvMissing", {
          name: "PUPPETEER_EXECUTABLE_PATH",
          path: pptr,
        })
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

  throw new Error(browserNotFoundMessage(plat, lang));
}

export function formatBrowserResolution(r: BrowserResolution): string {
  return `${r.path} (${r.source})`;
}
