# 5. Deterministic, content-hashed ingestion receipts

## Status

Accepted.

## Context

An ingestion receipt that records "ingested at 14:32:07 on this run" is
useless for verifying anything, because it changes every time the pipeline
runs even when nothing about the source content did. Two people ingesting
the same Markdown fixture on different days would get different receipts for
identical output, so "does this receipt match what's actually checked in"
can't be answered by comparing receipts. It can only be answered by re-running the pipeline
and hoping.

## Decision

`IngestionReceipt` (`src/ingest.ts`) records the source-relative path, the
byte length of the parsed content, and a content hash. It never records a wall-clock
ingestion timestamp. `npm run ingest:check` regenerates records and receipts
from the canonical Markdown sources in `fixtures/source-docs` and diffs the
result against what's checked into `data/context-records.json` and
`data/ingestion-receipts.json`; CI fails on drift.

## Consequences

- The same source content always produces the same receipt, on any machine,
  on any day. Receipts are comparable and diffable in code review the same
  way source diffs are.
- `npm run ingest:check` catches "someone hand-edited the generated JSON" as
  reliably as it catches "the fixture changed but the generated output
  wasn't regenerated". Both show up as the same drift.
- This means ingestion receipts cannot answer "when was this actually
  ingested". That is a deliberate non-goal. If a deployment needs a real
  ingestion audit trail, that's a separate, additional log, not something to
  retrofit onto these receipts.
