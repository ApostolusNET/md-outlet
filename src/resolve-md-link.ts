import { existsSync } from "node:fs";
import { dirname, extname, isAbsolute, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const MD_EXT = /\.(md|markdown)$/i;

export function isMarkdownPath(p: string): boolean {
  return MD_EXT.test(p);
}

/**
 * Convert file: URLs (including UNC `file:////server/share/...`) to a FS path.
 */
export function fileUrlToFsPath(href: string): string | null {
  const raw = href.trim();
  if (!/^file:/i.test(raw)) return null;
  try {
    return fileURLToPath(raw);
  } catch {
    /* UNC / odd forms */
  }
  // file:////wsl.localhost/Ubuntu-24.04/home/a.md
  // file://wsl.localhost/Ubuntu-24.04/home/a.md
  const m = raw.match(/^file:\/{2,}([^/]+)\/(.*)$/i);
  if (!m) return null;
  const host = decodeURIComponent(m[1]);
  const rest = decodeURIComponent(m[2]).replace(/\//g, "\\");
  // Drive letter mistaken as host: file:///C:/...
  if (/^[a-zA-Z]:$/.test(host) || /^[a-zA-Z]:\\/.test(host + "\\")) {
    const drive = host.replace(/\\/g, "");
    return resolve(`${drive}\\${rest}`);
  }
  return `\\\\${host}\\${rest}`;
}

function decodeHref(href: string): string {
  let s = href.trim();
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep */
  }
  // Bad MD escapes often become %5C → \
  return s.replace(/%5[cC]/g, "\\");
}

export type ResolveMdLinkResult =
  | { ok: true; path: string }
  | { ok: false; reason: "skip"; detail?: string }
  | { ok: false; reason: "error"; error: string };

/**
 * Resolve a preview link href to a local Markdown path to open in the UI.
 * Skips http(s), mailto, in-page hashes, etc.
 */
export function resolveMarkdownOpenLink(
  href: string,
  baseMdPath?: string | null
): ResolveMdLinkResult {
  const raw = href.trim();
  if (!raw || raw === "#" || raw.startsWith("#")) {
    return { ok: false, reason: "skip", detail: "hash" };
  }
  if (/^(https?:|mailto:|tel:|data:|blob:)/i.test(raw)) {
    return { ok: false, reason: "skip", detail: "remote" };
  }

  let candidate: string | null = null;
  const decoded = decodeHref(raw);

  if (/^file:/i.test(decoded)) {
    candidate = fileUrlToFsPath(decoded);
    if (!candidate) {
      return {
        ok: false,
        reason: "error",
        error: `file: URL を解釈できません: ${raw}`,
      };
    }
  } else if (
    decoded.startsWith("\\\\") ||
    /^[a-zA-Z]:[\\/]/.test(decoded)
  ) {
    candidate = resolve(decoded);
  } else if (decoded.startsWith("//") && !/^\/\/http/i.test(decoded)) {
    // Protocol-relative UNC-ish: //wsl.localhost/Ubuntu/.../a.md
    const body = decoded.replace(/^\/\//, "").replace(/\//g, "\\");
    candidate = `\\\\${body}`;
  } else if (isAbsolute(decoded)) {
    candidate = resolve(decoded);
  } else {
    if (!baseMdPath) {
      return {
        ok: false,
        reason: "error",
        error: "相対リンクを開くには、先に Markdown ファイルを開いてください",
      };
    }
    candidate = resolve(dirname(resolve(baseMdPath)), decoded);
  }

  if (!isMarkdownPath(candidate)) {
    return {
      ok: false,
      reason: "skip",
      detail: "not-markdown",
    };
  }

  if (!existsSync(candidate)) {
    return {
      ok: false,
      reason: "error",
      error: `Markdown file not found: ${candidate}`,
    };
  }

  return { ok: true, path: candidate };
}
