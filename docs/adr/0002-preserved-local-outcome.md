# 2. `PRESERVED_LOCAL` is its own operational outcome, not a success or a failure

## Status

Accepted.

## Context

Some runs produce output but never integrate it: a draft saved locally, a
retry queued but not confirmed, a partial result held back pending review.
Such a run is neither a clean success nor an outright failure. Forcing it into a
two-state `success`/`failed` outcome means picking one wrong answer: call it
success and an agent may treat unintegrated work as done; call it failure and
a human investigates a run that actually behaved correctly by holding back.

## Decision

`operationalOutcomeSchema` (`src/context.ts`) is a three-value enum:
`"success" | "failed" | "preserved_local"`. Lane reconciliation in
`assessOperationalHealth` (`src/operational-health.ts`) treats
`preserved_local` the same as `failed` for the purpose of deciding whether a
lane needs attention. Neither outcome, on its own, is grounds for a
`healthy` verdict. But the outcome value itself is preserved and surfaced
distinctly in `laneAssessments`, so a reviewer sees "this held its output
back" rather than a generic failure.

## Consequences

- A caller that only checks "did it fail" and ignores `preserved_local`
  would silently under-count attention-worthy lanes; the type system makes
  the third state impossible to omit from an exhaustive switch, but nothing
  stops sloppy string comparison from missing it, which is why the
  reconciler treats it as attention-worthy centrally rather than trusting
  every consumer to remember.
- This is a narrow, three-state model, not a general workflow-status engine.
  See [`docs/architecture.md`](../architecture.md#limits-and-next-tests).
  Extending it (a fourth outcome, a "held for review" state distinct from
  "preserved locally") means widening this enum deliberately, not layering a
  string tag on top of it.
