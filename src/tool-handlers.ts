import {
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
  input: { query: string; asOf?: string | undefined },
): ToolResponse<{ query: string; matches: SearchResult[] }> {
  const matches = searchContext(records, input.query, parseAsOf(input.asOf));
  return {
    ok: true,
    result: { query: input.query, matches },
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
