import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  buildDiagnosticSnapshot,
  DIAGNOSTIC_SNAPSHOT_FORMAT,
  verifyDiagnosticSnapshot,
} from "../src/diagnostic-snapshot.js";

const fixture = JSON.parse(
  await readFile(
    new URL("../../evals/operational-health.json", import.meta.url),
    "utf8",
  ),
);
const records = JSON.parse(
  await readFile(
    new URL("../../data/context-records.json", import.meta.url),
    "utf8",
  ),
);

test("builds a portable snapshot with only decision evidence", () => {
  const snapshot = buildDiagnosticSnapshot(fixture.scenario, records);

  assert.equal(snapshot.format, DIAGNOSTIC_SNAPSHOT_FORMAT);
  assert.equal(snapshot.assessment.governedVerdict, "attention");
  assert.deepEqual(
    snapshot.records.map((record) => record.id).sort(),
    [
      "fleet-health-rollup",
      "morning-brief-receipt",
      "research-watch-receipt",
      "site-refresh-receipt",
    ],
  );
});

test("snapshot generation is deterministic", () => {
  assert.deepEqual(
    buildDiagnosticSnapshot(fixture.scenario, records),
    buildDiagnosticSnapshot(fixture.scenario, records),
  );
});

test("rejects an asserted assessment that its evidence does not support", () => {
  const snapshot = buildDiagnosticSnapshot(fixture.scenario, records);
  assert.throws(
    () =>
      verifyDiagnosticSnapshot({
        ...snapshot,
        records: [],
        assessment: {
          ...snapshot.assessment,
          governedVerdict: "healthy",
        },
      }),
    /Operational evidence record .* was not found/,
  );
});

test("rejects unknown lane states before rendering", () => {
  const snapshot = buildDiagnosticSnapshot(fixture.scenario, records);
  assert.throws(
    () =>
      verifyDiagnosticSnapshot({
        ...snapshot,
        assessment: {
          ...snapshot.assessment,
          laneAssessments: snapshot.assessment.laneAssessments.map(
            (lane, index) =>
              index === 0
                ? { ...lane, state: "totally-made-up-state" }
                : lane,
          ),
        },
      }),
    /Invalid option/,
  );
});

test("rejects duplicate record IDs before rendering", () => {
  const snapshot = buildDiagnosticSnapshot(fixture.scenario, records);
  assert.throws(
    () =>
      verifyDiagnosticSnapshot({
        ...snapshot,
        records: [...snapshot.records, snapshot.records[0]],
      }),
    /Duplicate record ID/,
  );
});
