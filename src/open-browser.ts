import { spawn } from "node:child_process";
import { platform } from "node:os";
import { resolve } from "node:path";

/**
 * Open a URL or local file with the OS default handler (best-effort).
 * Failures are logged but never thrown — CI / headless must keep working.
 *
 * On Windows we avoid `exec("cmd /c …")` because Node already wraps
 * `exec` in cmd.exe, which breaks quoting. Use `spawn` + PS 5.1-safe
 * `Start-Process -FilePath` (not `-LiteralPath`, which needs PS 7+).
 */
export function openExternal(target: string): void {
  const p = platform();
  const childOpts = {
    detached: true,
    stdio: "ignore" as const,
    windowsHide: true,
  };

  try {
    let child;
    if (p === "win32") {
      const isUrl = /^https?:\/\//i.test(target);
      if (isUrl) {
        child = spawn(
          "cmd.exe",
          ["/c", "start", '""', target.replace(/"/g, "")],
          childOpts
        );
      } else {
        const file = resolve(target).replace(/'/g, "''");
        child = spawn(
          "powershell.exe",
          [
            "-NoProfile",
            "-NonInteractive",
            "-Command",
            `Start-Process -FilePath '${file}'`,
          ],
          childOpts
        );
      }
    } else if (p === "darwin") {
      child = spawn("open", [target], childOpts);
    } else {
      child = spawn("xdg-open", [target], childOpts);
    }

    child.on("error", (err) => {
      console.error(`Could not open automatically: ${err.message}`);
      console.error(`Open manually: ${target}`);
    });
    child.unref();
  } catch (err) {
    console.error(
      `Could not open automatically: ${err instanceof Error ? err.message : err}`
    );
    console.error(`Open manually: ${target}`);
  }
}

/** Open a URL in the default browser (alias of openExternal). */
export function openBrowser(url: string): void {
  openExternal(url);
}
