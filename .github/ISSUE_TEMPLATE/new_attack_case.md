---
name: New attack case
about: Propose an adversarial input the reconciler or validator should reject
title: "[attack] "
labels: attack-case
---

**Attack name** (short and specific, e.g. "contradictory typed assertion," not "bad data")

**What it tries to get accepted**

Malformed record, missing provenance, unsupported claim, a scenario outcome
that contradicts its source-linked typed assertion, a stale-but-summarized
lane, or something else?

**Which boundary it targets** (identity / references / evidence binding /
time / ordering / quality. See the
[operational invariant matrix](../../docs/architecture.md#operational-invariant-matrix))

**Expected defense**

What should `validate_record`, the reconciler, or the diagnostic snapshot
builder do? Reject, and with which specific error?

**Is this already covered?**

Checked `evals/cases.json`, `evals/operational-health.json`, and
`evals/retrieval-cases.json` and did not find an equivalent case: yes / no

See [`CONTRIBUTING.md`](../../CONTRIBUTING.md#adding-a-new-eval-case) for what
a complete case needs before it can be merged.
