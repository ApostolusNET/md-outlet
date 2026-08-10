import puppeteer, { type PaperFormat, type PDFOptions, type Browser } from "puppeteer-core";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Profile } from "./types.js";
import {
  formatBrowserResolution,
  resolvePdfBrowser,
  type BrowserResolution,
} from "./resolve-browser.js";

export interface ExportPdfOptions {
  html: string;
  profile: Profile;
  /** Override browser resolution (tests). Default: env + system detect. */
  browser?: BrowserResolution;
  /** Suppress the one-line PDF browser log. */
  quiet?: boolean;
}

/**
 * On Windows, `browser.close()` sometimes hangs while cleaning up the
 * Puppeteer profile directory (EPERM on ephemeral cache files). We wait
 * a short grace period and then kill the browser process to guarantee
 * the CLI exits.
 */
async function closeBrowser(browser: Browser, timeoutMs = 3000): Promise<void> {
  const proc = browser.process();
  const closer = browser.close().catch(() => undefined);
  const timer = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), timeoutMs)
  );
  const outcome = await Promise.race([closer.then(() => "ok"), timer]);
  if (outcome === "timeout" && proc && !proc.killed) {
    try {
      proc.kill("SIGKILL");
    } catch {
      /* ignore */
    }
  }
}

/** Best-effort: wait for <img> load/error so local file:// images appear in PDF. */
async function waitForImages(page: {
  evaluate: (fn: () => Promise<void>) => Promise<void>;
}, timeoutMs = 8000): Promise<void> {
  try {
    await Promise.race([
      page.evaluate(async () => {
        const imgs = Array.from(document.images);
        await Promise.all(
          imgs.map(
            (img) =>
              img.complete
                ? Promise.resolve()
                : new Promise<void>((resolve) => {
                    img.addEventListener("load", () => resolve(), { once: true });
                    img.addEventListener("error", () => resolve(), { once: true });
                  })
          )
        );
      }),
      new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
    ]);
  } catch {
    /* ignore — broken images must not abort PDF */
  }
}

export async function exportPdf({
  html,
  profile,
  browser: browserOverride,
  quiet,
}: ExportPdfOptions): Promise<Uint8Array> {
  const resolved = browserOverride ?? resolvePdfBrowser();
  if (!quiet) {
    console.error(`PDF browser: ${formatBrowserResolution(resolved)}`);
  }

  // Unique profile dir avoids singleton lock with the user's open Edge/Chrome
  // (UI tab) and leftover headless sessions on Windows.
  const userDataDir = mkdtempSync(join(tmpdir(), "md-outlet-pdf-"));
  let browser: Browser | undefined;
  try {
    browser = await puppeteer.launch({
      headless: true,
      executablePath: resolved.path,
      userDataDir,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--allow-file-access-from-files",
        "--disable-gpu",
        "--disable-dev-shm-usage",
      ],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "domcontentloaded" });
    await waitForImages(page);
    await page.emulateMediaType("print");

    const pdfOptions: PDFOptions = {
      format: profile.page.format as PaperFormat,
      landscape: profile.page.orientation === "landscape",
      printBackground: profile.page.printBackground,
      margin: {
        top: profile.page.margin.top,
        right: profile.page.margin.right,
        bottom: profile.page.margin.bottom,
        left: profile.page.margin.left,
      },
      preferCSSPageSize: false,
      scale: profile.page.scale ?? 1,
    };
    const pdf = await page.pdf(pdfOptions);
    return pdf;
  } finally {
    if (browser) await closeBrowser(browser);
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {
      /* Windows may retain locks briefly */
    }
  }
}
