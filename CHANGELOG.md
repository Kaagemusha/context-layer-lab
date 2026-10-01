# Changelog

## Unreleased

**Console redesign.** The public console now matches antoine.nutu.net: dark
theme, the card's own words, a replayable public scenario with the answer
computed in your browser, four checks that lead with job outcomes, a
fail-closed tamper demo, and working search suggestions. No runtime, sample,
or eval change.

## 1.2.0 (2026-10-01)

First release in this repository's current history. Earlier releases are
summarized below.

- **Neutral sample names.** The synthetic sample's lanes and failure reason
  have neutral names. The packet format (`context-layer-diagnostic/v2`) and
  the reconciliation rules are unchanged; the sample's bytes and digests
  changed.
- **Run record version.** Run records passed to `npm run adapt:trajectory`
  now declare `schema_version: "run-record/v1"`.
- 17/17 evals pass.

## Earlier releases

- **1.1.0 (2026-09-27).** Search orders results by validation state, then
  BM25F score, then title and record ID, so an expired record no longer
  outranks a current one. Same-lane receipt ties are rejected even when
  written with different UTC offsets. `docs/eval-report.md` reports the same
  breakdown as the README, and `npm run check` builds once and fails on a
  stale report. Added `npm run demo`, the knowledge-base example in
  `docs/how-to-adopt.md`, an optional `retention` block for the monthly
  snapshot age check, and a public-safety check that rejects em-dashes.
- **1.0.0 (2026-09-03).** Restructured the README and moved the reference
  material into `docs/architecture.md`. Added the generated eval report with
  the naive, recency-only, and governed contrast, six ADRs,
  `docs/how-to-adopt.md`, contributing and citation files, issue templates,
  and a regression test showing that reconciliation has no implicit
  freshness-window cutoff.
- **Before 1.0.0 (July and August 2026).** Deterministic Markdown ingestion
  receipts, the stale operational context scenario, bounded BM25F retrieval,
  the local-first console that verifies its own evidence, the evidence-bound
  `context-layer-diagnostic/v2` packet, operational invariant tests, and the
  public-safety release gate.
