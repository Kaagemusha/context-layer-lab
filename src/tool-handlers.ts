import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  explainSource,
  searchContext,
  validateRecord,
  type SearchResult,
  type ValidationResult,
} from "./context.js";
import type { IngestionReceipt } from "./ingest.js";

export type ToolResponse<T> = {
  ok: boolean;
  result: T;
};

function parseAsOf(value?: string, fallback?: string): Date {
  const candidate = value ?? fallback;
  if (!candidate) {
    return new Date();
  }
  const parsed = new Date(candidate);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid asOf timestamp: ${candidate}`);
  }
  return parsed;
}

export function handleSearch(
  records: unknown[],
  input: {
    query: string;
    asOf?: string | undefined;
    limit?: number | undefined;
  },
  snapshotAsOf?: string,
): ToolResponse<{ query: string; matches: SearchResult[]; limit: number }> {
  const requestedLimit = input.limit ?? DEFAULT_SEARCH_LIMIT;
  const effectiveLimit = Math.max(
    1,
    Math.min(requestedLimit, MAX_SEARCH_LIMIT),
  );
  const matches = searchContext(
    records,
    input.query,
    parseAsOf(input.asOf, snapshotAsOf),
    effectiveLimit,
  );
  return {
    ok: true,
    result: { query: input.query, matches, limit: effectiveLimit },
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
  snapshotAsOf?: string,
): ToolResponse<ValidationResult> {
  const result = validateRecord(
    input.record,
    parseAsOf(input.asOf, snapshotAsOf),
  );
  return { ok: result.valid, result };
}

export function handleInspectIngestion(
  receipts: IngestionReceipt[],
  input: { recordId: string },
): ToolResponse<
  | { found: true; receipt: IngestionReceipt }
  | { found: false; message: string }
> {
  const receipt = receipts.find((item) => item.recordId === input.recordId);
  if (!receipt) {
    return {
      ok: false,
      result: {
        found: false,
        message: `No ingestion receipt was found for record "${input.recordId}".`,
      },
    };
  }
  return { ok: true, result: { found: true, receipt } };
}
