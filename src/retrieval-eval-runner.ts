import { readFile } from "node:fs/promises";

import { runRetrievalEvaluations } from "./eval-cases.js";
import type { RetrievalCase } from "./retrieval-expectations.js";

async function loadJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(
    await readFile(new URL(relativePath, import.meta.url), "utf8"),
  ) as T;
}

const records = await loadJson<unknown[]>("../../data/context-records.json");
const cases = await loadJson<RetrievalCase[]>(
  "../../evals/retrieval-cases.json",
);

let failures = 0;
for (const outcome of runRetrievalEvaluations(cases, records)) {
  console.log(
    `${outcome.passed ? "PASS" : "FAIL"} ${outcome.name}${outcome.passed ? "" : `: ${outcome.detail}`}`,
  );
  if (!outcome.passed) {
    console.log(`     why this matters: ${outcome.why}`);
    failures += 1;
  }
}

console.log(
  `\n${cases.length - failures}/${cases.length} retrieval evaluations passed`,
);
if (failures > 0) {
  process.exitCode = 1;
}
