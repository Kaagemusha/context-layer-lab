#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { access, readFile, writeFile } from "node:fs/promises";
import { isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { adaptReliabilityRollup } from "./reliability-adapter.js";
import { verifyDiagnosticSnapshot } from "./diagnostic-snapshot.js";
import { buildOperatorBrief, renderOperatorBrief } from "./operator-brief.js";

function argumentValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const vaultRoot = argumentValue("--vault-root");
const outputPath = argumentValue("--output");
const briefOutputPath = argumentValue("--brief-output");
const previousPath = argumentValue("--previous");
if (!vaultRoot) {
  throw new Error(
    "Usage: npm run diagnose:vault -- --vault-root DIRECTORY [--output FILE] [--brief-output FILE] [--previous SNAPSHOT]",
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
const adapted = adaptReliabilityRollup(
  rollup,
  pathToFileURL(`${root}/`).toString(),
);
const snapshot = {
  ...adapted,
  records: await Promise.all(adapted.records.map(async (record) => ({
    ...record,
    sources: await Promise.all(record.sources.map(async (source) => {
      const url = new URL(source.url);
      if (url.protocol !== "file:") return source;
      const sourcePath = resolve(fileURLToPath(url));
      const pathFromRoot = relative(root, sourcePath);
      if (pathFromRoot === ".." || pathFromRoot.startsWith(`..${sep}`) || isAbsolute(pathFromRoot)) {
        throw new Error(`Diagnostic source escapes vault root: ${source.label}`);
      }
      const bytes = await readFile(sourcePath);
      return { ...source, contentHash: createHash("sha256").update(bytes).digest("hex") };
    })),
  }))),
};
const serialized = `${JSON.stringify(snapshot, null, 2)}\n`;

let previous;
if (previousPath) {
  try {
    previous = verifyDiagnosticSnapshot(
      JSON.parse(await readFile(resolve(previousPath), "utf8")),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`previous snapshot ignored: ${message}`);
    previous = undefined;
  }
}

if (briefOutputPath) {
  const brief = buildOperatorBrief(rollup, snapshot, previous);
  await writeFile(resolve(briefOutputPath), renderOperatorBrief(brief));
}

if (outputPath) {
  await writeFile(resolve(outputPath), serialized);
  console.log(`wrote vault reliability diagnostic to ${resolve(outputPath)}`);
} else {
  process.stdout.write(serialized);
}
