import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildDiagnosticSnapshot,
  DIAGNOSTIC_SNAPSHOT_FORMAT,
  verifyDiagnosticSnapshot,
} from "../src/diagnostic-snapshot.js";

test("public diagnostic snapshot API is stable", () => {
  assert.equal(DIAGNOSTIC_SNAPSHOT_FORMAT, "context-layer-diagnostic/v2");
  assert.equal(typeof buildDiagnosticSnapshot, "function");
  assert.equal(typeof verifyDiagnosticSnapshot, "function");

  const published = JSON.parse(
    readFileSync("docs/operational-health.json", "utf8"),
  );
  const verified = verifyDiagnosticSnapshot(published);
  assert.equal(verified.format, DIAGNOSTIC_SNAPSHOT_FORMAT);
});
