import { z } from "zod";

export const sourceSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    url: z.string().url(),
    observedAt: z.string().datetime({ offset: true }),
  })
  .strict();

export const claimSchema = z
  .object({
    text: z.string().min(1),
    sourceIds: z.array(z.string().min(1)),
  })
  .strict();

export const contextRecordSchema = z
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

export type ContextRecord = z.infer<typeof contextRecordSchema>;

export type ValidationIssueCode =
  | "malformed_record"
  | "missing_provenance"
  | "stale_record"
  | "unsupported_claim";

export type ValidationIssue = {
  code: ValidationIssueCode;
  severity: "error" | "warning";
  message: string;
  path?: string;
};

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

function terms(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function occurrences(haystack: string[], needle: string): number {
  return haystack.filter((term) => term.includes(needle)).length;
}

function relevance(record: ContextRecord, queryTerms: string[]): number {
  const fields = [
    { terms: terms(record.title), weight: 5 },
    { terms: record.tags.flatMap(terms), weight: 4 },
    { terms: terms(record.summary), weight: 3 },
    { terms: terms(record.content), weight: 1 },
    { terms: record.claims.flatMap((claim) => terms(claim.text)), weight: 1 },
  ];

  return queryTerms.reduce(
    (total, queryTerm) =>
      total +
      fields.reduce(
        (fieldTotal, field) =>
          fieldTotal + occurrences(field.terms, queryTerm) * field.weight,
        0,
      ),
    0,
  );
}

export function searchContext(
  records: unknown[],
  query: string,
  asOf = new Date(),
): SearchResult[] {
  const queryTerms = [...new Set(terms(query))];
  if (queryTerms.length === 0) {
    return [];
  }

  return records
    .map((input) => validateRecord(input, asOf))
    .filter(
      (result): result is ValidationResult & { record: ContextRecord } =>
        result.record !== undefined,
    )
    .map((result) => ({
      result,
      score: relevance(result.record, queryTerms),
    }))
    .filter(({ score }) => score > 0)
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.result.record.title.localeCompare(right.result.record.title),
    )
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
