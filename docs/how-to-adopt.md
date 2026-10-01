# How to put this in front of a real agent

This repository is a reference implementation, not a library you `npm
install` into production (see
[`docs/architecture.md`](architecture.md#limits-and-next-tests)). This page
is the honest version of "how would you actually do this": what to keep,
what to build, and what this pattern does not solve for you.

## 1. Keep the naive-vs-governed question, not the specific scenario

The reusable idea is a single verified question: does the evidence a summary
is based on still support that summary right now? This lab's scenario ("are
all scheduled automations healthy") is one instance of that question. Your
domain's instance might be "is this customer's account status still
accurate" or "is this document still the current policy." Keep the
reconciliation discipline and rebuild the specific evidence records for
your domain. The three-way naive/recency-only/governed contrast in
[`docs/eval-report.md`](eval-report.md) shows exactly what changes between
"trust the last report," "trust it unless it's old," and "check what the
evidence actually says."

## 2. Write typed operational assertions for your own outcome states

`success` / `failed` / `preserved_local` fits scheduled automation lanes.
Your domain has its own small, closed set of outcomes. Model them as an
enum on a typed, source-bound assertion (see
[ADR 4](adr/0004-typed-assertions-bound-to-source.md)), not as free text a
downstream system has to parse and guess at.

## 3. Decide your own freshness windows per record type, in writing

Don't reach for one global staleness threshold. [ADR
1](adr/0001-explicit-validity-window.md) is a stronger default: every record
declares its own `validUntil`, set by whoever authored it. Someone on your
team has to actually decide how long each kind of fact stays trustworthy.
That decision is real work this lab can't do for you, and skipping it
(defaulting every record to the same arbitrary window) reintroduces the
"aggregate outlives its evidence" failure one layer down.

## 4. Decide whether lexical retrieval is enough

BM25F is the right default at this lab's scale. See [ADR
3](adr/0003-lexical-retrieval-not-embeddings.md). If your evidence corpus is
large or the matching problem is genuinely semantic (paraphrased claims that
share no vocabulary), you need embeddings, and you need your own retrieval
evaluations to prove they help, the same way `evals/retrieval-cases.json`
proves the lexical ranking here holds its properties.

## 5. Wire it to a real evidence source, and re-verify at consumption

`npm run adapt:trajectory` is a small example of a narrow adapter: it maps
declared lanes and run records into the same inspectable snapshot shape
everything else here consumes (see
[Trajectory adapter](architecture.md#trajectory-adapter)). Whatever your
evidence source is, the consumer of the resulting snapshot should still
recompute the assessment and reject drift rather than trust an embedded one.
See [ADR 6](adr/0006-recompute-not-trust-embedded-assessment.md). Skipping
that step to save one function call reopens the exact naive-trust gap.

## Apply it to a company knowledge base

A knowledge base fails the same way a dashboard does: last year's policy page
still matches the question best. Four fields do the work:

- `validUntil`: the date after which the record is stale. Someone decides it.
- `sources`: the documents the record rests on.
- `claims[].sourceIds`: each claim names a declared source, or it is flagged.
- `owner`: who answers for the record when it goes stale.

The example below is
[`examples/knowledge-base.ts`](../examples/knowledge-base.ts). A test runs it
on every `npm run check` and asserts this block matches the file. The expired
record scores higher on the query and still ranks second, with its `state`
attached.

```ts
import { searchContext, validateRecord } from "../src/context.js";

const current = {
  id: "refund-policy-2026",
  title: "Returns: 30-day window",
  summary: "Refunds are accepted within 30 days of delivery.",
  content: "Customers may request a refund within 30 days of delivery.",
  tags: ["policy", "refunds"],
  owner: "Customer Operations", // who answers for this record
  updatedAt: "2026-07-01T00:00:00Z",
  validUntil: "2026-12-31T23:59:59Z", // after this, the record is stale
  sources: [
    {
      id: "policy-doc-v3", // evidence the claims point to
      label: "Refund policy v3",
      url: "https://example.invalid/policies/refunds-v3",
      observedAt: "2026-07-01T00:00:00Z",
    },
  ],
  claims: [
    {
      text: "The refund window is 30 days.",
      sourceIds: ["policy-doc-v3"], // must name a declared source
    },
  ],
};

// Last year's version matches the query better, but it has expired.
const expired = {
  ...current,
  id: "refund-policy-2025",
  title: "Refund policy",
  validUntil: "2025-12-31T23:59:59Z",
};

const asOf = new Date("2026-09-01T00:00:00Z");

const check = validateRecord(expired, asOf);
console.log(check.state, check.issues.map((issue) => issue.code));
// degraded [ 'stale_record' ]

for (const hit of searchContext([expired, current], "refund policy", asOf)) {
  console.log(hit.id, hit.state, hit.score.toFixed(2));
}
// refund-policy-2026 valid 0.25
// refund-policy-2025 degraded 0.32
```

Run it with `npm run build && node dist/examples/knowledge-base.js`.

## What you would still need to add

- **Authorization and record-level access control.** Nothing here restricts
  who can read which record; every record in this repo is public by
  construction.
- **A corpus-scale retrieval evaluation**, if you outgrow lexical search.
  See step 4.
- **A real evidence-ingestion pipeline with its own security review**, if
  your source isn't a static, versioned Markdown fixture set the way this
  repo's is.
- **Observability and human correction workflows.** A wrong `validUntil` or
  a wrong typed assertion is currently caught by CI on generated fixtures,
  not by a live monitoring or correction path in production.
- **A governance layer for what happens after the evidence is confirmed
  current.** This lab answers "what does current evidence support"; it does
  not decide what may execute on that basis. See [Governed Action
  Lab](https://github.com/Kaagemusha/governed-action-lab) for the paired
  answer to that question, and its own
  [`docs/how-to-adopt.md`](https://github.com/Kaagemusha/governed-action-lab/blob/main/docs/how-to-adopt.md)
  for the adapter and identity work that side needs.

If your honest answer after reading this is "we need most of the list," that
is the correct read of a reference implementation. The value it offers is a
tested shape for evidence reconciliation, not a shortcut past the
engineering the list describes.
