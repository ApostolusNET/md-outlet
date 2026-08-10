import { resolveDocument } from "../src/resolve-document.js";
import { splitFrontMatter, extractMdOutletBlock } from "../src/front-matter.js";

let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (!ok) failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

{
  const md = `---
title: ignored
md-outlet:
  extends: ops-manual
  page:
    orientation: landscape
    margin: { top: 12mm }
---

# Hello

body text
`;
  const { body, hasFrontMatter } = splitFrontMatter(md);
  check("has front matter", hasFrontMatter);
  check(
    "body stripped",
    body.trimStart().startsWith("# Hello") && !body.includes("md-outlet:")
  );
  check("title not in body", !body.includes("title:"));

  const block = extractMdOutletBlock(splitFrontMatter(md).data);
  check("block extracted", Boolean(block?.extends));

  const resolved = resolveDocument({
    markdown: md,
    profileRef: "default",
    profileExplicit: false,
  });
  check("base from extends", resolved.baseProfile === "ops-manual");
  check("orientation merged", resolved.profile.page.orientation === "landscape");
  check("margin top merged", resolved.profile.page.margin.top === "12mm");
  check(
    "ops breaks kept",
    resolved.profile.breaks.beforeHeadings.includes("h1")
  );
  check("usedFrontMatter", resolved.usedFrontMatter);
  check("body for render", resolved.body.includes("# Hello"));
}

{
  const md = `---
md-outlet:
  extends: ops-manual
  page:
    orientation: landscape
---

# X
`;
  const resolved = resolveDocument({
    markdown: md,
    profileRef: "default",
    profileExplicit: true,
    overrides: { orientation: "portrait" },
  });
  check(
    "explicit --profile wins extends",
    resolved.baseProfile === "default",
    resolved.baseProfile
  );
  check("CLI override wins FM", resolved.profile.page.orientation === "portrait");
}

{
  const md = `# No FM\n\nplain`;
  const resolved = resolveDocument({
    markdown: md,
    profileRef: "default",
  });
  check("no FM", !resolved.usedFrontMatter);
  check("body intact", resolved.body.startsWith("# No FM"));
}

{
  let threw = false;
  try {
    extractMdOutletBlock({ "md-outlet": [1, 2] });
  } catch {
    threw = true;
  }
  check("rejects non-object md-outlet", threw);
}

if (failed > 0) {
  console.error(`${failed} front-matter case(s) failed.`);
  process.exit(1);
}
console.log("All front-matter cases passed.");
