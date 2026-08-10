/**
 * Client/server-shared LOG line filtering (display only — never mutates the file).
 *
 * Stage 1: substring query (case-insensitive for ASCII) + keep original line numbers
 * Stage 2: ERROR / WARN / INFO level chips (OR among selected; AND with query)
 */

/** @typedef {"ERROR"|"WARN"|"INFO"} LogLevelChip */

const LEVEL_RE = {
  ERROR: /\bERROR\b/i,
  WARN: /\bWARN(?:ING)?\b/i,
  INFO: /\bINFO\b/i,
};

export function splitLogLines(raw) {
  const text = String(raw || "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n");
  if (!text) return [];
  const lines = text.split("\n");
  if (lines.length && lines[lines.length - 1] === "") lines.pop();
  return lines;
}

function lineMatchesLevel(line, levels) {
  if (!levels.length) return true;
  return levels.some((lv) => LEVEL_RE[lv] && LEVEL_RE[lv].test(line));
}

function lineMatchesQuery(line, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  return line.toLowerCase().includes(q);
}

/**
 * Filter log lines; returns original indices to preserve line numbers in the view.
 * @param {string[]} lines
 * @param {{ query?: string, levels?: LogLevelChip[] }} [options]
 */
export function filterLogLines(lines, options = {}) {
  const query = String(options.query || "").trim();
  const levels = options.levels || [];
  const indices = [];
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (!lineMatchesQuery(line, query)) continue;
    if (!lineMatchesLevel(line, levels)) continue;
    indices.push(i);
  }
  return {
    indices,
    total: lines.length,
    matched: indices.length,
  };
}

/** Format filtered lines with original 1-based line numbers. */
export function formatFilteredLogLines(lines, indices) {
  const width = String(Math.max(lines.length, 1)).length;
  return indices
    .map((i) => {
      const n = String(i + 1).padStart(width, " ");
      return `${n} | ${lines[i] ?? ""}`;
    })
    .join("\n");
}
