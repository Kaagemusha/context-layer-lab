import { readFile, writeFile } from "node:fs/promises";

const files = [
  ["data/context-records.json", "docs/records.json"],
  ["data/ingestion-receipts.json", "docs/receipts.json"],
];
const copies = await Promise.all(
  files.map(async ([source, destination]) => ({
    destination,
    expected: await readFile(new URL(`../${source}`, import.meta.url), "utf8"),
  })),
);

if (process.argv.includes("--check")) {
  let stale = false;
  for (const copy of copies) {
    const actual = await readFile(
      new URL(`../${copy.destination}`, import.meta.url),
      "utf8",
    ).catch(() => "");
    if (actual !== copy.expected) {
      console.error(`${copy.destination} is stale; run npm run demo:sync`);
      stale = true;
    }
  }
  if (!stale) {
    console.log("demo data is in sync");
  } else {
    process.exitCode = 1;
  }
} else {
  await Promise.all(
    copies.map((copy) =>
      writeFile(
        new URL(`../${copy.destination}`, import.meta.url),
        copy.expected,
      ),
    ),
  );
  console.log("synced generated records and receipts to docs");
}
