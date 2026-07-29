import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { assessOperationalHealth } from "../src/operational-health.js";

const scenario = JSON.parse(
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

test("newer run receipts override a stale healthy summary", () => {
  const result = assessOperationalHealth(scenario.scenario, records);
  assert.equal(result.naiveVerdict, "healthy");
  assert.equal(result.governedVerdict, "attention");
  assert.equal(result.summaryStale, true);
  assert.equal(result.decisionPrevented, true);
  assert.deepEqual(
    result.laneAssessments
      .filter((lane) => lane.state === "attention")
      .map((lane) => lane.id),
    scenario.expected.attentionLaneIds,
  );
});

test("not-yet-due lanes do not create false failures", () => {
  const result = assessOperationalHealth(scenario.scenario, records);
  assert.deepEqual(
    result.laneAssessments
      .filter((lane) => lane.state === "not_due")
      .map((lane) => lane.id),
    scenario.expected.notDueLaneIds,
  );
});

test("missing evidence records fail closed", () => {
  assert.throws(
    () =>
      assessOperationalHealth(
        scenario.scenario,
        records.filter(
          (record: { id: string }) =>
            record.id !== scenario.scenario.summary.recordId,
        ),
      ),
    /Operational evidence record ".+" was not found/,
  );
});

test("degraded success evidence does not establish a healthy lane", () => {
  const degradedRecords = records.map((record: { id: string }) =>
    record.id === "morning-brief-receipt"
      ? { ...record, validUntil: "2026-07-28T08:30:00Z" }
      : record,
  );
  const result = assessOperationalHealth(scenario.scenario, degradedRecords);
  const morningBrief = result.laneAssessments.find(
    (lane) => lane.id === "morning-brief",
  );

  assert.equal(morningBrief?.outcome, "success");
  assert.equal(morningBrief?.state, "attention");
  assert.equal(
    result.evidenceQuality["morning-brief-receipt"]?.state,
    "degraded",
  );
});

test("unknown receipt lanes fail closed", () => {
  assert.throws(
    () =>
      assessOperationalHealth(
        {
          ...scenario.scenario,
          receipts: [
            ...scenario.scenario.receipts,
            {
              recordId: "morning-brief-receipt",
              laneId: "unknown-lane",
              observedAt: scenario.scenario.asOf,
              outcome: "success",
            },
          ],
        },
        records,
      ),
    /Receipt references unknown lane "unknown-lane"/,
  );
});
