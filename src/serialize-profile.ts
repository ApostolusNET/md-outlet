import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { stringify } from "yaml";
import type { Profile } from "./types.js";
import { mergeProfilePartial } from "./merge-profile.js";

export function profileToObject(profile: Profile): Record<string, unknown> {
  return {
    version: 1,
    meta: {
      name: profile.meta.name,
      ...(profile.meta.description
        ? { description: profile.meta.description }
        : {}),
      ...(profile.meta.authors?.length
        ? { authors: profile.meta.authors }
        : {}),
    },
    page: {
      format: profile.page.format,
      orientation: profile.page.orientation,
      margin: { ...profile.page.margin },
      printBackground: profile.page.printBackground,
      ...(profile.page.scale !== undefined && profile.page.scale !== 1
        ? { scale: profile.page.scale }
        : {}),
    },
    theme: profile.theme,
    breaks: {
      beforeHeadings: [...profile.breaks.beforeHeadings],
      skipFirst: profile.breaks.skipFirst,
      avoidInside: [...profile.breaks.avoidInside],
      avoidAfter: [...profile.breaks.avoidAfter],
    },
    markdown: { ...profile.markdown },
    bodyClass: [...profile.bodyClass],
  };
}

export function stringifyProfile(
  profile: Profile,
  opts?: { asJson?: boolean; headerComment?: string }
): string {
  const doc = profileToObject(profile);
  if (opts?.asJson || false) {
    return `${JSON.stringify(doc, null, 2)}\n`;
  }
  const body = stringify(doc, { lineWidth: 88 });
  const header = opts?.headerComment
    ? `${opts.headerComment.replace(/\s+$/, "")}\n`
    : "";
  const text = `${header}${body}`;
  return text.endsWith("\n") ? text : `${text}\n`;
}

/**
 * Apply a UI / API profile payload onto a base profile and return a
 * complete Profile (no __sourcePath unless provided).
 */
export function profileFromPayload(
  base: Profile,
  payload: Record<string, unknown>
): Profile {
  const merged = mergeProfilePartial(base, payload);
  if (payload.version !== undefined && payload.version !== 1) {
    throw new Error(`Unsupported profile version: ${String(payload.version)}`);
  }
  return merged;
}

export function saveProfileFile(
  profile: Profile,
  outputPath: string,
  opts?: { force?: boolean }
): string {
  const outAbs = resolve(process.cwd(), outputPath);
  if (existsSync(outAbs) && opts?.force === false) {
    throw new Error(`File exists: ${outAbs}`);
  }
  const ext = extname(outAbs).toLowerCase();
  const relHint = outAbs.replace(/\\/g, "/");
  const text = stringifyProfile(profile, {
    asJson: ext === ".json",
    headerComment: `# md-outlet profile — saved by md-outlet ui\n#   md-outlet pdf your.md --profile ${relHint}`,
  });
  mkdirSync(dirname(outAbs), { recursive: true });
  writeFileSync(outAbs, text, "utf8");
  return outAbs;
}
