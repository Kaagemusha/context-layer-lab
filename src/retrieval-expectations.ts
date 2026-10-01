import type { SearchResult } from "./context.js";

export type RetrievalExpectation = {
  empty?: boolean;
  nonEmpty?: boolean;
  topId?: string;
  everyResultHasState?: boolean;
  maxResults?: number;
  /**
   * A non-valid record that scores higher lexically must still rank below a
   * valid one. Both records must be present in the results.
   */
  demoted?: { id: string; below: string };
};

export type RetrievalCase = {
  name: string;
  query: string;
  limit?: number;
  expect: RetrievalExpectation;
  why: string;
};

/** Returns null when every expectation holds, or the first failure. */
export function checkRetrievalExpectation(
  expectation: RetrievalExpectation,
  results: SearchResult[],
): string | null {
  if (expectation.empty && results.length !== 0) {
    return `expected no results, got ${results.length}`;
  }
  if (expectation.nonEmpty && results.length === 0) {
    return "expected at least one result, got none";
  }
  if (expectation.topId && results[0]?.id !== expectation.topId) {
    return `expected top result "${expectation.topId}", got "${results[0]?.id ?? "none"}"`;
  }
  if (
    expectation.everyResultHasState &&
    !results.every((result) => Boolean(result.state))
  ) {
    return "expected every result to carry a validation state";
  }
  if (
    expectation.maxResults !== undefined &&
    results.length > expectation.maxResults
  ) {
    return `expected at most ${expectation.maxResults} results, got ${results.length}`;
  }
  if (expectation.demoted) {
    const { id, below } = expectation.demoted;
    const demotedIndex = results.findIndex((result) => result.id === id);
    const validIndex = results.findIndex((result) => result.id === below);
    const demoted = results[demotedIndex];
    const valid = results[validIndex];
    if (!demoted || !valid) {
      return `expected both "${id}" and "${below}" in the results`;
    }
    if (demoted.state === "valid" || valid.state !== "valid") {
      return `expected "${id}" to be non-valid and "${below}" to be valid`;
    }
    if (demoted.score <= valid.score) {
      return `expected "${id}" to have the higher lexical score`;
    }
    if (demotedIndex < validIndex) {
      return `expected "${id}" to rank below "${below}"`;
    }
  }
  return null;
}
