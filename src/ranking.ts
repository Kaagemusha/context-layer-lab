import type { ContextRecord } from "./context.js";

const K1 = 1.2;
const B = 0.75;

export const FIELD_WEIGHTS = {
  title: 5,
  tags: 4,
  summary: 3,
  content: 1,
  claims: 1,
} as const;

export type FieldName = keyof typeof FIELD_WEIGHTS;

const STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "but",
  "by",
  "for",
  "from",
  "has",
  "have",
  "in",
  "is",
  "it",
  "its",
  "of",
  "on",
  "or",
  "that",
  "the",
  "this",
  "to",
  "was",
  "were",
  "will",
  "with",
]);

export function tokenize(value: string): string[] {
  return (value.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (token) => !STOPWORDS.has(token),
  );
}

function fieldTokens(record: ContextRecord): Record<FieldName, string[]> {
  return {
    title: tokenize(record.title),
    tags: record.tags.flatMap(tokenize),
    summary: tokenize(record.summary),
    content: tokenize(record.content),
    claims: record.claims.flatMap((claim) => tokenize(claim.text)),
  };
}

export type RankingIndex = {
  postings: Map<
    string,
    Map<string, Partial<Record<FieldName, number>>>
  >;
  fieldLengths: Map<string, Record<FieldName, number>>;
  averageFieldLength: Record<FieldName, number>;
  documentFrequency: Map<string, number>;
  size: number;
};

export function buildRankingIndex(records: ContextRecord[]): RankingIndex {
  const postings: RankingIndex["postings"] = new Map();
  const fieldLengths: RankingIndex["fieldLengths"] = new Map();
  const documentFrequency = new Map<string, number>();
  const totals: Record<FieldName, number> = {
    title: 0,
    tags: 0,
    summary: 0,
    content: 0,
    claims: 0,
  };

  for (const record of records) {
    const byField = fieldTokens(record);
    const lengths = {} as Record<FieldName, number>;
    const seen = new Set<string>();

    for (const field of Object.keys(FIELD_WEIGHTS) as FieldName[]) {
      const tokens = byField[field];
      lengths[field] = tokens.length;
      totals[field] += tokens.length;

      for (const token of tokens) {
        let byRecord = postings.get(token);
        if (!byRecord) {
          byRecord = new Map();
          postings.set(token, byRecord);
        }
        const perField = byRecord.get(record.id) ?? {};
        perField[field] = (perField[field] ?? 0) + 1;
        byRecord.set(record.id, perField);
        seen.add(token);
      }
    }

    fieldLengths.set(record.id, lengths);
    for (const token of seen) {
      documentFrequency.set(
        token,
        (documentFrequency.get(token) ?? 0) + 1,
      );
    }
  }

  const divisor = records.length || 1;
  const averageFieldLength = Object.fromEntries(
    (Object.keys(FIELD_WEIGHTS) as FieldName[]).map((field) => [
      field,
      totals[field] / divisor || 1,
    ]),
  ) as Record<FieldName, number>;

  return {
    postings,
    fieldLengths,
    averageFieldLength,
    documentFrequency,
    size: records.length,
  };
}

export function scoreRecord(
  index: RankingIndex,
  recordId: string,
  queryTerms: string[],
): number {
  let score = 0;

  for (const term of new Set(queryTerms)) {
    const perField = index.postings.get(term)?.get(recordId);
    if (!perField) {
      continue;
    }

    const documentFrequency = index.documentFrequency.get(term) ?? 0;
    const inverseDocumentFrequency = Math.log(
      1 +
        (index.size - documentFrequency + 0.5) /
          (documentFrequency + 0.5),
    );
    const lengths = index.fieldLengths.get(recordId);
    let pseudoFrequency = 0;

    for (const field of Object.keys(FIELD_WEIGHTS) as FieldName[]) {
      const rawFrequency = perField[field];
      if (!rawFrequency) {
        continue;
      }
      const normalizer =
        1 -
        B +
        B *
          ((lengths?.[field] ?? 0) /
            (index.averageFieldLength[field] || 1));
      pseudoFrequency +=
        FIELD_WEIGHTS[field] * (rawFrequency / (normalizer || 1));
    }

    score +=
      inverseDocumentFrequency *
      (pseudoFrequency / (K1 + pseudoFrequency));
  }

  return score;
}
