import assert from "node:assert/strict";
import test from "node:test";

import { ingestDocuments, type SourceDocument } from "../src/ingest.js";

function sourceDocument(
  sourcePath = "fixtures/source-docs/example.md",
): SourceDocument {
  return {
    sourcePath,
    content: `---
{
  "id": "example",
  "title": "Example record",
  "summary": "A synthetic record.",
  "tags": ["example"],
  "owner": "Operations",
  "updatedAt": "2026-07-20T12:00:00Z",
  "validUntil": "2026-08-20T12:00:00Z",
  "sources": [{
    "id": "source-1",
    "label": "Synthetic source",
    "url": "https://example.invalid/source",
    "observedAt": "2026-07-20T12:00:00Z"
  }],
  "claims": [{
    "text": "The record is synthetic.",
    "sourceIds": ["source-1"]
  }]
}
---
The body becomes the context record content.
`,
  };
}

test("ingests JSON-front-matter Markdown with a deterministic receipt", () => {
  const document = sourceDocument();
  const first = ingestDocuments([document]);
  const second = ingestDocuments([document]);

  assert.deepEqual(first, second);
  assert.equal(
    first.records[0]?.content,
    "The body becomes the context record content.",
  );
  assert.equal(first.receipts[0]?.documentPath, document.sourcePath);
  assert.match(first.receipts[0]?.contentSha256 ?? "", /^[a-f0-9]{64}$/);
  assert.equal(
    first.receipts[0]?.byteLength,
    Buffer.byteLength(document.content, "utf8"),
  );
});

test("changes the receipt when source content changes", () => {
  const document = sourceDocument();
  const changed = {
    ...document,
    content: document.content.replace("The body", "The revised body"),
  };

  const originalHash =
    ingestDocuments([document]).receipts[0]?.contentSha256;
  const changedHash =
    ingestDocuments([changed]).receipts[0]?.contentSha256;
  assert.notEqual(originalHash, changedHash);
});

test("rejects malformed front matter with the source path", () => {
  assert.throws(
    () =>
      ingestDocuments([
        {
          sourcePath: "fixtures/source-docs/broken.md",
          content: "---\nnot-json\n---\nBody",
        },
      ]),
    /fixtures\/source-docs\/broken\.md: invalid JSON front matter/,
  );
});

test("rejects duplicate record IDs across source documents", () => {
  assert.throws(
    () =>
      ingestDocuments([
        sourceDocument("fixtures/source-docs/one.md"),
        sourceDocument("fixtures/source-docs/two.md"),
      ]),
    /fixtures\/source-docs\/two\.md: duplicate record id "example"/,
  );
});

test("rejects claims that do not trace to a declared source", () => {
  const document = sourceDocument();
  assert.throws(
    () =>
      ingestDocuments([
        {
          ...document,
          content: document.content.replace(
            '"sourceIds": ["source-1"]',
            '"sourceIds": ["missing-source"]',
          ),
        },
      ]),
    /invalid claims\.0\.sourceIds: The claim references undeclared source "missing-source"/,
  );
});
