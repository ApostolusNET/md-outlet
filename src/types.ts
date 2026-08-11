import type { AllowHtmlSetting } from "./html-mode.js";

export type PageFormat = "A4" | "A3" | "Letter" | "Legal";
export type Orientation = "portrait" | "landscape";
export type HeadingTag = "h1" | "h2" | "h3" | "h4" | "h5" | "h6";

export interface ProfileMeta {
  name: string;
  description?: string;
  authors?: string[];
}

export interface ProfilePage {
  format: PageFormat;
  orientation: Orientation;
  margin: {
    top: string;
    right: string;
    bottom: string;
    left: string;
  };
  printBackground: boolean;
  /** PDF print scale (0.1–2.0). Optional; default 1. HTML/preview ignore this. */
  scale?: number;
}

export interface ProfileBreaks {
  beforeHeadings: HeadingTag[];
  skipFirst: boolean;
  avoidInside: string[];
  avoidAfter: string[];
}

export interface ProfileMarkdown {
  gfm: boolean;
  highlight: boolean;
  highlightStyle: string;
  /**
   * Raw HTML policy for Markdown source.
   * boolean kept for compat: false → off, true → breaks.
   * Prefer "off" | "breaks" | "raw".
   */
  allowHtml: AllowHtmlSetting;
}

export interface Profile {
  version: 1;
  meta: ProfileMeta;
  page: ProfilePage;
  theme: string;
  breaks: ProfileBreaks;
  markdown: ProfileMarkdown;
  bodyClass: string[];
  /** Absolute path to the profile file (added at load time). */
  __sourcePath?: string;
}
