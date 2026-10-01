import { readFile, writeFile } from "node:fs/promises";

import { buildDiagnosticSnapshot } from "../dist/src/diagnostic-snapshot.js";

const copies = [];
const operationalFixture = JSON.parse(
  await readFile(
    new URL("../evals/operational-health.json", import.meta.url),
    "utf8",
  ),
);
const records = JSON.parse(
  await readFile(new URL("../data/context-records.json", import.meta.url), "utf8"),
);
copies.push({
  destination: "docs/operational-health.json",
  expected: `${JSON.stringify(
    buildDiagnosticSnapshot(operationalFixture.scenario, records),
    null,
    2,
  )}\n`,
});

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
  console.log("synced diagnostic sample to docs");
}
