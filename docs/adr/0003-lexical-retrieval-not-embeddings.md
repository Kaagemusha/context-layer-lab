# 3. BM25F lexical retrieval, not embeddings

## Status

Accepted.

## Context

The obvious way to build "search" in 2026 is an embedding index. That choice
buys semantic matching at the cost of a model call, a vector store, and
non-determinism: two runs of the same query against the same corpus can
return different rankings if the embedding model changes underneath you, and
a wrong or hallucinated similarity score is much harder to explain to a
reviewer than "this term matched, this one didn't." This lab's central claim
is about provenance and freshness, not retrieval quality. Pulling in a
model dependency to test a claim that doesn't need one would add risk
without testing anything.

## Decision

`searchContext()` (`src/context.ts`) ranks with BM25F: per-field length
normalization, inverse document frequency, and term-frequency saturation,
with titles and tags weighted above free text (`src/ranking.ts`). Matching is
whole-token and stopword-filtered: `out` does not match `rollout`, and a
query of just `the` returns nothing rather than a confident wrong answer.
Ordering is freshness-aware: results sort first by validation state (`valid`,
then `degraded`, then `invalid`), then by BM25F score, then by title. A stale
record that matches the query best still ranks below a current one, and it
stays in the results with its state attached. Ten retrieval evaluations
(`evals/retrieval-cases.json`) pin these properties, the default and max
result bounds, and the requirement that every result carries a visible
quality state.

## Consequences

- Every ranking decision recomputes deterministically from the same corpus
  and query with zero external calls. A query run twice always returns the
  same order, and a reviewer can hand-verify a specific ranking by reading
  `src/ranking.ts` rather than trusting an opaque similarity score.
- The dataset is tiny by design (see
  [`docs/architecture.md`](../architecture.md#limits-and-next-tests)); this
  is explicitly not a claim that lexical search beats embeddings at scale.
  Add embeddings only when a larger corpus and its own retrieval evaluations
  demonstrate lexical matching is actually the bottleneck. Not by default.
- Homoglyph or near-duplicate phrasing across records is not resolved by
  this ranking; whole-token exact matching is a feature for auditability, not
  a claim of semantic completeness.
