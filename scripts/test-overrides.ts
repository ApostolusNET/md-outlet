import { loadProfile } from "../src/load-profile.js";
import { applyOverrides } from "../src/apply-overrides.js";

let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (!ok) failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const base = loadProfile("default");

{
  const p = applyOverrides(base, { orientation: "landscape", format: "A3" });
  check("orientation landscape", p.page.orientation === "landscape");
  check("format A3", p.page.format === "A3");
  check("base untouched", base.page.orientation === "portrait");
}

{
  const p = applyOverrides(base, { marginAll: "12mm" });
  check(
    "margin all",
    p.page.margin.top === "12mm" &&
      p.page.margin.right === "12mm" &&
      p.page.margin.bottom === "12mm" &&
      p.page.margin.left === "12mm"
  );
}

{
  const p = applyOverrides(base, {
    marginAll: "10mm",
    marginTop: "30mm",
  });
  check("margin-top overrides all", p.page.margin.top === "30mm");
  check("other margins from all", p.page.margin.left === "10mm");
}

{
  const p = applyOverrides(base, { scale: 0.85 });
  check("scale", p.page.scale === 0.85);
}

{
  let threw = false;
  try {
    applyOverrides(base, { marginAll: "wide" });
  } catch {
    threw = true;
  }
  check("rejects bad margin", threw);
}

if (failed > 0) {
  console.error(`${failed} override case(s) failed.`);
  process.exit(1);
}
console.log("All override cases passed.");
