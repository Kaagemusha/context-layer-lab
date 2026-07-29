import { readFile } from "node:fs/promises";

const metadata = JSON.parse(
  await readFile(
    new URL("../data/snapshot-metadata.json", import.meta.url),
    "utf8",
  ),
);
const ageDays =
  (Date.now() - new Date(metadata.snapshotAsOf).getTime()) /
  (24 * 60 * 60 * 1000);

if (ageDays > metadata.ageThresholdDays) {
  console.error(
    `The public sample is ${Math.floor(ageDays)} days old; refresh or explicitly retain it.`,
  );
  process.exitCode = 1;
} else {
  console.log(
    `public sample age ${Math.floor(ageDays)} days (threshold ${metadata.ageThresholdDays})`,
  );
}
