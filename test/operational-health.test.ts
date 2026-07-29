import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assessOperationalHealth,
  assessmentsConflict,
  selectedEvidenceRecordIds,
} from "../src/operational-health.js";

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

test("detects a conflict when newer evidence clears earlier attention", () => {
  const result = assessOperationalHealth(
    {
      ...scenario.scenario,
      summary: { ...scenario.scenario.summary, verdict: "attention" },
      receipts: scenario.scenario.receipts.map(
        (receipt: { outcome: string }) => ({ ...receipt, outcome: "success" }),
      ),
    },
    records,
  );

  assert.equal(result.naiveVerdict, "attention");
  assert.equal(result.governedVerdict, "healthy");
  assert.equal(assessmentsConflict(result), true);
});

test("selects only evidence records used by lane assessments", () => {
  const result = assessOperationalHealth(
    {
      ...scenario.scenario,
      receipts: [
        {
          recordId: "legacy-vendor-review",
          laneId: "site-refresh",
          observedAt: "2026-07-28T07:40:00Z",
          outcome: "success",
        },
        ...scenario.scenario.receipts,
      ],
    },
    records,
  );

  assert.equal(result.evidenceQuality["legacy-vendor-review"]?.state, "degraded");
  assert.equal(
    selectedEvidenceRecordIds(result).includes("legacy-vendor-review"),
    false,
  );
  assert.equal(
    selectedEvidenceRecordIds(result).includes("site-refresh-receipt"),
    true,
  );
});
