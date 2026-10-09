import { test } from "node:test";
import assert from "node:assert/strict";
import { CATALOGS, ID_INDEX, getCatalog } from "../lib/catalog/catalogs.ts";
import { isValidId, normalizeId, validateIds } from "../lib/catalog/ids.ts";
import { EXPECTED_COUNTS } from "../lib/catalog/rules.ts";
import { FRAMEWORK_IDS, type Catalog } from "../lib/catalog/types.ts";
import { validateCatalog } from "../lib/catalog/validate.ts";

const clone = (c: Catalog): Catalog => structuredClone(c);

test("every committed catalog passes validation with the expected count", () => {
  assert.equal(CATALOGS.length, 4);
  for (const framework of FRAMEWORK_IDS) {
    const catalog = getCatalog(framework);
    assert.deepEqual(validateCatalog(catalog, framework), []);
    assert.equal(catalog.items.length, EXPECTED_COUNTS[framework]);
  }
  assert.deepEqual(
    FRAMEWORK_IDS.map((f) => getCatalog(f).items.length),
    [106, 93, 153, 61],
  );
});

test("only NIST uses official text; copyrighted frameworks use own labels", () => {
  assert.equal(getCatalog("nist-csf-2.0").labelType, "official-text");
  for (const f of ["iso-27001-2022", "cis-v8.1", "soc2-tsc-2017"] as const) {
    assert.equal(getCatalog(f).labelType, "own-label");
  }
  assert.equal(getCatalog("cis-v8.1").license.url, "https://creativecommons.org/licenses/by-nc-nd/4.0/");
});

test("source metadata: confirmed download dates, no date where nothing was downloaded, no URL fragments", () => {
  assert.equal(getCatalog("nist-csf-2.0").source.retrieved, "2026-10-09");
  assert.equal(getCatalog("cis-v8.1").source.retrieved, "2026-08-03");
  assert.equal(getCatalog("soc2-tsc-2017").source.retrieved, "2026-08-03");
  assert.equal(getCatalog("iso-27001-2022").source.retrieved, null);
  for (const c of CATALOGS) assert.ok(!c.source.url.includes("#"), c.framework);
});

test("validator rejects a malformed retrieved date", () => {
  const c = clone(getCatalog("cis-v8.1"));
  c.source.retrieved = "Aug 2026";
  assert.ok(validateCatalog(c, "cis-v8.1").some((e) => e.includes("retrieved")));
});

test("validator rejects a duplicate id", () => {
  const c = clone(getCatalog("cis-v8.1"));
  c.items.push({ ...c.items[0] });
  assert.ok(validateCatalog(c, "cis-v8.1").some((e) => e.includes("duplicate id 1.1")));
});

test("validator rejects an id that is not in the framework's format", () => {
  const c = clone(getCatalog("iso-27001-2022"));
  c.items[0] = { ...c.items[0], id: "A.9.1" };
  assert.ok(validateCatalog(c, "iso-27001-2022").some((e) => e.includes("does not match")));
});

test("validator rejects a missing item and a wrong count", () => {
  const c = clone(getCatalog("soc2-tsc-2017"));
  c.items.pop();
  assert.ok(validateCatalog(c, "soc2-tsc-2017").some((e) => e.includes("expected 61")));
});

test("validator catches a missing CIS safeguard even when the count is padded", () => {
  const c = clone(getCatalog("cis-v8.1"));
  const i = c.items.findIndex((x) => x.id === "6.3");
  c.items[i] = { ...c.items[i], id: "6.9" };
  assert.ok(validateCatalog(c, "cis-v8.1").some((e) => e.includes("missing safeguard 6.3")));
});

test("validator rejects long own labels (guards against pasted framework text)", () => {
  const c = clone(getCatalog("soc2-tsc-2017"));
  c.items[0] = { ...c.items[0], label: "x".repeat(81) };
  assert.ok(validateCatalog(c, "soc2-tsc-2017").some((e) => e.includes("longer than 80")));
});

test("validator rejects unknown groups, wrong framework and non-objects", () => {
  const c = clone(getCatalog("nist-csf-2.0"));
  c.items[0] = { ...c.items[0], group: "XX.YY" };
  assert.ok(validateCatalog(c, "nist-csf-2.0").some((e) => e.includes("unknown group")));
  assert.ok(validateCatalog(getCatalog("nist-csf-2.0"), "cis-v8.1").length > 0);
  assert.deepEqual(validateCatalog(null, "cis-v8.1"), ["cis-v8.1: catalog is not an object"]);
});

test("normalizeId tidies spacing, dashes and case without inventing IDs", () => {
  assert.equal(normalizeId("nist-csf-2.0", " pr.aa–03 "), "PR.AA-03");
  assert.equal(normalizeId("nist-csf-2.0", "PR.AA-3"), "PR.AA-03");
  assert.equal(normalizeId("soc2-tsc-2017", "cc6.1 "), "CC6.1");
  assert.equal(normalizeId("iso-27001-2022", "a.5.15"), "A.5.15");
  assert.equal(normalizeId("cis-v8.1", " 13.10"), "13.10");
});

test("isValidId accepts catalog IDs only", () => {
  assert.ok(isValidId(ID_INDEX, "nist-csf-2.0", "GV.PO-02"));
  assert.ok(!isValidId(ID_INDEX, "nist-csf-2.0", "ID.AM-06")); // withdrawn in CSF 2.0
  assert.ok(isValidId(ID_INDEX, "soc2-tsc-2017", "P6.5"));
  assert.ok(!isValidId(ID_INDEX, "soc2-tsc-2017", "P6.0")); // category heading, not a criterion
  assert.ok(isValidId(ID_INDEX, "cis-v8.1", "18.5"));
  assert.ok(!isValidId(ID_INDEX, "cis-v8.1", "18.6"));
  assert.ok(isValidId(ID_INDEX, "iso-27001-2022", "A.8.34"));
  assert.ok(!isValidId(ID_INDEX, "iso-27001-2022", "A.8.35"));
  assert.ok(!isValidId(ID_INDEX, "iso-27001-2022", "PR.AA-03")); // wrong framework
});

test("validateIds keeps valid IDs, de-duplicates and reports what it dropped", () => {
  const result = validateIds(ID_INDEX, "cis-v8.1", ["6.3", "6.3 ", "6.9", "99.1", "6.4"]);
  assert.deepEqual(result.valid, ["6.3", "6.4"]);
  assert.deepEqual(result.dropped, ["6.9", "99.1"]);
});
