# Changelog

## 1.2.2 (2026-10-02)

**No console warning under the security policy.** Zod probed `eval` on load,
which the page's Content Security Policy blocks; the page still worked but
logged a violation on every visit. The browser bundle now runs Zod in jitless
mode, so it never makes the probe.

**Browser check.** `npm run check` now loads the console in headless Chrome at
320, 375 and 390 px, fails on horizontal overflow, and fails if the page
reports a Content Security Policy violation or an uncaught error.

**Counts that cannot drift.** A new check recounts the evals and
fails if the README badges state different numbers.

## 1.2.1 (2026-10-02)

**Console redesign.** The public console now matches antoine.nutu.net: dark
theme, the card's own words, a replayable public scenario with the answer
computed in your browser, four checks that lead with job outcomes, a
fail-closed tamper demo, and working search suggestions. No runtime, sample,
or eval change.

**README.** The opening timeline now includes the Data Sync lane and plain
wording for the unpublished weekly report.

**Hardening.** The console pages carry a Content Security Policy (same-origin
scripts, styles, and data only), with the boot fallback moved out of inline
script. CI checkouts no longer persist credentials. The package is marked
private so it cannot be published to npm by accident. `@types/node` tracks
the supported Node 22 runtime, zod is 4.6.5 in both labs, and `npm audit` is
clean.

## 1.2.0 (2026-10-01)

The repository's history was squashed into one commit when it was
republished at 1.2.0; earlier releases are summarized below.

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
