import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

// Optional overrides, used by the tests: --metadata FILE and --now ISO.
function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const metadataPath = argumentValue("--metadata");
const metadata = JSON.parse(
  await readFile(
    metadataPath
      ? resolve(metadataPath)
      : new URL("../data/snapshot-metadata.json", import.meta.url),
    "utf8",
  ),
);
const nowInput = argumentValue("--now");
const now = nowInput === undefined ? Date.now() : new Date(nowInput).getTime();
const snapshotTime = new Date(metadata.snapshotAsOf).getTime();
if (Number.isNaN(now) || Number.isNaN(snapshotTime)) {
  console.error("The snapshot time or the current time is not a valid date.");
  process.exit(1);
}
const ageDays = Math.floor((now - snapshotTime) / (24 * 60 * 60 * 1000));
const retention = metadata.retention;
const retained =
  retention !== undefined && now <= new Date(retention.until).getTime();

if (ageDays <= metadata.ageThresholdDays) {
  console.log(
    `public sample age ${ageDays} days (threshold ${metadata.ageThresholdDays})`,
  );
} else if (retained) {
  console.log(
    `public sample age ${ageDays} days, explicitly retained until ${retention.until}: ${retention.reason}`,
  );
} else {
  console.error(
    retention
      ? `The public sample is ${ageDays} days old and its retention expired on ${retention.until}; refresh or retain it again.`
      : `The public sample is ${ageDays} days old; refresh or explicitly retain it.`,
  );
  process.exitCode = 1;
}
