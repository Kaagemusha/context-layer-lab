# 6. Consumers recompute the assessment; they never trust an embedded one

## Status

Accepted.

## Context

A portable diagnostic snapshot bundles a scenario, its evidence records, and
a computed assessment (verdict, per-lane state) so a downstream consumer
doesn't have to re-derive anything. That convenience is also the exact
failure this lab exists to prevent one layer up: if a consumer trusts the
embedded assessment at face value, a snapshot with a tampered or simply
stale `assessment` block would be believed regardless of what its own
`scenario` and `records` actually support. That is the same naive-trust problem the
lab's headline scenario demonstrates, reintroduced at the file-format level.

## Decision

`verifyDiagnosticSnapshot()` (`src/diagnostic-snapshot.ts`) always calls
`assessOperationalHealth(snapshot.scenario, snapshot.records)` itself and
compares the freshly computed result against the snapshot's embedded
`assessment` field, byte for byte, via the same canonical-JSON comparison
used elsewhere in the system. Any mismatch (an edited verdict, a
stale-carried-forward lane state, anything) is rejected outright:
"Snapshot assessment does not match its scenario and evidence records." The
embedded assessment is a convenience for a reader who trusts the producer;
it is never the thing that gets trusted programmatically.

## Consequences

- A tampered or drifted snapshot fails closed at load time, not at whatever
  later point something acts on its stale verdict.
- This makes the embedded `assessment` field strictly redundant from a
  security standpoint. A consumer could theoretically drop it and always
  recompute. It's kept because a portable snapshot that requires re-deriving
  everything to be even human-readable defeats the point of being portable;
  the field is retained for legibility, not trusted for correctness.
- A `context-layer-diagnostic/v1` snapshot is rejected outright rather than
  silently upgraded, because v1 cannot prove the evidence binding v2
  requires (see [`docs/architecture.md`](../architecture.md#data-contract)).
  "Reject and ask for regeneration" is the same fail-closed instinct as the
  assessment recomputation above, applied to format version instead of
  content.
