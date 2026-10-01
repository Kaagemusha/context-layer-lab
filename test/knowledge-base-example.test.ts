import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import test from "node:test";

const exec = promisify(execFile);

test("the knowledge-base example runs and flags the stale record", async () => {
  const script = fileURLToPath(
    new URL("../examples/knowledge-base.js", import.meta.url),
  );
  const { stdout } = await exec(process.execPath, [script]);
  assert.equal(
    stdout,
    [
      "degraded [ 'stale_record' ]",
      "refund-policy-2026 valid 0.25",
      "refund-policy-2025 degraded 0.32",
      "",
    ].join("\n"),
  );
});

test("docs/how-to-adopt.md shows the example exactly as it runs", async () => {
  const [source, doc] = await Promise.all([
    readFile(new URL("../../examples/knowledge-base.ts", import.meta.url), "utf8"),
    readFile(new URL("../../docs/how-to-adopt.md", import.meta.url), "utf8"),
  ]);
  assert.ok(doc.includes("```ts\n" + source + "```"));
});
