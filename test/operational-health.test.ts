import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  assessOperationalHealth,
  assessmentsConflict,
  selectedEvidenceRecordIds,
} from "../src/operational-health.js";
import type { OperationalAssertion } from "../src/context.js";

type FixtureClaim = {
  text: string;
  sourceIds: string[];
  operational?: OperationalAssertion;
};
type FixtureRecord = {
  id: string;
  claims: FixtureClaim[];
  sources: Array<{
    id: string;
    observedAt: string;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
};

const scenario = JSON.parse(
  await readFile(
    new URL("../../evals/operational-health.json", import.meta.url),
    "utf8",
  ),
);
const records: FixtureRecord[] = JSON.parse(
  await readFile(
    new URL("../../data/context-records.json", import.meta.url),
    "utf8",
  ),
);

function bindRecord(
  input: FixtureRecord[],
  recordId: string,
  operational: OperationalAssertion,
): FixtureRecord[] {
  const cloned = structuredClone(input);
  const record = cloned.find((candidate) => candidate.id === recordId);
  if (!record?.claims[0]) throw new Error(`Missing fixture record ${recordId}`);
  record.claims[0].operational = operational;
  const source = record.sources.find((candidate) =>
    record.claims[0]!.sourceIds.includes(candidate.id),
  );
  if (!source) throw new Error(`Missing fixture source for ${recordId}`);
  source.observedAt = operational.observedAt;
  return cloned;
}

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
              recordId: "unknown-lane-receipt",
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

test("rejects duplicate operational lane IDs", () => {
  assert.throws(
    () =>
      assessOperationalHealth(
        {
          ...scenario.scenario,
          lanes: [
            ...scenario.scenario.lanes,
            scenario.scenario.lanes[0],
          ],
        },
        records,
      ),
    /Duplicate lane ID/,
  );
});

test("rejects duplicate receipt record IDs", () => {
  assert.throws(
    () =>
      assessOperationalHealth(
        {
          ...scenario.scenario,
          receipts: [
            ...scenario.scenario.receipts,
            scenario.scenario.receipts[0],
          ],
        },
        records,
      ),
    /Duplicate receipt record ID/,
  );
});

test("rejects duplicate context record IDs", () => {
  assert.throws(
    () =>
      assessOperationalHealth(scenario.scenario, [
        ...records,
        records[0],
      ]),
    /Duplicate context record ID "fleet-health-rollup"/,
  );
});

test("scenario facts must match source-linked typed assertions", () => {
  const mismatches = [
    {
      label: "summary verdict",
      scenario: {
        ...scenario.scenario,
        summary: { ...scenario.scenario.summary, verdict: "attention" },
      },
    },
    {
      label: "receipt outcome",
      scenario: {
        ...scenario.scenario,
        receipts: scenario.scenario.receipts.map(
          (receipt: { recordId: string }) =>
            receipt.recordId === "site-refresh-receipt"
              ? { ...receipt, outcome: "success" }
              : receipt,
        ),
      },
    },
    {
      label: "receipt lane",
      scenario: {
        ...scenario.scenario,
        receipts: scenario.scenario.receipts.map(
          (receipt: { recordId: string }) =>
            receipt.recordId === "morning-brief-receipt"
              ? { ...receipt, laneId: "site-refresh" }
              : receipt,
        ),
      },
    },
    {
      label: "receipt observation time",
      scenario: {
        ...scenario.scenario,
        receipts: scenario.scenario.receipts.map(
          (receipt: { recordId: string }) =>
            receipt.recordId === "morning-brief-receipt"
              ? { ...receipt, observedAt: "2026-07-28T08:03:00Z" }
              : receipt,
        ),
      },
    },
    {
      label: "lane due time",
      scenario: {
        ...scenario.scenario,
        lanes: scenario.scenario.lanes.map((lane: { id: string }) =>
          lane.id === "site-refresh"
            ? { ...lane, dueAt: "2026-07-28T10:00:00Z" }
            : lane,
        ),
      },
    },
    {
      label: "lane coverage",
      scenario: {
        ...scenario.scenario,
        lanes: scenario.scenario.lanes.filter(
          (lane: { id: string }) => lane.id !== "site-refresh",
        ),
        receipts: scenario.scenario.receipts.filter(
          (receipt: { laneId: string }) => receipt.laneId !== "site-refresh",
        ),
      },
    },
  ];

  for (const mismatch of mismatches) {
    assert.throws(
      () => assessOperationalHealth(mismatch.scenario, records),
      /does not match its typed operational assertion/,
      mismatch.label,
    );
  }
});

test("typed assertions must retain their source observation time", () => {
  const shiftedScenario = structuredClone(scenario.scenario);
  const shiftedReceipt = shiftedScenario.receipts.find(
    (receipt: { recordId: string }) =>
      receipt.recordId === "morning-brief-receipt",
  );
  if (!shiftedReceipt) throw new Error("Fixture receipt missing");
  shiftedReceipt.observedAt = "2026-07-28T08:03:00Z";

  const shiftedRecords = structuredClone(records);
  const shiftedRecord = shiftedRecords.find(
    (record) => record.id === "morning-brief-receipt",
  );
  const shiftedAssertion = shiftedRecord?.claims[0]?.operational;
  if (!shiftedAssertion || shiftedAssertion.kind !== "receipt") {
    throw new Error("Fixture assertion missing");
  }
  shiftedAssertion.observedAt = shiftedReceipt.observedAt;

  assert.throws(
    () => assessOperationalHealth(shiftedScenario, shiftedRecords),
    /must identify a declared source observed at 2026-07-28T08:03:00Z/,
  );
});

test("operational evidence requires exactly one typed assertion", () => {
  const unbound = structuredClone(records);
  const unboundRecord = unbound.find(
    (record) => record.id === "morning-brief-receipt",
  );
  if (!unboundRecord?.claims[0]) throw new Error("Fixture record missing");
  delete unboundRecord.claims[0].operational;
  assert.throws(
    () => assessOperationalHealth(scenario.scenario, unbound),
    /must contain exactly one typed operational assertion/,
  );

  const ambiguous = structuredClone(records);
  const ambiguousRecord = ambiguous.find(
    (record) => record.id === "morning-brief-receipt",
  );
  if (!ambiguousRecord?.claims[0]) throw new Error("Fixture record missing");
  ambiguousRecord.claims.push({
    ...ambiguousRecord.claims[0],
    text: "Duplicate operational assertion.",
  });
  assert.throws(
    () => assessOperationalHealth(scenario.scenario, ambiguous),
    /must contain exactly one typed operational assertion/,
  );
});

test("detects a conflict when newer evidence clears earlier attention", () => {
  const clearedScenario = {
    ...scenario.scenario,
    summary: { ...scenario.scenario.summary, verdict: "attention" },
    receipts: scenario.scenario.receipts.map(
      (receipt: { outcome: string }) => ({ ...receipt, outcome: "success" }),
    ),
  };
  let reboundRecords = bindRecord(records, clearedScenario.summary.recordId, {
    kind: "summary",
    observedAt: clearedScenario.summary.observedAt,
    verdict: "attention",
    lanes: clearedScenario.lanes,
  });
  for (const receipt of clearedScenario.receipts) {
    reboundRecords = bindRecord(reboundRecords, receipt.recordId, {
      kind: "receipt",
      laneId: receipt.laneId,
      observedAt: receipt.observedAt,
      outcome: "success",
    });
  }
  const result = assessOperationalHealth(
    clearedScenario,
    reboundRecords,
  );

  assert.equal(result.naiveVerdict, "attention");
  assert.equal(result.governedVerdict, "healthy");
  assert.equal(assessmentsConflict(result), true);
});

test("selects only evidence records used by lane assessments", () => {
  const reboundRecords = bindRecord(records, "legacy-vendor-review", {
    kind: "receipt",
    laneId: "site-refresh",
    observedAt: "2026-07-28T07:40:00Z",
    outcome: "success",
  });
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
    reboundRecords,
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
