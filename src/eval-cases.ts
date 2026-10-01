import {
  searchContext,
  validateRecord,
  type ValidationIssueCode,
} from "./context.js";
import {
  assessOperationalHealth,
  type OperationalScenario,
} from "./operational-health.js";
import {
  checkRetrievalExpectation,
  type RetrievalCase,
} from "./retrieval-expectations.js";

export type RecordEvaluationCase = {
  name: string;
  asOf: string;
  record: unknown;
  expectedCodes: ValidationIssueCode[];
};

type OperationalAdversarialCase = {
  name: string;
  receiptRecordId: string;
  scenarioOutcome: "success" | "failed" | "preserved_local";
  expectedErrorIncludes: string;
};

export type OperationalFixture = {
  scenario: OperationalScenario;
  expected: unknown;
  adversarialCases?: OperationalAdversarialCase[];
};

export type EvaluationOutcome = {
  name: string;
  passed: boolean;
  detail: string;
};

/** Record cases from evals/cases.json: observed issue codes must match exactly. */
export function runRecordEvaluations(
  cases: RecordEvaluationCase[],
): EvaluationOutcome[] {
  return cases.map((evaluation) => {
    const result = validateRecord(evaluation.record, new Date(evaluation.asOf));
    const observed = [
      ...new Set(result.issues.map((issue) => issue.code)),
    ].sort();
    const expected = [...evaluation.expectedCodes].sort();
    return {
      name: evaluation.name,
      passed: JSON.stringify(observed) === JSON.stringify(expected),
      detail: `expected=${expected.join(",") || "none"} observed=${observed.join(",") || "none"}`,
    };
  });
}

/**
 * Operational cases from evals/operational-health.json: the bundled replay
 * must match its expected verdicts and lane states, and every adversarial
 * case must be rejected with the expected error.
 */
export function runOperationalEvaluations(
  fixture: OperationalFixture,
  records: unknown[],
): EvaluationOutcome[] {
  const operational = assessOperationalHealth(fixture.scenario, records);
  const observed = {
    naiveVerdict: operational.naiveVerdict,
    governedVerdict: operational.governedVerdict,
    summaryStale: operational.summaryStale,
    decisionPrevented: operational.decisionPrevented,
    attentionLaneIds: operational.laneAssessments
      .filter((lane) => lane.state === "attention")
      .map((lane) => lane.id),
    notDueLaneIds: operational.laneAssessments
      .filter((lane) => lane.state === "not_due")
      .map((lane) => lane.id),
  };
  const outcomes: EvaluationOutcome[] = [
    {
      name: "stale dashboard contradicted by newer receipts",
      passed: JSON.stringify(observed) === JSON.stringify(fixture.expected),
      detail: `naive=${operational.naiveVerdict} governed=${operational.governedVerdict}`,
    },
  ];

  for (const evaluation of fixture.adversarialCases ?? []) {
    const scenario = structuredClone(fixture.scenario);
    const receipt = scenario.receipts.find(
      (candidate) => candidate.recordId === evaluation.receiptRecordId,
    );
    let passed = false;
    let detail = `receipt ${evaluation.receiptRecordId} was not found`;
    if (receipt) {
      receipt.outcome = evaluation.scenarioOutcome;
      try {
        assessOperationalHealth(scenario, records);
        detail = "assessment unexpectedly succeeded";
      } catch (error) {
        detail = error instanceof Error ? error.message : String(error);
        passed = detail.includes(evaluation.expectedErrorIncludes);
      }
    }
    outcomes.push({ name: evaluation.name, passed, detail });
  }
  return outcomes;
}

/** The fixed evaluation time for every retrieval case. */
export const RETRIEVAL_AS_OF = new Date("2026-07-28T12:00:00Z");

/**
 * Retrieval cases from evals/retrieval-cases.json, searched at
 * RETRIEVAL_AS_OF. `detail` is the first failed expectation, or empty.
 */
export function runRetrievalEvaluations(
  cases: RetrievalCase[],
  records: unknown[],
): Array<EvaluationOutcome & { why: string }> {
  return cases.map((evaluation) => {
    const failure = checkRetrievalExpectation(
      evaluation.expect,
      searchContext(records, evaluation.query, RETRIEVAL_AS_OF, evaluation.limit),
    );
    return {
      name: evaluation.name,
      passed: failure === null,
      detail: failure ?? "",
      why: evaluation.why,
    };
  });
}
