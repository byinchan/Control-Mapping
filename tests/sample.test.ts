import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import corrections from "../data/sample-corrections.json" with { type: "json" };
import v1 from "../data/v1-controls.json" with { type: "json" };
import { ID_INDEX } from "../lib/catalog/catalogs.ts";
import { isValidId } from "../lib/catalog/ids.ts";
import { FRAMEWORK_IDS } from "../lib/catalog/types.ts";
import { applySampleCorrections, type SampleCorrection, type V1Control } from "../lib/sample.ts";

const v1Controls = v1.controls as V1Control[];
const fixes = corrections.corrections as SampleCorrection[];

test("the four approved corrections are applied to the sample", () => {
  const sample = applySampleCorrections(v1Controls, fixes);
  const ids = (c: string, f: (typeof FRAMEWORK_IDS)[number]) => {
    const cell = sample.find((x) => x.id === c)!.frameworks[f];
    return cell.kind === "ids" ? cell.ids : null;
  };
  assert.deepEqual(ids("C002", "nist-csf-2.0"), ["ID.RA-01"]);
  assert.deepEqual(ids("C006", "soc2-tsc-2017"), ["CC9.2"]);
  assert.deepEqual(ids("C012", "soc2-tsc-2017"), ["CC7.2"]);
  assert.deepEqual(ids("C013", "soc2-tsc-2017"), ["CC6.8"]);
  assert.deepEqual(sample.find((x) => x.id === "C006")!.frameworks["soc2-tsc-2017"], {
    kind: "ids",
    ids: ["CC9.2"],
    correctedFrom: ["P6.4", "P6.5"],
  });
  assert.deepEqual(
    sample.filter((c) => c.correctedFrameworks.length).map((c) => c.id),
    ["C002", "C006", "C012", "C013"],
  );
});

test("uncorrected cells are unchanged from the v1 transcription", () => {
  const sample = applySampleCorrections(v1Controls, fixes);
  for (const control of sample) {
    const original = v1Controls.find((c) => c.id === control.id)!;
    assert.equal(control.v1Status, original.v1Status);
    for (const f of FRAMEWORK_IDS) {
      if (!control.correctedFrameworks.includes(f)) assert.deepEqual(control.frameworks[f], original.frameworks[f].parsed);
    }
  }
});

test("every corrected ID is in the catalogs and every correction is documented", () => {
  for (const c of fixes) {
    for (const id of c.corrected) assert.ok(isValidId(ID_INDEX, c.framework, id), `${c.control} ${id}`);
    assert.ok(c.reason.trim() && c.approvedBy.trim() && /^\d{4}-\d{2}-\d{2}$/.test(c.approved));
  }
});

test("applying corrections does not mutate the v1 data, and the v1 transcription still holds the original IDs", () => {
  const before = JSON.stringify(v1Controls);
  applySampleCorrections(v1Controls, fixes);
  assert.equal(JSON.stringify(v1Controls), before);
  const onDisk = JSON.parse(readFileSync("data/v1-controls.json", "utf8"));
  const c006 = onDisk.controls.find((c: { id: string }) => c.id === "C006");
  assert.equal(c006.frameworks["soc2-tsc-2017"].raw, "P6.4, P6.5");
});

test("corrections that no longer match v1 are rejected", () => {
  const stale = [{ ...fixes[0], v1: ["PR.PS-02"] }];
  assert.throws(() => applySampleCorrections(v1Controls, stale), /does not match the v1 IDs/);
  assert.throws(() => applySampleCorrections(v1Controls, [fixes[0], fixes[0]]), /Duplicate correction/);
  assert.throws(() => applySampleCorrections(v1Controls, [{ ...fixes[0], control: "C999" }]), /unknown control/);
  assert.throws(() => applySampleCorrections(v1Controls, [{ ...fixes[0], corrected: [] }]), /no corrected IDs/);
});
