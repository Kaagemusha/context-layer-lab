#!/usr/bin/env node

import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { adaptReliabilityRollup } from "./reliability-adapter.js";

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const inputPath = argumentValue("--input");
const outputPath = argumentValue("--output");
const sourceBaseUrl = argumentValue("--source-base-url");
if (!inputPath || !sourceBaseUrl) {
  throw new Error(
    "Usage: npm run adapt:reliability -- --input FILE --source-base-url URL [--output FILE]",
  );
}

const input = JSON.parse(await readFile(resolve(inputPath), "utf8"));
const snapshot = adaptReliabilityRollup(input, sourceBaseUrl);
const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;

if (outputPath) {
  await writeFile(resolve(outputPath), serialized);
  console.log(`wrote reliability diagnostic to ${resolve(outputPath)}`);
} else {
  process.stdout.write(serialized);
}
