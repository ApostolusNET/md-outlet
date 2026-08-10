/**
 * Client/server-shared LOG line filtering (display only — never mutates the file).
 * Implementation lives in ui/js/log-filter.js (unbundled UI + Node tests).
 */

export {
  splitLogLines,
  filterLogLines,
  formatFilteredLogLines,
} from "../ui/js/log-filter.js";

export type LogLevelChip = "ERROR" | "WARN" | "INFO";

export type LogFilterOptions = {
  /** Substring; empty = no text filter */
  query?: string;
  /** Selected level chips; empty = no level filter */
  levels?: LogLevelChip[];
};

export type LogFilterResult = {
  /** 0-based indices into the original lines array */
  indices: number[];
  total: number;
  matched: number;
};
