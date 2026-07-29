import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  explainSource,
  searchContext,
  validateRecord,
  type SearchResult,
  type ValidationResult,
} from "./context.js";

export type ToolResponse<T> = {
  ok: boolean;
  result: T;
};

function parseAsOf(value?: string): Date {
  if (!value) {
    return new Date();
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid asOf timestamp: ${value}`);
  }
  return parsed;
}

export function handleSearch(
  records: unknown[],
  input: { query: string; asOf?: string | undefined; limit?: number | undefined },
): ToolResponse<{ query: string; matches: SearchResult[]; limit: number }> {
  const limit = input.limit ?? DEFAULT_SEARCH_LIMIT;
  const matches = searchContext(records, input.query, parseAsOf(input.asOf), limit);
  return {
    ok: true,
    // The effective limit is echoed back so a caller can tell a truncated
    // result set from an exhaustive one.
    result: { query: input.query, matches, limit: Math.min(limit, MAX_SEARCH_LIMIT) },
  };
}

export function handleExplainSource(
  records: unknown[],
  input: { recordId: string; sourceId: string },
): ToolResponse<ReturnType<typeof explainSource>> {
  const result = explainSource(records, input.recordId, input.sourceId);
  return { ok: result.found, result };
}

export function handleValidate(
  input: { record: unknown; asOf?: string | undefined },
): ToolResponse<ValidationResult> {
  const result = validateRecord(input.record, parseAsOf(input.asOf));
  return { ok: result.valid, result };
}
