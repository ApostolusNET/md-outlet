import { spawnSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import {
  basename,
  isAbsolute,
  join,
  resolve,
} from "node:path";
import { listRecent } from "./recent-files.js";
import { fileUrlToFsPath } from "./resolve-md-link.js";
import { isMarkdownPath } from "./file-kind.js";

export interface DropResolveInput {
  /** File name from the browser File object */
  name?: string;
  /** Byte size from File.size */
  size?: number;
  /** File.lastModified (ms) */
  lastModified?: number;
  /** Path hint from client (file.path / file: URI / absolute path) */
  pathHint?: string;
  /** Extra directories to probe as join(dir, name) */
  searchDirs?: string[];
}

export interface DropResolveResult {
  /** Unique best match — open this path as-is (original location) */
  path?: string;
  /** Ambiguous matches for the user to pick */
  candidates: string[];
  /** How the path was found (debug / status) */
  method?: string;
}

function normalizePathHint(hint?: string): string | null {
  const raw = hint?.trim() || "";
  if (!raw) return null;
  if (/^file:/i.test(raw)) {
    return fileUrlToFsPath(raw);
  }
  if (raw.startsWith("\\\\") || /^[a-zA-Z]:[\\/]/.test(raw)) {
    return resolve(raw);
  }
  if (isAbsolute(raw)) return resolve(raw);
  return null;
}

function scoreMatch(
  filePath: string,
  size?: number,
  lastModified?: number
): number {
  if (!existsSync(filePath)) return -1;
  let st;
  try {
    st = statSync(filePath);
  } catch {
    return -1;
  }
  if (!st.isFile() || !isMarkdownPath(filePath)) return -1;
  let score = 1;
  if (typeof size === "number" && size >= 0) {
    if (st.size === size) score += 10;
    else score -= 3;
  }
  if (typeof lastModified === "number" && lastModified > 0) {
    const diff = Math.abs(st.mtimeMs - lastModified);
    if (diff < 3000) score += 10;
    else if (diff < 120_000) score += 3;
    else score -= 1;
  }
  return score;
}

/** Resolve .lnk targets in the Windows Recent folder (best-effort). */
export function listWindowsRecentTargets(): string[] {
  if (process.platform !== "win32") return [];
  const script = `
$ErrorActionPreference = 'SilentlyContinue'
$sh = New-Object -ComObject WScript.Shell
$dir = Join-Path $env:APPDATA 'Microsoft\\Windows\\Recent'
if (-not (Test-Path -LiteralPath $dir)) { return }
Get-ChildItem -LiteralPath $dir -Filter *.lnk | ForEach-Object {
  $t = $sh.CreateShortcut($_.FullName).TargetPath
  if ($t) { $t }
}
`;
  try {
    const r = spawnSync(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", script],
      {
        encoding: "utf8",
        timeout: 8000,
        windowsHide: true,
        maxBuffer: 2 * 1024 * 1024,
      }
    );
    if (r.status !== 0 || !r.stdout) return [];
    return r.stdout
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function addCandidate(map: Map<string, string>, filePath: string): void {
  if (!filePath || !isMarkdownPath(filePath)) return;
  const abs = resolve(filePath);
  if (!existsSync(abs)) return;
  const key = abs.toLowerCase();
  if (!map.has(key)) map.set(key, abs);
}

/**
 * Try to map a browser DnD File back to a real disk path so we can open
 * the original location instead of copying into the tool folder.
 */
export function resolveDroppedMarkdownPath(
  input: DropResolveInput
): DropResolveResult {
  const name = basename((input.name || "").trim() || "");
  const size = input.size;
  const lastModified = input.lastModified;

  const hint = normalizePathHint(input.pathHint);
  if (hint && existsSync(hint) && isMarkdownPath(hint)) {
    return { path: resolve(hint), candidates: [], method: "path-hint" };
  }

  const pool = new Map<string, string>();

  if (name) {
    for (const dir of input.searchDirs || []) {
      if (!dir?.trim()) continue;
      try {
        addCandidate(pool, join(resolve(dir), name));
      } catch {
        /* ignore bad dir */
      }
    }
    for (const entry of listRecent()) {
      if (basename(entry.path).toLowerCase() === name.toLowerCase()) {
        addCandidate(pool, entry.path);
      }
    }
    for (const target of listWindowsRecentTargets()) {
      if (basename(target).toLowerCase() === name.toLowerCase()) {
        addCandidate(pool, target);
      }
    }
  }

  const scored = [...pool.values()]
    .map((p) => ({ path: p, score: scoreMatch(p, size, lastModified) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  if (!scored.length) {
    return { candidates: [] };
  }
  if (scored.length === 1) {
    return {
      path: scored[0].path,
      candidates: [],
      method: "unique-match",
    };
  }
  const best = scored[0];
  const second = scored[1];
  // Strong fingerprint (size and/or mtime) and clear winner.
  if (best.score >= 11 && best.score >= second.score + 5) {
    return {
      path: best.path,
      candidates: scored.map((s) => s.path),
      method: "fingerprint",
    };
  }
  return {
    candidates: scored.map((s) => s.path).slice(0, 8),
    method: "ambiguous",
  };
}

/** Home dir helper for callers that want a default search root. */
export function defaultDropSearchHome(): string {
  try {
    return homedir();
  } catch {
    return process.cwd();
  }
}
