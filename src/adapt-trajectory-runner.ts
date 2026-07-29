#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { adaptTrajectoryRuns } from "./trajectory-adapter.js";

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const inputPath = argumentValue("--input");
const outputPath = argumentValue("--output");
if (!inputPath) {
  throw new Error(
    "Usage: npm run adapt:trajectory -- --input FILE [--output FILE]",
  );
}

const input = JSON.parse(await readFile(resolve(inputPath), "utf8"));
const snapshot = adaptTrajectoryRuns(input);
const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;

if (outputPath) {
  await writeFile(resolve(outputPath), serialized);
  console.log(`wrote trajectory diagnostic to ${resolve(outputPath)}`);
} else {
  process.stdout.write(serialized);
}
