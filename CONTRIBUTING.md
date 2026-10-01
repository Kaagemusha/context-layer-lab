# Contributing

This is a small, deliberately bounded reference implementation. Contributions
that stay inside its scope are welcome; contributions that grow it into a
production retrieval or memory platform are not. See
[`docs/architecture.md`](docs/architecture.md#limits-and-next-tests) for what
it explicitly does not do.

## Development checks

```bash
npm install
npm run check      # the full suite
```

`npm run check` must be green before any PR is merged. It runs
`scripts/check.mjs`: the public-safety scan, one clean build (which also
typechecks), the tests, all three eval suites, and drift checks for the eval
report, ingested data, fixture states, browser runtime, and demo snapshot. It
ends with `npm run demo`. It compiles once and reuses the build.

Each step also has its own script, which builds first so it works alone:
`npm run public-safety:check`, `npm run typecheck`, `npm test`,
`npm run eval` (record, operational, and retrieval cases),
`npm run ingest:check`, `npm run fixture:check`, `npm run demo:check`.

Before pushing, install the fail-closed public-safety hook once:

```bash
git config publicSafety.patternsFile /path/to/private-patterns
npm run public-safety:install
```

## Adding a new eval case

Record and operational cases live in `evals/cases.json` and
`evals/operational-health.json`; retrieval cases live in
`evals/retrieval-cases.json`. A new case needs:

1. A concrete scenario: a specific record shape, evidence-binding conflict, or
   query/result pair. Not a vague "search could be better" note.
2. An explicit expected result, checked against the real validation,
   reconciliation, or BM25F search code. Never a mock.
3. A one-line addition to the case list in
   [`docs/architecture.md`](docs/architecture.md#evaluations).

Run `npm run eval` locally before opening a PR. It runs the record,
operational, and retrieval suites and regenerates `docs/eval-report.md`;
every case must pass, and `npm run check` fails if the committed report is
out of date. Update the counts in `README.md`, `docs/index.html`,
and `docs/architecture.md` to match.

## Rules

- Do not hand-edit generated files (`data/context-records.json`,
  `data/ingestion-receipts.json`, the public demo snapshot). Regenerate with
  `npm run ingest` / `npm run demo:sync`, then verify with the matching
  `*:check` script.
- Keep fixtures synthetic and public-safe: no client data, private
  knowledge-base structure, credentials, or operating logs.
- Never claim schema validation makes information true; the validator checks
  that claims are linked to declared evidence, not that the evidence is
  correct.
- Run `npm run public-safety:check` before every commit, and full
  `npm run check` before any change that touches `docs/` or publishes
  anything.

## Snapshot age and retention

The public sample is pinned to `snapshotAsOf` in
`data/snapshot-metadata.json`. The MCP tools, evals, and demo read it at
pinned times, not the wall clock, so its real-world age changes no result. A separate advisory workflow
(`.github/workflows/snapshot-age.yml`) runs monthly in CI and opens an issue
when the sample is older than `ageThresholdDays`. Run the same check locally
with `npm run snapshot:age`.

To keep an old sample on purpose, add or extend the optional `retention`
block (`until`, `reason`). The check passes while `until` is in the future
and flags again once it lapses. Refresh the sample or retain it again with a
new date and reason. Do not raise the threshold to silence the check.

## Adapters

`npm run adapt:trajectory` maps the synthetic
`examples/trajectory-adapter-input.json` into a diagnostic snapshot. See
[Adapters](docs/architecture.md#adapters).
