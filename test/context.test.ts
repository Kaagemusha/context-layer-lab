import assert from "node:assert/strict";
import test from "node:test";

import {
  explainSource,
  searchContext,
  validateRecord,
  type ContextRecord,
} from "../src/context.js";

const currentRecord: ContextRecord = {
  id: "launch",
  title: "Launch ownership",
  summary: "Current launch owners and rollback steps.",
  content: "Engineering owns rollback.",
  tags: ["launch", "operations"],
  owner: "Program Operations",
  updatedAt: "2026-07-20T12:00:00Z",
  validUntil: "2026-08-20T12:00:00Z",
  sources: [
    {
      id: "runbook",
      label: "Runbook",
      url: "https://example.invalid/runbook",
      observedAt: "2026-07-20T12:00:00Z",
    },
  ],
  claims: [{ text: "Engineering owns rollback.", sourceIds: ["runbook"] }],
};

const asOf = new Date("2026-07-28T12:00:00Z");

test("accepts a current record with supported claims", () => {
  const result = validateRecord(currentRecord, asOf);
  assert.equal(result.valid, true);
  assert.equal(result.state, "valid");
  assert.deepEqual(result.issues, []);
});

test("marks expired records as degraded rather than erasing them", () => {
  const result = validateRecord(
    { ...currentRecord, validUntil: "2026-07-01T12:00:00Z" },
    asOf,
  );
  assert.equal(result.valid, true);
  assert.equal(result.state, "degraded");
  assert.deepEqual(
    result.issues.map((issue) => issue.code),
    ["stale_record"],
  );
});

test("rejects claims that reference undeclared sources", () => {
  const result = validateRecord(
    {
      ...currentRecord,
      claims: [{ text: "Legal approved launch.", sourceIds: ["legal-note"] }],
    },
    asOf,
  );
  assert.equal(result.valid, false);
  assert.equal(result.state, "invalid");
  assert.equal(result.issues[0]?.code, "unsupported_claim");
});

test("rejects ambiguous duplicate source IDs", () => {
  const result = validateRecord(
    {
      ...currentRecord,
      sources: [
        currentRecord.sources[0],
        {
          ...currentRecord.sources[0],
          label: "Different document with the same identifier",
          url: "https://example.invalid/different-runbook",
        },
      ],
    },
    asOf,
  );

  assert.equal(result.valid, false);
  assert.equal(result.state, "invalid");
  assert.ok(
    result.issues.some(
      (issue) =>
        issue.code === "malformed_record" && issue.path === "sources.1.id",
    ),
  );
});

test("rejects malformed records with actionable paths", () => {
  const result = validateRecord({ id: "missing-fields" }, asOf);
  assert.equal(result.valid, false);
  assert.ok(result.issues.every((issue) => issue.code === "malformed_record"));
  assert.ok(result.issues.some((issue) => issue.path === "title"));
});

test("ranks title and tag matches above body-only matches", () => {
  const bodyMatch: ContextRecord = {
    ...currentRecord,
    id: "body",
    title: "General notes",
    summary: "Miscellaneous operational notes.",
    content: "A launch detail appears here.",
    tags: ["notes"],
  };
  const results = searchContext([bodyMatch, currentRecord], "launch", asOf);
  assert.deepEqual(
    results.map((result) => result.id),
    ["launch", "body"],
  );
  assert.ok((results[0]?.score ?? 0) > (results[1]?.score ?? 0));
});

test("returns quality flags with search results", () => {
  const results = searchContext(
    [{ ...currentRecord, validUntil: "2026-07-01T12:00:00Z" }],
    "launch",
    asOf,
  );
  assert.equal(results[0]?.state, "degraded");
  assert.equal(results[0]?.issues[0]?.code, "stale_record");
});

test("explains exactly which claims a source supports", () => {
  const result = explainSource([currentRecord], "launch", "runbook");
  assert.equal(result.found, true);
  if (result.found) {
    assert.deepEqual(result.supportedClaims, [
      "Engineering owns rollback.",
    ]);
  }
});

test("returns a bounded not-found result", () => {
  const result = explainSource([currentRecord], "launch", "missing");
  assert.deepEqual(result, {
    found: false,
    message: 'Source "missing" was not found on record "launch".',
  });
});
