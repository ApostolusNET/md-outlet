import { resolve } from "node:path";
import { PKG_ROOT } from "../src/paths.js";
import {
  isOutsidePackage,
  needsOutsideWriteConfirm,
  trustDirsForActiveDoc,
} from "../src/path-policy.js";

let failed = 0;
function check(name: string, ok: boolean, detail?: string) {
  if (!ok) failed += 1;
  console.log(`${ok ? "OK  " : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

const inside = resolve(PKG_ROOT, "examples", "sample.md");
const outside = resolve(PKG_ROOT, "..", "outside-test.md");
const docsDir = resolve(PKG_ROOT, "..", "user-docs");
const docsMd = resolve(docsDir, "notes.md");
const docsPdf = resolve(docsDir, "notes.pdf");
const otherPdf = resolve(PKG_ROOT, "..", "other-folder", "x.pdf");

check("package file is inside", !isOutsidePackage(inside));
check("sibling outside package", isOutsidePackage(outside));
check("package root itself not outside", !isOutsidePackage(PKG_ROOT));

check(
  "pdf beside open doc skips confirm",
  !needsOutsideWriteConfirm(docsPdf, trustDirsForActiveDoc(docsMd))
);
check(
  "pdf in unrelated folder needs confirm",
  needsOutsideWriteConfirm(otherPdf, trustDirsForActiveDoc(docsMd))
);
check(
  "outside with no trust still needs confirm",
  needsOutsideWriteConfirm(docsPdf, [])
);
check(
  "inside package never needs confirm",
  !needsOutsideWriteConfirm(inside, [])
);

if (failed) {
  console.error(`${failed} path-policy case(s) failed.`);
  process.exit(1);
}
console.log("All path-policy cases passed.");
