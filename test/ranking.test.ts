import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { buildRankingIndex, scoreRecord, tokenize, FIELD_WEIGHTS } from "../src/ranking.js";
import {
  DEFAULT_SEARCH_LIMIT,
  MAX_SEARCH_LIMIT,
  searchContext,
  type ContextRecord,
} from "../src/context.js";

function record(overrides: Partial<ContextRecord> & { id: string }): ContextRecord {
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
  test("extracts whole tokens, never substrings", () => {
    assert.deepEqual(tokenize("rollout"), ["rollout"]);
    assert.equal(tokenize("rollout").includes("out"), false);
  });

  test("removes stopwords", () => {
    assert.deepEqual(tokenize("the and of a"), []);
  });

  test("lowercases and drops punctuation", () => {
    assert.deepEqual(tokenize("Launch-Readiness!"), ["launch", "readiness"]);
  });
});

describe("BM25F scoring", () => {
  test("a record without the term scores zero", () => {
    const docs = [record({ id: "a", content: "alpha" })];
    const index = buildRankingIndex(docs);
    assert.equal(scoreRecord(index, "a", ["beta"]), 0);
  });

  test("IDF: a ubiquitous term is heavily discounted but not zeroed", () => {
    // The smoothed Robertson-Sparck-Jones idf, log(1 + (N-df+0.5)/(df+0.5)),
    // stays positive by construction — the +1 is what prevents the negative
    // scores the unsmoothed form produces once df exceeds N/2. So a term in
    // every record still contributes a little. Stopword removal, not IDF, is
    // what makes a query of "the" return nothing.
    const docs = [
      record({ id: "a", content: "shared rare" }),
      record({ id: "b", content: "shared" }),
      record({ id: "c", content: "shared" }),
    ];
    const index = buildRankingIndex(docs);
    const ubiquitous = scoreRecord(index, "a", ["shared"]);
    const rare = scoreRecord(index, "a", ["rare"]);

    assert.ok(ubiquitous > 0, "smoothed idf stays positive");
    assert.ok(
      rare > ubiquitous * 3,
      `a rare term should dominate a ubiquitous one (rare=${rare}, ubiquitous=${ubiquitous})`,
    );
  });

  test("a rare term outscores a common one", () => {
    const docs = [
      record({ id: "a", content: "common rare" }),
      record({ id: "b", content: "common" }),
      record({ id: "c", content: "common" }),
    ];
    const index = buildRankingIndex(docs);
    const rare = scoreRecord(index, "a", ["rare"]);
    const common = scoreRecord(index, "a", ["common"]);
    assert.ok(rare > common, `expected rare (${rare}) > common (${common})`);
  });

  test("field weighting: a title match outscores a content match", () => {
    const docs = [
      record({ id: "titled", title: "alpha", content: "filler filler" }),
      record({ id: "bodied", content: "alpha filler" }),
      record({ id: "other", content: "unrelated" }),
    ];
    const index = buildRankingIndex(docs);
    assert.ok(
      scoreRecord(index, "titled", ["alpha"]) > scoreRecord(index, "bodied", ["alpha"]),
    );
    assert.ok(FIELD_WEIGHTS.title > FIELD_WEIGHTS.content);
  });

  test("saturation: repeating a term does not scale the score linearly", () => {
    const docs = [
      record({ id: "once", content: "alpha" }),
      record({ id: "many", content: "alpha ".repeat(40).trim() }),
      record({ id: "other", content: "unrelated" }),
    ];
    const index = buildRankingIndex(docs);
    const once = scoreRecord(index, "once", ["alpha"]);
    const many = scoreRecord(index, "many", ["alpha"]);
    assert.ok(many < once * 5, `40x term frequency should not scale linearly (once=${once}, many=${many})`);
  });

  test("length normalization: a short record beats a long one padded with noise", () => {
    const docs = [
      record({ id: "short", content: "alpha" }),
      record({ id: "long", content: `alpha ${"noise ".repeat(200).trim()}` }),
      record({ id: "other", content: "unrelated" }),
    ];
    const index = buildRankingIndex(docs);
    assert.ok(scoreRecord(index, "short", ["alpha"]) > scoreRecord(index, "long", ["alpha"]));
  });

  test("an empty corpus does not throw", () => {
    const index = buildRankingIndex([]);
    assert.equal(scoreRecord(index, "missing", ["alpha"]), 0);
  });
});

describe("result bounding", () => {
  const AS_OF = new Date("2026-07-28T12:00:00Z");

  // searchContext validates before ranking, so bounding tests need records
  // that actually pass the schema — unlike the scoring tests above, which
  // call buildRankingIndex directly and never validate.
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

  test("an oversized limit is capped at MAX_SEARCH_LIMIT", () => {
    const docs = Array.from({ length: 40 }, (_, index) =>
      searchable(`r${index}`, `alpha filler${index}`),
    );
    const results = searchContext(docs, "alpha", AS_OF, 9999);
    assert.ok(
      results.length <= MAX_SEARCH_LIMIT,
      `expected at most ${MAX_SEARCH_LIMIT}, got ${results.length}`,
    );
  });

  test("a limit below one is clamped rather than returning nothing", () => {
    const docs = [searchable("a", "alpha one"), searchable("b", "alpha two")];
    const results = searchContext(docs, "alpha", AS_OF, 0);
    assert.equal(results.length, 1, "a zero limit should clamp to 1, not return nothing");
  });

  test("the default limit applies when none is supplied", () => {
    const docs = Array.from({ length: 12 }, (_, index) =>
      searchable(`r${index}`, `alpha filler${index}`),
    );
    const results = searchContext(docs, "alpha", AS_OF);
    assert.equal(results.length, DEFAULT_SEARCH_LIMIT);
  });
});
