import assert from "node:assert/strict";
import test from "node:test";

import type { ContextRecord } from "../src/context.js";
import {
  handleExplainSource,
  handleInspectIngestion,
  handleSearch,
  handleValidate,
} from "../src/tool-handlers.js";

const record: ContextRecord = {
  id: "handoff",
  title: "Incident handoff",
  summary: "Current incident handoff.",
  content: "Support owns customer communication.",
  tags: ["incident"],
  owner: "Operations",
  updatedAt: "2026-07-20T12:00:00Z",
  validUntil: "2026-08-20T12:00:00Z",
  sources: [
    {
      id: "policy",
      label: "Policy",
      url: "https://example.invalid/policy",
      observedAt: "2026-07-20T12:00:00Z",
    },
  ],
  claims: [
    {
      text: "Support owns customer communication.",
      sourceIds: ["policy"],
    },
  ],
};

test("search handler returns a stable result envelope", () => {
  const response = handleSearch([record], {
    query: "incident",
    asOf: "2026-07-28T12:00:00Z",
  });
  assert.equal(response.ok, true);
  assert.equal(response.result.matches[0]?.id, "handoff");
});

test("explain handler marks missing evidence as unsuccessful", () => {
  const response = handleExplainSource([record], {
    recordId: "handoff",
    sourceId: "missing",
  });
  assert.equal(response.ok, false);
});

test("validate handler rejects an invalid asOf value", () => {
  assert.throws(
    () => handleValidate({ record, asOf: "not-a-date" }),
    /Invalid asOf timestamp/,
  );
});

test("ingestion handler returns the receipt for a record", () => {
  const response = handleInspectIngestion(
    [
      {
        recordId: "handoff",
        documentPath: "fixtures/source-docs/handoff.md",
        contentSha256: "a".repeat(64),
        byteLength: 100,
        declaredSourceIds: ["policy"],
        recordUpdatedAt: "2026-07-20T12:00:00Z",
      },
    ],
    { recordId: "handoff" },
  );
  assert.equal(response.ok, true);
  assert.equal(
    response.result.found && response.result.receipt.documentPath,
    "fixtures/source-docs/handoff.md",
  );
});
