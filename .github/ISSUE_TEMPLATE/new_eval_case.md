---
name: New eval case
about: Propose a new deterministic validation, operational, or retrieval case
title: "[eval] "
labels: eval-case
---

**Scenario** (one sentence: the specific record/query/state combination being tested)

**Which suite it belongs in** (`evals/cases.json` validation,
`evals/operational-health.json` reconciliation, or
`evals/retrieval-cases.json` search. See
[`docs/architecture.md`](../../docs/architecture.md#evaluations).)

**Expected result**

```json
{}
```

**Why the current cases don't already cover this**

See [`CONTRIBUTING.md`](../../CONTRIBUTING.md#adding-a-new-eval-case). The
case must run against the real validation, reconciliation, or search code
with an explicit expected result, not a mock.
