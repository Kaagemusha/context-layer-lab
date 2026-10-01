import { readFile } from "node:fs/promises";

import { renderDemo } from "./demo.js";

const [fixture, records] = await Promise.all([
  readFile(new URL("../../evals/operational-health.json", import.meta.url), "utf8").then(JSON.parse),
  readFile(new URL("../../data/context-records.json", import.meta.url), "utf8").then(JSON.parse),
]);

process.stdout.write(renderDemo(fixture.scenario, records));
