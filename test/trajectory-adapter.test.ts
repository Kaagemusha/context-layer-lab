import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { adaptTrajectoryRuns } from "../src/trajectory-adapter.js";

const input = JSON.parse(
  await readFile(
    new URL(
      "../../examples/trajectory-adapter-input.json",
      import.meta.url,
    ),
    "utf8",
  ),
);

test("adapts trajectory-run-v1 records into a governed snapshot", () => {
  const snapshot = adaptTrajectoryRuns(input);

  assert.equal(snapshot.assessment.governedVerdict, "attention");
  assert.equal(snapshot.assessment.decisionPrevented, true);
  assert.equal(snapshot.records.length, 3);
  assert.deepEqual(
    snapshot.assessment.laneAssessments.map((lane) => [
      lane.id,
      lane.outcome,
      lane.state,
    ]),
    [
      ["brief", "success", "healthy"],
      ["site", "preserved_local", "attention"],
    ],
  );
});

test("rejects runs that reference an undeclared lane", () => {
  assert.throws(
    () =>
      adaptTrajectoryRuns({
        ...input,
        runs: [
          {
            ...input.runs[0],
            task: { ...input.runs[0].task, lane: "missing" },
          },
        ],
      }),
    /references unknown lane/,
  );
});

test("rejects duplicate run IDs", () => {
  assert.throws(
    () =>
      adaptTrajectoryRuns({
        ...input,
        runs: [input.runs[0], input.runs[0]],
      }),
    /unique run IDs/,
  );
});
