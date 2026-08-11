import { dirname, resolve, sep } from "node:path";
import { PKG_ROOT } from "./paths.js";

function normKey(p: string): string {
  const n = resolve(p);
  return process.platform === "win32" ? n.toLowerCase() : n;
}

function isUnderOrEqual(absPath: string, rootDir: string): boolean {
  const root = resolve(rootDir);
  const target = resolve(absPath);
  const rootKey = normKey(root);
  const targetKey = normKey(target);
  if (targetKey === rootKey) return true;
  const prefix = rootKey.endsWith(sep) ? rootKey : rootKey + sep;
  return targetKey.startsWith(prefix);
}

/**
 * True when absPath is outside the md-outlet package root
 * (not the root itself and not under it).
 */
export function isOutsidePackage(absPath: string, packageRoot = PKG_ROOT): boolean {
  return !isUnderOrEqual(absPath, packageRoot);
}

/**
 * True when a write should ask for confirmOutside.
 * Skips confirm when the target is inside the package, or under any
 * trusted directory (typically the folder of the open document).
 *
 * Rationale: normal PDF/save next to a Documents/*.md file is expected;
 * only jumping to an unrelated outside folder needs an extra prompt.
 */
export function needsOutsideWriteConfirm(
  absPath: string,
  trustDirs: Iterable<string | null | undefined> = [],
  packageRoot = PKG_ROOT
): boolean {
  if (!isOutsidePackage(absPath, packageRoot)) return false;
  for (const dir of trustDirs) {
    const d = typeof dir === "string" ? dir.trim() : "";
    if (!d) continue;
    if (isUnderOrEqual(absPath, d)) return false;
  }
  return true;
}

/** Trust the directory that contains the active document (if any). */
export function trustDirsForActiveDoc(
  activePath: string | null | undefined
): string[] {
  if (!activePath) return [];
  return [dirname(resolve(activePath))];
}

export const OUTSIDE_PACKAGE_CODE = "OUTSIDE_PACKAGE";

export function outsidePackagePayload(absPath: string): {
  error: string;
  code: typeof OUTSIDE_PACKAGE_CODE;
  path: string;
  needsConfirm: true;
} {
  return {
    error: `Path is outside the md-outlet package. Confirm to write: ${absPath}`,
    code: OUTSIDE_PACKAGE_CODE,
    path: absPath,
    needsConfirm: true,
  };
}
