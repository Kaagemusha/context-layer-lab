// BM25F ranking for context records.
//
// Replaces a weighted term-count scorer. The count-based approach had three
// defects. All three were reproduced against this repository's own
// three-record corpus, so they were observable here, not merely theoretical -
// they are simply easy to miss in a small corpus unless something checks for
// them. That is what the retrieval evaluations now do:
//
//   1. No IDF. Every query term counted equally, so a common word contributed
//      as much as a rare, distinctive one.
//   2. No length normalization or saturation. A record mentioning a term forty
//      times scored forty times higher, so long records dominated regardless
//      of how well they matched.
//   3. Substring matching. `occurrences` used `String.includes`, so the query
//      "out" matched a record containing "rollout".
//
// BM25F addresses all three. Each field is normalized by its own length before
// the weighted combination, and saturation is applied once to the combined
// pseudo-frequency:
//
//   tf~_f  = tf_f / (1 - b + b * len_f / avglen_f)     per field
//   pseudo = Σ_f  w_f * tf~_f                          weighted sum
//   score  = idf * pseudo / (k1 + pseudo)              saturate once
//
// Field weights are unchanged from the previous scorer so the ranking's
// intent is preserved: title and tags are curated, content is not.

import type { ContextRecord } from "./context.js";

const K1 = 1.2;
const B = 0.75;

/** Field weights. Curated fields outrank free text. */
export const FIELD_WEIGHTS = {
  title: 5,
  tags: 4,
  summary: 3,
  content: 1,
  claims: 1,
} as const;

export type FieldName = keyof typeof FIELD_WEIGHTS;

/**
 * Very common English words carry no discriminating signal. IDF already
 * discounts them, but only relative to the corpus at hand — on a three-record
 * corpus a stopword present in all three still scores above zero. Removing
 * them explicitly means a query of "the" returns nothing rather than a
 * confident ranking.
 */
const STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
  "has", "have", "in", "is", "it", "its", "of", "on", "or", "that", "the",
  "this", "to", "was", "were", "will", "with",
]);

/** Whole-token extraction. Not substrings: "out" must not match "rollout". */
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
  /** term -> record id -> per-field raw frequency */
  postings: Map<string, Map<string, Partial<Record<FieldName, number>>>>;
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
    title: 0, tags: 0, summary: 0, content: 0, claims: 0,
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
      documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
    }
  }

  const size = records.length || 1;
  const averageFieldLength = Object.fromEntries(
    (Object.keys(FIELD_WEIGHTS) as FieldName[]).map((field) => [
      field,
      totals[field] / size || 1,
    ]),
  ) as Record<FieldName, number>;

  return { postings, fieldLengths, averageFieldLength, documentFrequency, size: records.length };
}

/** BM25F score for one record against pre-tokenized query terms. */
export function scoreRecord(
  index: RankingIndex,
  recordId: string,
  queryTerms: string[],
): number {
  let score = 0;

  for (const term of new Set(queryTerms)) {
    const perField = index.postings.get(term)?.get(recordId);
    if (!perField) continue;

    const df = index.documentFrequency.get(term) ?? 0;
    // Robertson-Sparck-Jones IDF, floored at zero so a term in most records
    // cannot drive a score negative.
    const idf = Math.max(0, Math.log(1 + (index.size - df + 0.5) / (df + 0.5)));
    if (idf === 0) continue;

    const lengths = index.fieldLengths.get(recordId);
    let pseudo = 0;

    for (const field of Object.keys(FIELD_WEIGHTS) as FieldName[]) {
      const raw = perField[field];
      if (!raw) continue;
      const normalizer =
        1 - B + B * ((lengths?.[field] ?? 0) / (index.averageFieldLength[field] || 1));
      pseudo += FIELD_WEIGHTS[field] * (raw / (normalizer || 1));
    }

    score += idf * (pseudo / (K1 + pseudo));
  }

  return score;
}
