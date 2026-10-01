import { readFile } from "node:fs/promises";

import {
  runOperationalEvaluations,
  runRecordEvaluations,
  type OperationalFixture,
  type RecordEvaluationCase,
} from "./eval-cases.js";

async function loadJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(
    await readFile(new URL(relativePath, import.meta.url), "utf8"),
  ) as T;
}

const cases = await loadJson<RecordEvaluationCase[]>("../../evals/cases.json");
const operationalFixture = await loadJson<OperationalFixture>(
  "../../evals/operational-health.json",
);
const records = await loadJson<unknown[]>("../../data/context-records.json");

const outcomes = [
  ...runRecordEvaluations(cases),
  ...runOperationalEvaluations(operationalFixture, records),
];

let failures = 0;
for (const outcome of outcomes) {
  console.log(
    `${outcome.passed ? "PASS" : "FAIL"} ${outcome.name}: ${outcome.detail}`,
  );
  if (!outcome.passed) failures += 1;
}

console.log(
  `\n${outcomes.length - failures}/${outcomes.length} evaluations passed`,
);
if (failures > 0) {
  process.exitCode = 1;
}
