import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { renderDemo } from "../src/demo.js";

const fixture = JSON.parse(
  await readFile(
    new URL("../../evals/operational-health.json", import.meta.url),
    "utf8",
  ),
);
const records = JSON.parse(
  await readFile(
    new URL("../../data/context-records.json", import.meta.url),
    "utf8",
  ),
);

test("npm run demo prints the pinned naive and governed answers", () => {
  assert.equal(
    renderDemo(fixture.scenario, records),
    [
      "Question: Are all scheduled automations healthy?",
      "As of:    2026-07-28T09:10:00Z",
      "",
      "Naive answer:    healthy. It repeats the dashboard observed at 2026-07-28T07:30:00Z.",
      "Governed answer: attention. 2 of 3 due lanes need attention.",
      "",
      "Why:",
      "- The dashboard record is stale. The record expired at 2026-07-28T07:55:00Z.",
      "- 3 newer run receipts supersede it.",
      "- Docs Build: failed (docs-build-receipt).",
      "- Weekly Report: preserved_local (weekly-report-receipt).",
      "- Data Sync: not due yet, so it is not counted as failed.",
      "",
    ].join("\n"),
  );
});

test("the README shows the demo output exactly as it prints", async () => {
  const readme = await readFile(
    new URL("../../README.md", import.meta.url),
    "utf8",
  );
  assert.ok(readme.includes("```text\n" + renderDemo(fixture.scenario, records) + "```"));
});
