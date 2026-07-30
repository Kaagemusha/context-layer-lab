import assert from "node:assert/strict";
import test from "node:test";

import { adaptReliabilityRollup } from "../src/reliability-adapter.js";

const generatedAt = "2026-07-29T20:00:00.000Z";
const baseRollup = {
  generated_at: generatedAt,
  status: "GREEN",
  patrol: {
    file: "patrol-2026-07-29.md",
    state: "PARSED",
    timestamp: "2026-07-29T19:00:00.000Z",
    host: "host-a",
    actionable: 0,
    fresh: true,
  },
  heartbeats: [
    {
      loop_id: "personal-website-midnight-refresh",
      iso_timestamp: "2026-07-29T18:56:21.000Z",
      host: "host-a",
      outcome: "deployed",
      fresh: true,
    },
    {
      loop_id: "whitemore",
      iso_timestamp: "2026-07-29T01:05:56.000Z",
      host: "host-a",
      fresh: true,
    },
  ],
  reliability_issues: [
    {
      file: "historical.md",
      title: "Historical incident",
      description: "Retained for reference.",
    },
  ],
  status_reliability_issues: [],
};

test("maps a green vault rollup to healthy governed evidence", () => {
  const snapshot = adaptReliabilityRollup(
    baseRollup,
    "file:///private/vault",
  );

  assert.equal(snapshot.assessment.naiveVerdict, "healthy");
  assert.equal(snapshot.assessment.governedVerdict, "healthy");
  assert.deepEqual(
    snapshot.assessment.laneAssessments.map((lane) => [
      lane.id,
      lane.outcome,
      lane.state,
    ]),
    [
      ["host-patrol", "success", "healthy"],
      [
        "heartbeat-personal-website-midnight-refresh",
        "success",
        "healthy",
      ],
      ["heartbeat-whitemore", "success", "healthy"],
    ],
  );
});

test("does not promote a blocked heartbeat", () => {
  const snapshot = adaptReliabilityRollup(
    {
      ...baseRollup,
      status: "ATTENTION",
      heartbeats: [
        {
          ...baseRollup.heartbeats[0],
          outcome: "blocked",
        },
      ],
    },
    "file:///private/vault/",
  );

  assert.equal(snapshot.assessment.governedVerdict, "attention");
  assert.equal(
    snapshot.assessment.laneAssessments[1]?.outcome,
    "failed",
  );
});

test("historical reliability issues do not become current failures", () => {
  const snapshot = adaptReliabilityRollup(
    baseRollup,
    "https://example.invalid/vault",
  );

  assert.equal(
    snapshot.records.some((record) => record.id.includes("historical")),
    false,
  );
});

test("current status issues remain explicit failed evidence", () => {
  const issue = {
    file: "2026-07-29-current-failure.md",
    title: "Current failure",
    description: "A current lane is blocked.",
  };
  const snapshot = adaptReliabilityRollup(
    {
      ...baseRollup,
      status: "ATTENTION",
      status_reliability_issues: [issue],
    },
    "https://example.invalid/vault/",
  );

  const lane = snapshot.assessment.laneAssessments.find((entry) =>
    entry.id.startsWith("status-issue-"),
  );
  assert.equal(lane?.outcome, "failed");
  assert.equal(lane?.state, "attention");
});

test("missing current evidence fails closed", () => {
  const snapshot = adaptReliabilityRollup(
    {
      generated_at: generatedAt,
      status: "UNKNOWN",
      patrol: null,
      heartbeats: [],
      status_reliability_issues: [],
    },
    "https://example.invalid/vault/",
  );

  assert.equal(snapshot.assessment.governedVerdict, "attention");
  assert.equal(
    snapshot.assessment.laneAssessments[0]?.outcome,
    "preserved_local",
  );
});
