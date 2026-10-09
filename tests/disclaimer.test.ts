import { test } from "node:test";
import assert from "node:assert/strict";
import { DISCLAIMER } from "../lib/disclaimer.ts";

test("disclaimer matches the required verbatim text", () => {
  assert.equal(
    DISCLAIMER,
    "This is a workflow and governance prototype, not a commercial GRC platform or an enterprise-ready product.",
  );
});
