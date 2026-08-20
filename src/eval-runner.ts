import { readFile } from "node:fs/promises";

import { validateRecord, type ValidationIssueCode } from "./context.js";
import { assessOperationalHealth } from "./operational-health.js";

type EvaluationCase = {
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

const casesUrl = new URL("../../evals/cases.json", import.meta.url);
const cases: EvaluationCase[] = JSON.parse(await readFile(casesUrl, "utf8"));

let failures = 0;
for (const evaluation of cases) {
  const result = validateRecord(evaluation.record, new Date(evaluation.asOf));
  const observed = [...new Set(result.issues.map((issue) => issue.code))].sort();
  const expected = [...evaluation.expectedCodes].sort();
  const passed = JSON.stringify(observed) === JSON.stringify(expected);
  console.log(
    `${passed ? "PASS" : "FAIL"} ${evaluation.name}: expected=${expected.join(",") || "none"} observed=${observed.join(",") || "none"}`,
  );
  if (!passed) {
    failures += 1;
  }
}

const operationalFixture = JSON.parse(
  await readFile(
    new URL("../../evals/operational-health.json", import.meta.url),
    "utf8",
  ),
);
const records = JSON.parse(
  await readFile(
    new URL("../../data/context-records.json", import.meta.url),
    "utf8",
  ),
);
const operational = assessOperationalHealth(
  operationalFixture.scenario,
  records,
);
const operationalObserved = {
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
const operationalPassed =
  JSON.stringify(operationalObserved) ===
  JSON.stringify(operationalFixture.expected);
console.log(
  `${operationalPassed ? "PASS" : "FAIL"} stale dashboard contradicted by newer receipts: naive=${operational.naiveVerdict} governed=${operational.governedVerdict}`,
);
if (!operationalPassed) failures += 1;

const adversarialCases: OperationalAdversarialCase[] =
  operationalFixture.adversarialCases ?? [];
for (const evaluation of adversarialCases) {
  const adversarialScenario = structuredClone(operationalFixture.scenario);
  const receipt = adversarialScenario.receipts.find(
    (candidate: { recordId: string }) =>
      candidate.recordId === evaluation.receiptRecordId,
  );
  let passed = false;
  let detail = `receipt ${evaluation.receiptRecordId} was not found`;
  if (receipt) {
    receipt.outcome = evaluation.scenarioOutcome;
    try {
      assessOperationalHealth(adversarialScenario, records);
      detail = "assessment unexpectedly succeeded";
    } catch (error) {
      detail = error instanceof Error ? error.message : String(error);
      passed = detail.includes(evaluation.expectedErrorIncludes);
    }
  }
  console.log(`${passed ? "PASS" : "FAIL"} ${evaluation.name}: ${detail}`);
  if (!passed) failures += 1;
}

const total = cases.length + 1 + adversarialCases.length;
console.log(`\n${total - failures}/${total} evaluations passed`);
if (failures > 0) {
  process.exitCode = 1;
}
