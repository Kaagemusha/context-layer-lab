import { readFile, writeFile } from "node:fs/promises";

import { ingestDirectory } from "./ingest.js";

const sourceDirectory = new URL("../../fixtures/source-docs/", import.meta.url);
const recordsUrl = new URL("../../data/context-records.json", import.meta.url);
const receiptsUrl = new URL(
  "../../data/ingestion-receipts.json",
  import.meta.url,
);
const snapshot = await ingestDirectory(sourceDirectory);
const outputs = [
  {
    label: "data/context-records.json",
    url: recordsUrl,
    content: `${JSON.stringify(snapshot.records, null, 2)}\n`,
  },
  {
    label: "data/ingestion-receipts.json",
    url: receiptsUrl,
    content: `${JSON.stringify(snapshot.receipts, null, 2)}\n`,
  },
];

if (process.argv.includes("--check")) {
  let stale = false;
  for (const output of outputs) {
    const actual = await readFile(output.url, "utf8").catch(() => "");
    if (actual !== output.content) {
      console.error(`${output.label} is stale; run npm run ingest`);
      stale = true;
    }
  }
  if (stale) {
    process.exitCode = 1;
  } else {
    console.log("ingested records and receipts are in sync");
  }
} else {
  await Promise.all(
    outputs.map((output) => writeFile(output.url, output.content)),
  );
  console.log(
    `ingested ${snapshot.records.length} Markdown documents with deterministic receipts`,
  );
}
