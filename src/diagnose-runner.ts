import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { buildDiagnosticSnapshot } from "./diagnostic-snapshot.js";

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}

if (process.argv.includes("--help")) {
  console.log(`Usage:
  npm run diagnose -- [--scenario FILE] [--records FILE] [--output FILE]

Defaults:
  --scenario evals/operational-health.json
  --records  data/context-records.json

The scenario file may contain the scenario directly or under a "scenario" key.
Without --output, the snapshot is written to stdout.`);
  process.exit(0);
}

const scenarioPath = resolve(
  argumentValue("--scenario") ?? "evals/operational-health.json",
);
const recordsPath = resolve(
  argumentValue("--records") ?? "data/context-records.json",
);
const outputPath = argumentValue("--output");
const [scenarioInput, records] = await Promise.all([
  readFile(scenarioPath, "utf8").then(JSON.parse),
  readFile(recordsPath, "utf8").then(JSON.parse),
]);
const snapshot = buildDiagnosticSnapshot(
  scenarioInput.scenario ?? scenarioInput,
  records,
);
const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;

if (outputPath) {
  await writeFile(resolve(outputPath), serialized);
  console.log(`wrote diagnostic snapshot to ${resolve(outputPath)}`);
} else {
  process.stdout.write(serialized);
}
