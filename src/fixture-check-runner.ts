import { readFile } from "node:fs/promises";

import { validateRecord } from "./context.js";
import { operationalScenarioSchema } from "./operational-health.js";
import { snapshotMetadataSchema } from "./store.js";

const root = new URL("../../", import.meta.url);
const [metadataInput, scenarioInput, records] = await Promise.all([
  readFile(new URL("data/snapshot-metadata.json", root), "utf8").then(
    JSON.parse,
  ),
  readFile(new URL("evals/operational-health.json", root), "utf8").then(
    JSON.parse,
  ),
  readFile(new URL("data/context-records.json", root), "utf8").then(
    JSON.parse,
  ),
]);

const metadata = snapshotMetadataSchema.parse(metadataInput);
const scenario = operationalScenarioSchema.parse(scenarioInput.scenario);
if (scenario.asOf !== metadata.snapshotAsOf) {
  throw new Error(
    `Scenario asOf ${scenario.asOf} does not match declared snapshot time ${metadata.snapshotAsOf}.`,
  );
}

const asOf = new Date(metadata.snapshotAsOf);
const intentional = new Set(metadata.intentionalStaleRecordIds);
const observedIntentional = new Set<string>();
const failures: string[] = [];

for (const record of records) {
  const result = validateRecord(record, asOf);
  if (!result.record) {
    failures.push(`malformed record: ${JSON.stringify(record)}`);
    continue;
  }
  const stale = result.issues.some(
    (issue) => issue.code === "stale_record",
  );
  if (intentional.has(result.record.id)) {
    if (!stale || result.state !== "degraded") {
      failures.push(
        `${result.record.id} should be deliberately stale at ${metadata.snapshotAsOf}`,
      );
    }
    observedIntentional.add(result.record.id);
  } else if (result.state !== "valid") {
    failures.push(
      `${result.record.id} should be valid at ${metadata.snapshotAsOf}, got ${result.state}`,
    );
  }
}

for (const id of intentional) {
  if (!observedIntentional.has(id)) {
    failures.push(`declared intentional stale record "${id}" was not found`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) {
    console.error(`FAIL ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    `fixture states match declared snapshot time ${metadata.snapshotAsOf}`,
  );
}
