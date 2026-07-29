import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  searchContext,
  type ContextRecord,
} from "../src/context.js";
import {
  buildRankingIndex,
  FIELD_WEIGHTS,
  scoreRecord,
  tokenize,
} from "../src/ranking.js";

function record(
  overrides: Partial<ContextRecord> & { id: string },
): ContextRecord {
  return {
    title: "",
    summary: "",
    content: "",
    tags: [],
    owner: "Owner",
    updatedAt: "2026-07-20T12:00:00Z",
    validUntil: "2026-08-20T12:00:00Z",
    sources: [],
    claims: [],
    ...overrides,
  } as ContextRecord;
}

describe("tokenize", () => {
  test("extracts whole tokens rather than substrings", () => {
    assert.deepEqual(tokenize("rollout"), ["rollout"]);
    assert.equal(tokenize("rollout").includes("out"), false);
  });

  test("removes stopwords", () => {
    assert.deepEqual(tokenize("the and of a"), []);
  });

  test("preserves uppercase acronyms that overlap stopwords", () => {
    assert.deepEqual(tokenize("IT supports it"), ["it", "supports"]);
  });

  test("normalizes case and punctuation", () => {
    assert.deepEqual(tokenize("Launch-Readiness!"), [
      "launch",
      "readiness",
    ]);
  });
});

describe("BM25F scoring", () => {
  test("returns zero when a record does not contain the term", () => {
    const documents = [record({ id: "a", content: "alpha" })];
    const index = buildRankingIndex(documents);
    assert.equal(scoreRecord(index, "a", ["beta"]), 0);
  });

  test("a rare term outscores a ubiquitous term", () => {
    const documents = [
      record({ id: "a", content: "shared rare" }),
      record({ id: "b", content: "shared" }),
      record({ id: "c", content: "shared" }),
    ];
    const index = buildRankingIndex(documents);
    const ubiquitous = scoreRecord(index, "a", ["shared"]);
    const rare = scoreRecord(index, "a", ["rare"]);

    assert.ok(ubiquitous > 0);
    assert.ok(rare > ubiquitous * 3);
  });

  test("a title match outscores a content match", () => {
    const documents = [
      record({
        id: "title",
        title: "alpha",
        content: "filler filler",
      }),
      record({ id: "body", content: "alpha filler" }),
      record({ id: "other", content: "unrelated" }),
    ];
    const index = buildRankingIndex(documents);

    assert.ok(
      scoreRecord(index, "title", ["alpha"]) >
        scoreRecord(index, "body", ["alpha"]),
    );
    assert.ok(FIELD_WEIGHTS.title > FIELD_WEIGHTS.content);
  });

  test("repeated terms saturate rather than scaling linearly", () => {
    const documents = [
      record({ id: "once", content: "alpha" }),
      record({ id: "many", content: "alpha ".repeat(40).trim() }),
      record({ id: "other", content: "unrelated" }),
    ];
    const index = buildRankingIndex(documents);
    const once = scoreRecord(index, "once", ["alpha"]);
    const many = scoreRecord(index, "many", ["alpha"]);

    assert.ok(many < once * 5);
  });

  test("length normalization favors focused records", () => {
    const documents = [
      record({ id: "short", content: "alpha" }),
      record({
        id: "long",
        content: `alpha ${"noise ".repeat(200).trim()}`,
      }),
      record({ id: "other", content: "unrelated" }),
    ];
    const index = buildRankingIndex(documents);

    assert.ok(
      scoreRecord(index, "short", ["alpha"]) >
        scoreRecord(index, "long", ["alpha"]),
    );
  });

  test("handles an empty corpus", () => {
    const index = buildRankingIndex([]);
    assert.equal(scoreRecord(index, "missing", ["alpha"]), 0);
  });

  test("rejects duplicate record IDs", () => {
    assert.throws(
      () =>
        buildRankingIndex([
          record({ id: "duplicate", content: "alpha" }),
          record({ id: "duplicate", content: "beta" }),
        ]),
      /Ranking records must have unique IDs: "duplicate"/,
    );
  });
});

describe("result bounds", () => {
  const asOf = new Date("2026-07-28T12:00:00Z");

  function searchable(id: string, content: string): ContextRecord {
    return record({
      id,
      title: `Record ${id}`,
      summary: `Summary for ${id}`,
      content,
      tags: ["bounding"],
      sources: [
        {
          id: `${id}-source`,
          label: "Source",
          url: "https://example.invalid/source",
          observedAt: "2026-07-20T12:00:00Z",
        },
      ],
      claims: [{ text: content, sourceIds: [`${id}-source`] }],
    });
  }

  test("caps an oversized limit", () => {
    const documents = Array.from({ length: 40 }, (_, index) =>
      searchable(`r${index}`, `alpha filler${index}`),
    );
    const results = searchContext(documents, "alpha", asOf, 9999);
    assert.ok(results.length <= MAX_SEARCH_LIMIT);
  });

  test("clamps a limit below one", () => {
    const documents = [
      searchable("a", "alpha one"),
      searchable("b", "alpha two"),
    ];
    assert.equal(searchContext(documents, "alpha", asOf, 0).length, 1);
  });

  test("uses the default limit", () => {
    const documents = Array.from({ length: 12 }, (_, index) =>
      searchable(`r${index}`, `alpha filler${index}`),
    );
    assert.equal(
      searchContext(documents, "alpha", asOf).length,
      DEFAULT_SEARCH_LIMIT,
    );
  });
});
