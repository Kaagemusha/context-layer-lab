import { z } from "zod";

import { buildRankingIndex, scoreRecord, tokenize } from "./ranking.js";

export const sourceSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    url: z.string().url(),
    observedAt: z.string().datetime({ offset: true }),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
  })
  .strict();

export const operationalVerdictSchema = z.enum(["healthy", "attention"]);
export const operationalOutcomeSchema = z.enum([
  "success",
  "failed",
  "preserved_local",
]);
export const operationalLaneSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    dueAt: z.string().datetime({ offset: true }),
  })
  .strict();
export const operationalAssertionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("summary"),
      observedAt: z.string().datetime({ offset: true }),
      verdict: operationalVerdictSchema,
      lanes: z.array(operationalLaneSchema).min(1),
    })
    .strict(),
  z
    .object({
      kind: z.literal("receipt"),
      laneId: z.string().min(1),
      observedAt: z.string().datetime({ offset: true }),
      outcome: operationalOutcomeSchema,
    })
    .strict(),
]);

export type OperationalAssertion = z.infer<typeof operationalAssertionSchema>;

export const claimSchema = z
  .object({
    text: z.string().min(1),
    sourceIds: z.array(z.string().min(1)),
    operational: operationalAssertionSchema.optional(),
  })
  .strict();

export const contextRecordBaseSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    summary: z.string().min(1),
    content: z.string().min(1),
    tags: z.array(z.string().min(1)),
    owner: z.string().min(1),
    updatedAt: z.string().datetime({ offset: true }),
    validUntil: z.string().datetime({ offset: true }),
    sources: z.array(sourceSchema),
    claims: z.array(claimSchema),
  })
  .strict();

export const contextRecordSchema = contextRecordBaseSchema
  .superRefine((record, context) => {
    const sourceIds = new Set<string>();
    record.sources.forEach((source, index) => {
      if (sourceIds.has(source.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate source ID "${source.id}".`,
          path: ["sources", index, "id"],
        });
      }
      sourceIds.add(source.id);
    });
  });

export type ContextRecord = z.infer<typeof contextRecordSchema>;

export type ValidationIssueCode =
  | "malformed_record"
  | "missing_provenance"
  | "stale_record"
  | "unsupported_claim";

export const validationIssueSchema = z
  .object({
    code: z.enum([
      "malformed_record",
      "missing_provenance",
      "stale_record",
      "unsupported_claim",
    ]),
    severity: z.enum(["error", "warning"]),
    message: z.string().min(1),
    path: z.string().min(1).optional(),
  })
  .strict();

export type ValidationIssue = z.infer<typeof validationIssueSchema>;

export type ValidationResult = {
  valid: boolean;
  state: "valid" | "degraded" | "invalid";
  issues: ValidationIssue[];
  record?: ContextRecord;
};

export type SearchResult = {
  id: string;
  title: string;
  summary: string;
  owner: string;
  score: number;
  state: ValidationResult["state"];
  issues: ValidationIssue[];
  sourceIds: string[];
};

function pathLabel(path: PropertyKey[]): string {
  return path.map(String).join(".");
}

export function validateRecord(
  input: unknown,
  asOf = new Date(),
): ValidationResult {
  const parsed = contextRecordSchema.safeParse(input);

  if (!parsed.success) {
    return {
      valid: false,
      state: "invalid",
      issues: parsed.error.issues.map((issue) => ({
        code: "malformed_record",
        severity: "error",
        message: issue.message,
        path: pathLabel(issue.path),
      })),
    };
  }

  const record = parsed.data;
  const issues: ValidationIssue[] = [];
  const sourceIds = new Set(record.sources.map((source) => source.id));

  if (record.sources.length === 0) {
    issues.push({
      code: "missing_provenance",
      severity: "error",
      message: "The record declares no sources.",
      path: "sources",
    });
  }

  for (const [index, claim] of record.claims.entries()) {
    if (claim.sourceIds.length === 0) {
      issues.push({
        code: "missing_provenance",
        severity: "error",
        message: "The claim has no supporting source IDs.",
        path: `claims.${index}.sourceIds`,
      });
    }

    for (const sourceId of claim.sourceIds) {
      if (!sourceIds.has(sourceId)) {
        issues.push({
          code: "unsupported_claim",
          severity: "error",
          message: `The claim references undeclared source "${sourceId}".`,
          path: `claims.${index}.sourceIds`,
        });
      }
    }
  }

  if (new Date(record.validUntil).getTime() < asOf.getTime()) {
    issues.push({
      code: "stale_record",
      severity: "warning",
      message: `The record expired at ${record.validUntil}.`,
      path: "validUntil",
    });
  }

  const hasErrors = issues.some((issue) => issue.severity === "error");
  return {
    valid: !hasErrors,
    state: hasErrors ? "invalid" : issues.length > 0 ? "degraded" : "valid",
    issues,
    record,
  };
}

export const DEFAULT_SEARCH_LIMIT = 5;
export const MAX_SEARCH_LIMIT = 20;

/**
 * Freshness-aware ordering tier. `valid` records have no issues. `degraded`
 * records carry only warnings, which today means `stale_record`: they are
 * structurally sound but past `validUntil`. `invalid` records carry at least
 * one evidence error. A lower tier always ranks first; BM25F score only
 * orders records within the same tier. Title, then record ID, break score
 * ties, so the order never depends on input order.
 */
export const SEARCH_STATE_ORDER: Record<ValidationResult["state"], number> = {
  valid: 0,
  degraded: 1,
  invalid: 2,
};

/**
 * Clamps a requested result count to 1..MAX_SEARCH_LIMIT. Fractions round
 * down; a missing or non-numeric value falls back to DEFAULT_SEARCH_LIMIT.
 */
export function clampSearchLimit(limit = DEFAULT_SEARCH_LIMIT): number {
  if (Number.isNaN(limit)) return DEFAULT_SEARCH_LIMIT;
  return Math.max(1, Math.min(Math.floor(limit), MAX_SEARCH_LIMIT));
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function searchContext(
  records: unknown[],
  query: string,
  asOf = new Date(),
  limit = DEFAULT_SEARCH_LIMIT,
): SearchResult[] {
  const effectiveLimit = clampSearchLimit(limit);
  const queryTerms = [...new Set(tokenize(query))];
  if (queryTerms.length === 0) {
    return [];
  }

  const validated = records
    .map((input) => validateRecord(input, asOf))
    .filter(
      (result): result is ValidationResult & { record: ContextRecord } =>
        result.record !== undefined,
    );
  const ranking = buildRankingIndex(
    validated.map((result) => result.record),
  );

  return validated
    .map((result) => ({
      result,
      score: scoreRecord(ranking, result.record.id, queryTerms),
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        SEARCH_STATE_ORDER[left.result.state] -
          SEARCH_STATE_ORDER[right.result.state] ||
        right.score - left.score ||
        left.result.record.title.localeCompare(right.result.record.title) ||
        compareIds(left.result.record.id, right.result.record.id),
    )
    .slice(0, effectiveLimit)
    .map(({ result, score }) => ({
      id: result.record.id,
      title: result.record.title,
      summary: result.record.summary,
      owner: result.record.owner,
      score,
      state: result.state,
      issues: result.issues,
      sourceIds: result.record.sources.map((source) => source.id),
    }));
}

export function explainSource(
  records: unknown[],
  recordId: string,
  sourceId: string,
):
  | {
      found: true;
      recordId: string;
      source: ContextRecord["sources"][number];
      supportedClaims: string[];
    }
  | { found: false; message: string } {
  const match = records
    .map((record) => contextRecordSchema.safeParse(record))
    .find((result) => result.success && result.data.id === recordId);

  if (!match?.success) {
    return { found: false, message: `Record "${recordId}" was not found.` };
  }

  const source = match.data.sources.find((item) => item.id === sourceId);
  if (!source) {
    return {
      found: false,
      message: `Source "${sourceId}" was not found on record "${recordId}".`,
    };
  }

  return {
    found: true,
    recordId,
    source,
    supportedClaims: match.data.claims
      .filter((claim) => claim.sourceIds.includes(sourceId))
      .map((claim) => claim.text),
  };
}
