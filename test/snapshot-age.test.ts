import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(
  new URL("../../scripts/check-snapshot-age.mjs", import.meta.url),
);

const base = {
  snapshotAsOf: "2026-07-28T09:10:00Z",
  ageThresholdDays: 45,
  intentionalStaleRecordIds: [],
};

async function runCheck(metadata: object, now: string) {
  const directory = await mkdtemp(join(tmpdir(), "snapshot-age-"));
  try {
    const path = join(directory, "metadata.json");
    await writeFile(path, JSON.stringify(metadata));
    const result = spawnSync(
      process.execPath,
      [script, "--metadata", path, "--now", now],
      { encoding: "utf8" },
    );
    return { status: result.status, output: result.stdout + result.stderr };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

const retention = { until: "2027-03-31T00:00:00Z", reason: "Pinned sample." };

test("a sample within its threshold passes", async () => {
  const result = await runCheck(base, "2026-09-01T00:00:00Z");
  assert.equal(result.status, 0);
  assert.match(result.output, /age 34 days \(threshold 45\)/);
});

test("an old sample without retention fails", async () => {
  const result = await runCheck(base, "2026-10-01T00:00:00Z");
  assert.equal(result.status, 1);
  assert.match(result.output, /refresh or explicitly retain it/);
});

test("an old sample passes while its retention is in force, up to the instant it lapses", async () => {
  for (const now of ["2026-10-01T00:00:00Z", retention.until]) {
    const result = await runCheck({ ...base, retention }, now);
    assert.equal(result.status, 0, now);
    assert.match(result.output, /explicitly retained until 2027-03-31/);
  }
});

test("an old sample fails again once its retention lapses", async () => {
  const result = await runCheck(
    { ...base, retention },
    "2027-03-31T00:00:00.001Z",
  );
  assert.equal(result.status, 1);
  assert.match(result.output, /retention expired on 2027-03-31/);
});

test("an unreadable snapshot time fails closed", async () => {
  const result = await runCheck(
    { ...base, snapshotAsOf: "not-a-date", retention },
    "2026-10-01T00:00:00Z",
  );
  assert.equal(result.status, 1);
});
