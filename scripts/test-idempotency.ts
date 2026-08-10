import { injectPageBreaks } from "../src/inject-breaks.js";

const cases: {
  name: string;
  input: string;
  expectInjected: number;
}[] = [
  {
    name: "no existing break -> inject once (skipFirst)",
    input: "<h1>A</h1><p>x</p><h1>B</h1><p>y</p><h1>C</h1>",
    expectInjected: 2,
  },
  {
    name: "existing page-break class -> skip",
    input:
      '<h1>A</h1><div class="page-break"></div><h1>B</h1><p>y</p><h1>C</h1>',
    expectInjected: 1,
  },
  {
    name: "existing md-outlet-page-break -> skip",
    input:
      '<h1>A</h1><div class="md-outlet-page-break"></div><h1>B</h1><h1>C</h1>',
    expectInjected: 1,
  },
  {
    name: "all authored -> no injection",
    input:
      '<h1>A</h1><div class="page-break"></div><h1>B</h1><div class="page-break"></div><h1>C</h1>',
    expectInjected: 0,
  },
];

const breaks = {
  beforeHeadings: ["h1"] as const,
  skipFirst: true,
  avoidInside: [],
  avoidAfter: [],
};

let failed = 0;
for (const c of cases) {
  const out = injectPageBreaks(c.input, {
    ...breaks,
    beforeHeadings: ["h1"],
    avoidInside: [],
    avoidAfter: [],
  });
  const injected = (out.match(/md-outlet-page-break/g) ?? []).length -
    (c.input.match(/md-outlet-page-break/g) ?? []).length;
  const ok = injected === c.expectInjected;
  if (!ok) failed += 1;
  console.log(
    `${ok ? "OK  " : "FAIL"}  ${c.name}  (expected ${c.expectInjected}, got ${injected})`
  );
  if (!ok) {
    console.log("  input :", c.input);
    console.log("  output:", out);
  }
}

if (failed > 0) {
  console.error(`${failed} case(s) failed.`);
  process.exit(1);
}
console.log("All idempotency cases passed.");
