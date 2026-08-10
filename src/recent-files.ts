import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { PKG_ROOT } from "./paths.js";

export interface RecentEntry {
  /** Absolute path to a Markdown file */
  path: string;
  /** ISO timestamp of last open/save */
  openedAt: string;
  /** Pinned entries stay at the top */
  pinned?: boolean;
}

const DEFAULT_LIMIT = 40;

/** Default: beside the tool (`md-outlet/.md-outlet-recent.json`). Override with MD_OUTLET_RECENT_PATH. */
export function recentStorePath(): string {
  const env = process.env.MD_OUTLET_RECENT_PATH?.trim();
  if (env) return resolve(env);
  return resolve(PKG_ROOT, ".md-outlet-recent.json");
}

function normalizePath(p: string): string {
  const raw = p.trim();
  if (!raw) return "";
  return isAbsolute(raw) ? resolve(raw) : resolve(process.cwd(), raw);
}

function pathKey(p: string): string {
  return resolve(p).toLowerCase();
}

function readStore(file: string): RecentEntry[] {
  if (!existsSync(file)) return [];
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as {
      recent?: RecentEntry[];
    };
    if (!Array.isArray(raw.recent)) return [];
    return raw.recent
      .filter(
        (e) =>
          e &&
          typeof e.path === "string" &&
          e.path.trim() &&
          typeof e.openedAt === "string"
      )
      .map((e) => ({
        path: resolve(e.path),
        openedAt: e.openedAt,
        pinned: Boolean(e.pinned),
      }));
  } catch {
    return [];
  }
}

function writeStore(file: string, recent: RecentEntry[]): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(
    file,
    JSON.stringify({ version: 1, recent }, null, 2) + "\n",
    "utf8"
  );
}

function sortRecent(entries: RecentEntry[]): RecentEntry[] {
  return [...entries].sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return String(b.openedAt).localeCompare(String(a.openedAt));
  });
}

function existingOnly(entries: RecentEntry[]): {
  kept: RecentEntry[];
  changed: boolean;
} {
  const kept: RecentEntry[] = [];
  let changed = false;
  for (const e of entries) {
    if (!existsSync(e.path)) {
      changed = true;
      continue;
    }
    kept.push(e);
  }
  return { kept, changed };
}

/**
 * Recent files that still exist on disk (missing paths are dropped and saved).
 * Pinned entries are listed first.
 */
export function listRecent(limit: number = DEFAULT_LIMIT): RecentEntry[] {
  const file = recentStorePath();
  const all = readStore(file);
  const { kept, changed } = existingOnly(all);
  const sorted = sortRecent(kept).slice(0, limit);
  if (changed || sorted.length < all.length) {
    writeStore(file, sorted);
  }
  return sorted;
}

/** Move `path` to the front of the unpinned group (keeps pin flag). */
export function rememberRecent(
  path: string,
  limit: number = DEFAULT_LIMIT
): RecentEntry[] {
  const abs = normalizePath(path);
  if (!abs || !existsSync(abs)) return listRecent(limit);
  const file = recentStorePath();
  const prev = readStore(file);
  const existing = prev.find((e) => pathKey(e.path) === pathKey(abs));
  const rest = prev.filter((e) => pathKey(e.path) !== pathKey(abs));
  const next: RecentEntry[] = sortRecent([
    {
      path: abs,
      openedAt: new Date().toISOString(),
      pinned: Boolean(existing?.pinned),
    },
    ...rest,
  ]).slice(0, limit);
  writeStore(file, next);
  return listRecent(limit);
}

export function removeRecent(
  path: string,
  limit: number = DEFAULT_LIMIT
): RecentEntry[] {
  const abs = normalizePath(path);
  const file = recentStorePath();
  const next = readStore(file).filter((e) => pathKey(e.path) !== pathKey(abs));
  writeStore(file, next);
  return listRecent(limit);
}

export function setRecentPinned(
  path: string,
  pinned: boolean,
  limit: number = DEFAULT_LIMIT
): RecentEntry[] {
  const abs = normalizePath(path);
  if (!abs) return listRecent(limit);
  const file = recentStorePath();
  const prev = readStore(file);
  let found = false;
  const next = prev.map((e) => {
    if (pathKey(e.path) !== pathKey(abs)) return e;
    found = true;
    return { ...e, pinned: Boolean(pinned) };
  });
  if (!found && existsSync(abs)) {
    next.unshift({
      path: abs,
      openedAt: new Date().toISOString(),
      pinned: Boolean(pinned),
    });
  }
  writeStore(file, sortRecent(next).slice(0, limit));
  return listRecent(limit);
}
