import { readFile, writeFile } from "node:fs/promises";

import type { ContextRecord } from "./context.js";
import {
  runOperationalEvaluations,
  runRecordEvaluations,
  runRetrievalEvaluations,
  type OperationalFixture,
  type RecordEvaluationCase,
} from "./eval-cases.js";
import {
  assessOperationalHealth,
  type OperationalAssessment,
  type OperationalScenario,
} from "./operational-health.js";
import type { RetrievalCase } from "./retrieval-expectations.js";

/**
 * A baseline that reads only "is the aggregate summary current". It never
 * inspects per-lane receipt outcome or per-lane evidence quality. This is
 * what a dashboard that shows a staleness banner, but does not itself
 * reconcile evidence, effectively computes.
 */
function recencyOnlyVerdict(assessment: OperationalAssessment): "healthy" | "attention" {
  return assessment.summaryStale ? "attention" : assessment.naiveVerdict;
}

async function loadJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(new URL(relativePath, import.meta.url), "utf8")) as T;
}

const records = await loadJson<unknown[]>("../../data/context-records.json");
const operationalFixture = await loadJson<OperationalFixture>(
  "../../evals/operational-health.json",
);

// --- 1. Record and operational cases (same code path as eval-runner.ts) ---
const recordOutcomes = runRecordEvaluations(
  await loadJson<RecordEvaluationCase[]>("../../evals/cases.json"),
);
const operationalOutcomes = runOperationalEvaluations(operationalFixture, records);
const recordPassed = recordOutcomes.filter((outcome) => outcome.passed).length;
const operationalPassed = operationalOutcomes.filter((outcome) => outcome.passed).length;
const contextPassed = recordPassed + operationalPassed;
const contextTotal = recordOutcomes.length + operationalOutcomes.length;

// --- 2. Retrieval cases (same code path as retrieval-eval-runner.ts) ---
const retrievalCases = await loadJson<RetrievalCase[]>("../../evals/retrieval-cases.json");
const retrievalPassed = runRetrievalEvaluations(retrievalCases, records).filter(
  (outcome) => outcome.passed,
).length;

const totalPassed = contextPassed + retrievalPassed;
const total = contextTotal + retrievalCases.length;
if (totalPassed !== total) {
  console.error(`FAIL eval-report: ${totalPassed}/${total} evaluations passed`);
  process.exitCode = 1;
}

// --- 3. The bundled operational scenario: naive vs recency-only vs governed ---
const bundled = assessOperationalHealth(operationalFixture.scenario, records);
const bundledRecency = recencyOnlyVerdict(bundled);

// --- 4. Illustrative divergence scenario: recency-only misses degraded evidence ---
// Constructed so no receipt postdates the summary (summaryStale stays false on
// pure recency grounds) while one lane's evidence record has expired
// (validUntil < asOf), which only full per-lane reconciliation catches.
const divergenceScenario: OperationalScenario = {
  question: "Is the deploy lane healthy?",
  asOf: "2026-08-01T08:10:00Z",
  lanes: [{ id: "docs-build", label: "Docs Build", dueAt: "2026-08-01T08:00:00Z" }],
  summary: {
    recordId: "daily-status-dashboard-b",
    observedAt: "2026-08-01T08:05:00Z",
    verdict: "healthy",
  },
  receipts: [
    {
      recordId: "docs-build-receipt-b",
      laneId: "docs-build",
      observedAt: "2026-08-01T08:03:00Z",
      outcome: "success",
    },
  ],
};
const divergenceRecords: ContextRecord[] = [
  {
    id: "daily-status-dashboard-b",
    title: "Daily Status Dashboard (illustrative)",
    summary: "Aggregate status across one scheduled lane.",
    content: "Synthetic record built only to illustrate the three-baseline eval report.",
    tags: ["automation-health", "dashboard"],
    owner: "Platform Operations",
    updatedAt: "2026-08-01T08:05:00Z",
    validUntil: "2026-08-02T00:00:00Z",
    sources: [
      {
        id: "dashboard-0805",
        label: "Status dashboard snapshot",
        url: "https://example.invalid/operations/dashboard-0805",
        observedAt: "2026-08-01T08:05:00Z",
      },
    ],
    claims: [
      {
        text: "All scheduled jobs are healthy.",
        sourceIds: ["dashboard-0805"],
        operational: {
          kind: "summary",
          observedAt: "2026-08-01T08:05:00Z",
          verdict: "healthy",
          lanes: [{ id: "docs-build", label: "Docs Build", dueAt: "2026-08-01T08:00:00Z" }],
        },
      },
    ],
  },
  {
    id: "docs-build-receipt-b",
    title: "Docs Build Run Receipt (illustrative, expired)",
    summary: "The scheduled docs build reported success, but its evidence record has expired.",
    content: "Synthetic record built only to illustrate the three-baseline eval report.",
    tags: ["automation-health", "run-receipt"],
    owner: "Platform Operations",
    updatedAt: "2026-08-01T08:03:00Z",
    // Expired relative to the scenario's asOf (08:10), even though the run
    // itself was neither late nor newer than the summary.
    validUntil: "2026-08-01T08:00:00Z",
    sources: [
      {
        id: "docs-run-0803",
        label: "Docs Build terminal receipt",
        url: "https://example.invalid/operations/docs-run-0803",
        observedAt: "2026-08-01T08:03:00Z",
      },
    ],
    claims: [
      {
        text: "The Docs Build run succeeded.",
        sourceIds: ["docs-run-0803"],
        operational: {
          kind: "receipt",
          laneId: "docs-build",
          observedAt: "2026-08-01T08:03:00Z",
          outcome: "success",
        },
      },
    ],
  },
];
const divergence = assessOperationalHealth(divergenceScenario, divergenceRecords);
const divergenceRecency = recencyOnlyVerdict(divergence);
const divergenceEvidenceState = divergence.evidenceQuality["docs-build-receipt-b"]?.state;

// This report only makes an honest claim if the divergence is real. Fail
// loudly rather than publish a three-way contrast that doesn't actually hold.
const divergenceHolds =
  divergence.naiveVerdict === "healthy" &&
  divergenceRecency === "healthy" &&
  divergence.governedVerdict === "attention" &&
  divergenceEvidenceState === "degraded";
if (!divergenceHolds) {
  console.error(
    "FAIL eval-report: the illustrative recency-vs-governed divergence did not hold. " +
      `naive=${divergence.naiveVerdict} recencyOnly=${divergenceRecency} governed=${divergence.governedVerdict} ` +
      `evidenceState=${divergenceEvidenceState}`,
  );
  process.exitCode = 1;
}

const report = `# Eval report

Auto-generated by \`npm run eval\`. Do not hand-edit. Regenerate with
\`npm run eval\`; \`npm run check\` fails if this file is out of date.

## Headline numbers

- **${totalPassed}/${total} deterministic evaluations pass.** No model call.
- **Record and operational: ${contextPassed}/${contextTotal} (${recordOutcomes.length} record +
  ${operationalOutcomes.length} operational).** Malformed, unsupported, missing-provenance, and
  stale records are flagged as declared. The bundled operational replay
  matches its expected verdicts, and a contradictory scenario outcome is
  rejected.
- **Retrieval: ${retrievalPassed}/${retrievalCases.length} cases correct.** BM25F
  whole-token, quality-flagged, bounded search. Current records rank above
  stale and invalid ones.
- **Operational reconciliation: naive is wrong on both scenarios below;
  governed is correct on both.** See the three-way contrast for what each
  baseline actually catches.

## Three-way contrast: naive, recency-only, governed

Naive trusts the last reported verdict, full stop. Recency-only additionally
flags the verdict as untrustworthy when it is stale by the clock (superseded
by a newer receipt, or its own record expired). It still does not look at
what the receipts actually say. Governed reconciles per-lane outcome and
per-lane evidence quality regardless of how the aggregate feels about its own
freshness.

### Bundled scenario: "${operationalFixture.scenario.question}"

A dashboard reports healthy at ${operationalFixture.scenario.summary.observedAt};
newer per-lane receipts (one failed, one preserved-local) exist by
${operationalFixture.scenario.asOf}.

| Baseline | Verdict | Correct? |
|---|---|---|
| Naive | \`${bundled.naiveVerdict}\` | No. It repeats the stale aggregate |
| Recency-only | \`${bundledRecency}\` | ${bundledRecency === bundled.governedVerdict ? "Yes. The aggregate is superseded, so recency alone catches it here" : "No"} |
| Governed | \`${bundled.governedVerdict}\` | Yes |

### Illustrative scenario: evidence expires without a newer receipt

A dashboard reports healthy 5 minutes before \`asOf\`. The one lane's receipt
is *older* than the dashboard, so nothing supersedes it. It reports success,
but its own evidence record expired (\`validUntil\` before \`asOf\`). This is a
receipt that was never re-validated, not a lane that ran late.

| Baseline | Verdict | Correct? |
|---|---|---|
| Naive | \`${divergence.naiveVerdict}\` | No |
| Recency-only | \`${divergenceRecency}\` | **No. The aggregate itself is not stale, so a recency-only check has nothing to flag** |
| Governed | \`${divergence.governedVerdict}\` | Yes. Per-lane evidence quality (\`${divergenceEvidenceState}\`) is checked independently of aggregate freshness |

This is the case recency-only checks exist to catch and still miss: a system
that only asks "is my last report recent enough" cannot see a data-quality
problem in evidence that was never superseded by anything newer. Reproduce
both tables with \`npm run eval\`. This file is generated by
\`src/eval-report.ts\`, and the illustrative scenario is asserted against its
own expected values before this file is written. Read that script if the
numbers here ever look wrong.
`;

const reportUrl = new URL("../../docs/eval-report.md", import.meta.url);
const counts = `${totalPassed}/${total}: record and operational ${contextPassed}/${contextTotal}, retrieval ${retrievalPassed}/${retrievalCases.length}`;
if (process.argv.includes("--check")) {
  const actual = await readFile(reportUrl, "utf8").catch(() => "");
  if (actual !== report) {
    console.error("docs/eval-report.md is stale; run npm run eval");
    process.exitCode = 1;
  } else {
    console.log(`docs/eval-report.md is in sync (${counts})`);
  }
} else {
  await writeFile(reportUrl, report);
  console.log(`wrote docs/eval-report.md (${counts})`);
}
