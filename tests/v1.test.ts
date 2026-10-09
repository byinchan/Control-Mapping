import { test } from "node:test";
import assert from "node:assert/strict";
import v1 from "../data/v1-controls.json" with { type: "json" };
import { ID_INDEX } from "../lib/catalog/catalogs.ts";
import { FRAMEWORK_IDS } from "../lib/catalog/types.ts";
import { validateV1Ids } from "../lib/catalog/validate.ts";
import { parseV1Cell } from "../lib/catalog/v1.ts";

test("v1 sample has the 14 controls C001-C014 in order", () => {
  assert.deepEqual(
    v1.controls.map((c) => c.id),
    Array.from({ length: 14 }, (_, i) => `C${String(i + 1).padStart(3, "0")}`),
  );
});

test("parsing each raw v1 cell matches the stored parse (independently transcribed)", () => {
  for (const control of v1.controls) {
    for (const framework of FRAMEWORK_IDS) {
      const cell = control.frameworks[framework];
      assert.deepEqual(parseV1Cell(framework, cell.raw), cell.parsed, `${control.id} ${framework}`);
    }
  }
});

test("every v1 ID is in the reference catalogs", () => {
  assert.deepEqual(validateV1Ids(ID_INDEX, v1), []);
});

test("parseV1Cell handles the real v1 formatting quirks", () => {
  assert.deepEqual(parseV1Cell("cis-v8.1", "7.3 -7.6"), { kind: "ids", ids: ["7.3", "7.4", "7.5", "7.6"] });
  assert.deepEqual(parseV1Cell("cis-v8.1", "15.1- 15.7"), {
    kind: "ids",
    ids: ["15.1", "15.2", "15.3", "15.4", "15.5", "15.6", "15.7"],
  });
  assert.deepEqual(parseV1Cell("cis-v8.1", "8.1–8.2, 13.1, 13.9–13.10"), {
    kind: "ids",
    ids: ["8.1", "8.2", "13.1", "13.9", "13.10"],
  });
  assert.deepEqual(parseV1Cell("soc2-tsc-2017", "CC1.4, CC5.3, "), { kind: "ids", ids: ["CC1.4", "CC5.3"] });
  assert.deepEqual(parseV1Cell("soc2-tsc-2017", "CC6.1 , CC6.2"), { kind: "ids", ids: ["CC6.1", "CC6.2"] });
  // NIST IDs contain a hyphen and must not be read as ranges.
  assert.deepEqual(parseV1Cell("nist-csf-2.0", "GV.RM-03, GV.RM-01"), { kind: "ids", ids: ["GV.RM-03", "GV.RM-01"] });
});

test("parseV1Cell keeps the analyst's N/A reason", () => {
  assert.deepEqual(parseV1Cell("cis-v8.1", "N/A  (Outside CIS Scope)"), { kind: "na", reason: "Outside CIS Scope" });
  assert.deepEqual(parseV1Cell("iso-27001-2022", "N/A  (see ISO 42001)"), { kind: "na", reason: "see ISO 42001" });
  assert.deepEqual(parseV1Cell("soc2-tsc-2017", "N/A - Out of Scope"), { kind: "na", reason: "Out of Scope" });
});

test("parseV1Cell rejects bad input instead of guessing", () => {
  assert.throws(() => parseV1Cell("cis-v8.1", "7.6-7.3"), /Invalid CIS range/);
  assert.throws(() => parseV1Cell("cis-v8.1", "7.1-8.2"), /Invalid CIS range/);
  assert.throws(() => parseV1Cell("cis-v8.1", "N/A"), /without a reason/);
  assert.throws(() => parseV1Cell("soc2-tsc-2017", " , "), /Empty cell/);
});
