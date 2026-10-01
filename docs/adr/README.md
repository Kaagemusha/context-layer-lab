# Architecture decision records

Each record is one decision: the context that forced it, the decision, and
the consequences accepted along with it. See
[`docs/architecture.md`](../architecture.md) for how the pieces fit together
and [`docs/eval-report.md`](../eval-report.md) for what each decision
measurably buys.

1. [Explicit `validUntil`, not inferred recency](0001-explicit-validity-window.md)
2. [`PRESERVED_LOCAL` is its own operational outcome, not a success or a failure](0002-preserved-local-outcome.md)
3. [BM25F lexical retrieval, not embeddings](0003-lexical-retrieval-not-embeddings.md)
4. [Typed operational assertions bound to a source, not prose](0004-typed-assertions-bound-to-source.md)
5. [Deterministic, content-hashed ingestion receipts](0005-deterministic-ingestion-receipts.md)
6. [Consumers recompute the assessment; they never trust an embedded one](0006-recompute-not-trust-embedded-assessment.md)
