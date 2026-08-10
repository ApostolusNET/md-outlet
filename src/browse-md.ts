import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { platform } from "node:os";
import {
  dirname,
  extname,
  isAbsolute,
  join,
  parse,
  relative,
  resolve,
  sep,
} from "node:path";
import { PKG_ROOT } from "./paths.js";

const SKIP_DIRS = new Set(["node_modules", ".git", ".tmp-init"]);

/** True when `candidate` resolves to a path strictly inside `root`. */
export function isPathInsideRoot(candidate: string, root: string): boolean {
  const abs = resolve(candidate);
  const rootAbs = resolve(root);
  const rel = relative(rootAbs, abs);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

export function isPathInsideRootOrEqual(
  candidate: string,
  root: string
): boolean {
  const abs = resolve(candidate);
  const rootAbs = resolve(root);
  if (abs === rootAbs) return true;
  return isPathInsideRoot(abs, rootAbs);
}

/** Drive root on Windows (`C:\\`), UNC share root, or POSIX `/`. */
export function browseRootFrom(anchor: string = PKG_ROOT): string {
  return parse(resolve(anchor)).root;
}

export interface BrowseRootEntry {
  id: string;
  label: string;
  path: string;
}

/** Distro names via `wsl -l -q` (avoids hanging on `\\\\wsl.localhost\\` probes). */
function listWslDistroNames(): string[] {
  if (platform() !== "win32") return [];
  try {
    const r = spawnSync("wsl.exe", ["-l", "-q"], {
      encoding: "buffer",
      timeout: 2500,
      windowsHide: true,
    });
    if (r.error || (r.status !== 0 && r.status !== null) || !r.stdout?.length) {
      return [];
    }
    const text = r.stdout.toString("utf16le").replace(/^\uFEFF/, "");
    return text
      .split(/\r?\n/)
      .map((s) => s.replace(/\0/g, "").trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

let rootsCache: { home: string; at: number; roots: BrowseRootEntry[] } | null =
  null;

/**
 * Jump targets for the open picker: package home, local drive, WSL distros.
 * WSL entries use `\\wsl.localhost\<distro>\` (listed via `wsl -l`, not UNC probe).
 */
export function listBrowseRoots(home: string = PKG_ROOT): BrowseRootEntry[] {
  const homeAbs = resolve(home);
  const now = Date.now();
  if (
    rootsCache &&
    rootsCache.home === homeAbs &&
    now - rootsCache.at < 30_000
  ) {
    return rootsCache.roots;
  }

  const out: BrowseRootEntry[] = [
    { id: "home", label: "md-outlet", path: homeAbs },
  ];

  const drive = browseRootFrom(homeAbs);
  if (drive) {
    const driveAbs = resolve(drive);
    if (driveAbs.toLowerCase() !== homeAbs.toLowerCase()) {
      const label = driveAbs.replace(/[\\/]+$/, "") || driveAbs;
      out.push({ id: "drive", label, path: driveAbs });
    }
  }

  for (const name of listWslDistroNames()) {
    const p = `\\\\wsl.localhost\\${name}\\`;
    out.push({
      id: `wsl:${name}`,
      label: `WSL: ${name}`,
      path: p,
    });
  }

  rootsCache = { home: homeAbs, at: now, roots: out };
  return out;
}

export interface BrowseMdEntry {
  name: string;
  /** Absolute path */
  path: string;
}

export interface BrowseMdResult {
  /** Highest folder ↑ may reach for the current place (drive or UNC share) */
  root: string;
  /** Default / “home” folder (package root) */
  home: string;
  dir: string;
  /** Path shown in the UI (absolute) */
  display: string;
  parent: string | null;
  dirs: BrowseMdEntry[];
  files: BrowseMdEntry[];
}

export interface BrowseMdOptions {
  /**
   * Ceiling for ↑ navigation. Default: drive/UNC root of the directory
   * being listed (so C: and WSL shares each have their own ceiling).
   */
  browseRoot?: string;
  /** Base for relative `dir` and the Home jump target (default: package root) */
  home?: string;
  /**
   * File extensions to list (lowercase, with dot). Default: Markdown.
   * Pass `[]` to list directories only.
   */
  extensions?: string[];
}

/**
 * List directories and matching files.
 * Local drives and WSL UNC paths (`\\wsl.localhost\Distro\...`) are supported
 * when the OS exposes them to Node.
 */
export function browseMarkdownDir(
  dirReq?: string,
  options: BrowseMdOptions | string = {}
): BrowseMdResult {
  // Back-compat: second arg used to be a single locked root string.
  const opts: BrowseMdOptions =
    typeof options === "string"
      ? { home: options, browseRoot: options }
      : options;

  const homeAbs = resolve(opts.home ?? PKG_ROOT);
  const extensions =
    opts.extensions === undefined
      ? [".md", ".markdown"]
      : opts.extensions.map((e) => e.toLowerCase());

  let dirAbs = homeAbs;
  if (dirReq && dirReq.trim()) {
    const raw = dirReq.trim();
    dirAbs = isAbsolute(raw) ? resolve(raw) : resolve(homeAbs, raw);
  }

  const rootAbs = resolve(opts.browseRoot ?? browseRootFrom(dirAbs));

  if (!existsSync(rootAbs) && rootAbs === browseRootFrom(dirAbs)) {
    // UNC root may not stat as a normal directory on some hosts; listing dir is enough.
  } else if (opts.browseRoot && !existsSync(resolve(opts.browseRoot))) {
    throw new Error(`Browse root not found: ${rootAbs}`);
  }

  if (!isPathInsideRootOrEqual(dirAbs, rootAbs)) {
    throw new Error(`Path is outside browse root (${rootAbs}): ${dirAbs}`);
  }
  if (!existsSync(dirAbs) || !statSync(dirAbs).isDirectory()) {
    throw new Error(`Directory not found: ${dirAbs}`);
  }

  const names = readdirSync(dirAbs);
  const dirs: BrowseMdEntry[] = [];
  const files: BrowseMdEntry[] = [];

  for (const name of names) {
    if (name === "." || name === "..") continue;
    const full = join(dirAbs, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (SKIP_DIRS.has(name)) continue;
      dirs.push({ name, path: full });
    } else if (st.isFile() && extensions.length > 0) {
      const ext = extname(name).toLowerCase();
      if (extensions.includes(ext)) {
        files.push({ name, path: full });
      }
    }
  }

  dirs.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );
  files.sort((a, b) =>
    a.name.localeCompare(b.name, undefined, { sensitivity: "base" })
  );

  let parent: string | null = null;
  if (dirAbs !== rootAbs) {
    const up = dirname(dirAbs);
    parent = isPathInsideRootOrEqual(up, rootAbs) ? up : null;
    // dirname(UNC share root) can equal itself — treat as top.
    if (parent && resolve(parent) === resolve(dirAbs)) parent = null;
  }

  return {
    root: rootAbs,
    home: homeAbs,
    dir: dirAbs,
    display: dirAbs,
    parent,
    dirs,
    files,
  };
}
