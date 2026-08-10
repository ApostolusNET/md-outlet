/**
 * Smoke checks for locale catalogs and t().
 */
import assert from "node:assert/strict";
import {
  DEFAULT_LANG,
  clearLocaleCache,
  normalizeLang,
  t,
} from "../src/i18n.js";
import { createUiMsg, MAX_UI_TABS } from "../src/ui-messages.js";
import { listLibraryDocs } from "../src/library-docs.js";
import { existsSync } from "node:fs";

clearLocaleCache();

assert.equal(normalizeLang(undefined), "ja");
assert.equal(normalizeLang("en-US"), "en");
assert.equal(normalizeLang("ja-JP"), "ja");
assert.equal(normalizeLang("fr"), "ja");

assert.equal(t("ja", "header.guide"), "ガイド");
assert.equal(t("en", "header.guide"), "Guide");
assert.ok(t("en", "msg.tabFull", { max: MAX_UI_TABS }).includes(String(MAX_UI_TABS)));
assert.ok(t("en", "msg.tabFull", { max: MAX_UI_TABS }).toLowerCase().includes("tab"));

const jaMsg = createUiMsg("ja");
const enMsg = createUiMsg("en");
assert.ok(jaMsg.tabFull.includes("上限"));
assert.ok(enMsg.tabFull.toLowerCase().includes("tab"));
assert.equal(DEFAULT_LANG, "ja");

const libJa = listLibraryDocs("ja");
const libEn = listLibraryDocs("en");
assert.ok(libJa.some((x) => x.id === "start"));
assert.ok(libEn.some((x) => x.id === "start"));
const startJa = libJa.find((x) => x.id === "start")!;
const startEn = libEn.find((x) => x.id === "start")!;
assert.equal(startJa.label, "スタートガイド");
assert.equal(startEn.label, "Getting started");
assert.ok(existsSync(startJa.path));
assert.ok(existsSync(startEn.path));
assert.ok(startEn.path.endsWith("START.md"));
assert.ok(startJa.path.endsWith("START.ja.md"));

const sampleJa = libJa.find((x) => x.id === "sample")!;
const sampleEn = libEn.find((x) => x.id === "sample")!;
assert.ok(existsSync(sampleJa.path));
assert.ok(existsSync(sampleEn.path));
assert.ok(sampleEn.path.endsWith("sample.en.md"));

console.log("OK i18n smoke");
