#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { access, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { adaptReliabilityRollup } from "./reliability-adapter.js";

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const vaultRoot = argumentValue("--vault-root");
const outputPath = argumentValue("--output");
if (!vaultRoot) {
  throw new Error(
    "Usage: npm run diagnose:vault -- --vault-root DIRECTORY [--output FILE]",
  );
}

const root = resolve(vaultRoot);
const rollupScript = join(root, "artifacts", "reliability-rollup.mjs");
await access(rollupScript);

const rollup = JSON.parse(
  execFileSync(
    process.execPath,
    [rollupScript, "--root", root, "--json"],
    { encoding: "utf8", maxBuffer: 5 * 1024 * 1024 },
  ),
);
const snapshot = adaptReliabilityRollup(
  rollup,
  pathToFileURL(`${root}/`).toString(),
);
const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;

if (outputPath) {
  await writeFile(resolve(outputPath), serialized);
  console.log(`wrote vault reliability diagnostic to ${resolve(outputPath)}`);
} else {
  process.stdout.write(serialized);
}
