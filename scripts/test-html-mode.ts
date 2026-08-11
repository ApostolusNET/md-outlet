import { loadProfile } from "../src/load-profile.js";
import { renderHtml } from "../src/render-html.js";
import {
  resolveHtmlMode,
  filterHtmlToken,
  isAllowedLayoutHtml,
  previewContentSecurityPolicy,
  previewCspMetaTag,
} from "../src/html-mode.js";
import type { Profile } from "../src/types.js";

let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (!ok) failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

check("true → breaks", resolveHtmlMode(true) === "breaks");
check("false → off", resolveHtmlMode(false) === "off");
check("raw → raw", resolveHtmlMode("raw") === "raw");
check("breaks → breaks", resolveHtmlMode("breaks") === "breaks");
check("off → off", resolveHtmlMode("off") === "off");

check(
  "allow page-break",
  isAllowedLayoutHtml('<div class="page-break"></div>')
);
check(
  "allow md-outlet-page-break + aria",
  isAllowedLayoutHtml(
    '<div class="md-outlet-page-break" aria-hidden="true"></div>'
  )
);
check(
  "allow keep-together open",
  isAllowedLayoutHtml('<div class="keep-together">')
);
check("allow close div", isAllowedLayoutHtml("</div>"));
check("deny script", !isAllowedLayoutHtml("<script>alert(1)</script>"));
check(
  "deny other div",
  !isAllowedLayoutHtml('<div class="evil" onclick="x">')
);

check(
  "breaks escapes script token",
  filterHtmlToken("<script>", "breaks").includes("&lt;script&gt;")
);
check(
  "breaks keeps page-break",
  filterHtmlToken('<div class="page-break"></div>\n', "breaks").includes(
    "page-break"
  )
);
check("raw keeps script", filterHtmlToken("<script>", "raw") === "<script>");
check(
  "off escapes page-break",
  filterHtmlToken('<div class="page-break"></div>', "off").includes("&lt;div")
);

{
  const strict = previewContentSecurityPolicy("breaks");
  check("csp breaks blocks script", /\bscript-src 'none'/.test(strict));
  check(
    "csp breaks allows inline style",
    /\bstyle-src 'unsafe-inline'/.test(strict)
  );
  const raw = previewContentSecurityPolicy("raw");
  check(
    "csp raw allows inline script",
    /\bscript-src 'unsafe-inline'/.test(raw) &&
      !/\bscript-src 'none'/.test(raw)
  );
  check(
    "csp meta tag present",
    previewCspMetaTag("breaks").includes(
      'http-equiv="Content-Security-Policy"'
    )
  );
}

const base = loadProfile("default");
const md = `# Title

<script>alert(1)</script>

<div class="page-break"></div>

<div class="keep-together">

Hello **world**

</div>
`;

function withAllow(
  p: Profile,
  allowHtml: Profile["markdown"]["allowHtml"]
): Profile {
  return {
    ...p,
    markdown: { ...p.markdown, allowHtml },
    breaks: { ...p.breaks, beforeHeadings: [] },
  };
}

{
  const { html } = renderHtml(md, withAllow(base, true));
  check("default true strips script tag", !html.includes("<script>"));
  check("default true keeps page-break", html.includes('class="page-break"'));
  check(
    "default true keeps keep-together",
    html.includes('class="keep-together"')
  );
  check(
    "default true keeps bold",
    html.includes("<strong>world</strong>") ||
      /<strong>world<\/strong>/.test(html)
  );
  check(
    "default true embeds csp meta",
    html.includes('http-equiv="Content-Security-Policy"') &&
      html.includes("script-src 'none'")
  );
}

{
  const { html } = renderHtml(md, withAllow(base, "raw"));
  check("raw keeps script", html.includes("<script>"));
  check("raw keeps page-break", html.includes('class="page-break"'));
  check(
    "raw embeds relaxed csp",
    html.includes("script-src 'unsafe-inline'") &&
      !/script-src 'none'/.test(html)
  );
}

{
  const { html } = renderHtml(md, withAllow(base, false));
  const body = html.split("<body")[1] ?? html;
  check(
    "off escapes page-break in body",
    !body.includes('<div class="page-break"') && body.includes("page-break")
  );
  check("off no live script", !body.includes("<script>alert"));
}

if (failed) {
  console.error(`${failed} html-mode case(s) failed.`);
  process.exit(1);
}
console.log("All html-mode cases passed.");
