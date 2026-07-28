import { readFile } from "node:fs/promises";

import { validateRecord, type ValidationIssueCode } from "./context.js";

type EvaluationCase = {
  name: string;
  asOf: string;
  record: unknown;
  expectedCodes: ValidationIssueCode[];
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

console.log(`\n${cases.length - failures}/${cases.length} evaluations passed`);
if (failures > 0) {
  process.exitCode = 1;
}
