import assert from "node:assert/strict";
import test from "node:test";

import { adaptReliabilityRollup } from "../src/reliability-adapter.js";
import { buildOperatorBrief, renderOperatorBrief } from "../src/operator-brief.js";

const rollup = {
  generated_at: "2026-08-03T12:00:00.000Z",
  status: "GREEN",
  patrol: {
    file: "patrol-2026-08-03.md",
    state: "PARSED",
    timestamp: "2026-08-03T11:55:00.000Z",
    checked: 10,
    ok: 9,
    pending: 1,
    observed_pending_review: 0,
    actionable: 0,
    fresh: true,
  },
  heartbeats: [],
  status_reliability_issues: [],
};

test("renders a compact healthy brief with canonical coverage", () => {
  const snapshot = adaptReliabilityRollup(rollup, "file:///private/vault/");
  const brief = buildOperatorBrief(rollup, snapshot);
  const rendered = renderOperatorBrief(brief);

  assert.equal(brief.state, "HEALTHY");
  assert.equal(brief.change, "baseline");
  assert.match(rendered, /10\/10 accounted for; 9 verified, 1 pending/);
  assert.match(rendered, /Next: No action needed/);
  assert.equal(rendered.trim().split("\n").length, 6);
});

test("reports unchanged evidence against the previous snapshot", () => {
  const previous = adaptReliabilityRollup(rollup, "file:///private/vault/");
  const current = adaptReliabilityRollup(
    { ...rollup, generated_at: "2026-08-03T12:05:00.000Z" },
    "file:///private/vault/",
  );
  const brief = buildOperatorBrief(rollup, current, previous);

  assert.equal(brief.change, "unchanged");
});

test("unknown accounting cannot render healthy", () => {
  const incomplete = {
    ...rollup,
    patrol: { ...rollup.patrol, checked: 11 },
  };
  const snapshot = adaptReliabilityRollup(incomplete, "file:///private/vault/");
  const brief = buildOperatorBrief(incomplete, snapshot);

  assert.equal(brief.state, "UNKNOWN");
  assert.equal(brief.coverage.unknown, 1);
  assert.match(brief.nextAction, /Inspect host-patrol coverage/);
});

test("a real failing lane outranks unknown patrol coverage", () => {
  const mixed = {
    ...rollup,
    patrol: { ...rollup.patrol, checked: 11 },
    heartbeats: [
      {
        loop_id: "site-refresh",
        iso_timestamp: "2026-08-03T11:58:00.000Z",
        host: "host-a",
        outcome: "failed",
        fresh: true,
      },
    ],
  };
  const snapshot = adaptReliabilityRollup(mixed, "file:///private/vault/");
  const brief = buildOperatorBrief(mixed, snapshot);

  assert.equal(brief.state, "ATTENTION");
  assert.match(brief.nextAction, /site-refresh/);
});
