# 1. Explicit `validUntil`, not inferred recency

## Status

Accepted.

## Context

"How fresh is this record" has an easy wrong answer: infer it from
`updatedAt` and a rule of thumb ("anything older than a week is stale"). That
rule of thumb is wrong for two reasons at once. Some facts are stable for
months (an owner's name) and some for minutes (a deployment's current
state). And the rule is invisible: nobody wrote it
down, so nobody can review or override it for a specific record.

## Decision

Every context record (`contextRecordSchema` in `src/context.ts`) carries an
explicit `validUntil` timestamp, set by whoever authored the record, not
computed from `updatedAt` by a heuristic. `validateRecord()` compares
`validUntil` against the caller-supplied `asOf` and raises a `stale_record`
warning when it has passed. It is not an error: a stale record is still
usable, just flagged. There is no fallback inference path: a record without an
explicit `validUntil` fails schema validation outright rather than getting a
guessed expiry.

## Consequences

- Freshness is a per-record editorial decision, not a platform-wide guess. A
  record about a deployment can declare a one-hour window; a record about an
  organization's name can declare a one-year window, on the same schema.
- This pushes real work onto whoever authors a record. They have to decide
  and state how long it stays trustworthy, instead of hiding that judgment
  call inside a retrieval ranking formula.
- `stale_record` is a warning, not a rejection: search results still surface
  a stale record with its quality state visible, ranked below current
  records, rather than letting it silently disappear and erase useful
  history. See "warnings travel with retrieval results" in
  [`docs/architecture.md`](../architecture.md#design-decisions).
