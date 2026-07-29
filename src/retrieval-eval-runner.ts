// Retrieval evaluations.
//
// The validation evaluations in eval-runner.ts check whether a record is
// *correctly described* — stale, unsupported, malformed. These check whether
// search *returns the right thing*, which is a separate failure surface and
// was previously untested.
//
// Every case here corresponds to a defect found in the term-count scorer this
// replaced, or to a property that scorer did not guarantee. Deterministic, no
// model call, runs in CI.

import { readFile } from "node:fs/promises";

import { searchContext, type SearchResult } from "./context.js";

type Expectation = {
  empty?: boolean;
  nonEmpty?: boolean;
  topId?: string;
  everyResultHasState?: boolean;
  maxResults?: number;
};

type RetrievalCase = {
  name: string;
  query: string;
  limit?: number;
  expect: Expectation;
  why: string;
};

const AS_OF = new Date("2026-07-28T12:00:00Z");

const recordsUrl = new URL("../../data/context-records.json", import.meta.url);
const casesUrl = new URL("../../evals/retrieval-cases.json", import.meta.url);

const records: unknown[] = JSON.parse(await readFile(recordsUrl, "utf8"));
const cases: RetrievalCase[] = JSON.parse(await readFile(casesUrl, "utf8"));

function check(expect: Expectation, results: SearchResult[]): string | null {
  if (expect.empty && results.length !== 0) {
    return `expected no results, got ${results.length} (top: ${results[0]?.id})`;
  }
  if (expect.nonEmpty && results.length === 0) {
    return "expected at least one result, got none";
  }
  if (expect.topId && results[0]?.id !== expect.topId) {
    return `expected top result "${expect.topId}", got "${results[0]?.id ?? "none"}"`;
  }
  if (expect.everyResultHasState && !results.every((result) => Boolean(result.state))) {
    return "expected every result to carry a validation state";
  }
  if (expect.maxResults !== undefined && results.length > expect.maxResults) {
    return `expected at most ${expect.maxResults} results, got ${results.length}`;
  }
  return null;
}

let failures = 0;
for (const evaluation of cases) {
  const results =
    evaluation.limit === undefined
      ? searchContext(records, evaluation.query, AS_OF)
      : searchContext(records, evaluation.query, AS_OF, evaluation.limit);
  const failure = check(evaluation.expect, results);

  console.log(
    `${failure ? "FAIL" : "PASS"} ${evaluation.name}${failure ? `: ${failure}` : ""}`,
  );
  if (failure) {
    console.log(`     why this matters: ${evaluation.why}`);
    failures += 1;
  }
}

console.log(`\n${cases.length - failures}/${cases.length} retrieval evaluations passed`);
if (failures > 0) {
  process.exitCode = 1;
}
