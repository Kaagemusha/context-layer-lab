# 4. Typed operational assertions bound to a source, not prose

## Status

Accepted.

## Context

A claim like "the docs build failed" is easy for a human to write and easy
for a reconciler to get wrong: is "failed" this claim's actual structured
outcome, or just the word the author happened to type? If the only
machine-readable signal is prose, deciding whether a scenario's stated
outcome actually matches its evidence means either trusting the prose
verbatim (the exact naive-trust failure this lab exists to prevent) or
building a second system to infer structure from text. That just moves the
same-word-different-meaning problem one layer down instead of solving it.

## Decision

A claim's `operational` field (`operationalAssertionSchema` in
`src/context.ts`) is a typed, discriminated union: `{kind: "summary",
observedAt, verdict, lanes}` or `{kind: "receipt", laneId, observedAt,
outcome}`. It is completely separate from the claim's human-readable `text`.
`assertOperationalBinding()` in `src/operational-health.ts` requires that
this typed assertion identify a declared source observed at the assertion's
own `observedAt`, and that a scenario's stated summary or receipt content
match the typed assertion on every field, not just approximately. A mismatch,
where the scenario says one outcome and the record's typed assertion says
another, is rejected outright as a data-integrity error, not silently resolved in
either direction.

## Consequences

- Reconciliation reads only the typed fields; `text` remains
  human-readable explanation that a reviewer can read alongside the decision,
  never an input to it. See
  [`docs/architecture.md`](../architecture.md#data-contract), "the typed
  assertion is authoritative."
- This lab does not attempt to verify that free-text claim prose is
  semantically consistent with its own typed assertion. An author could
  still write misleading `text` next to an accurate typed assertion. Typed
  binding closes the machine-trust gap, not the editorial one.
- Every record carrying an operational assertion needs a source at the exact
  observation time the assertion claims. This is strict by design: a
  claim that "the run failed at 09:00" with no source dated 09:00 fails
  validation rather than being accepted on the strength of a source dated
  some other time.
