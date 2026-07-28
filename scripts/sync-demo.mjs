import { readFile, writeFile } from "node:fs/promises";

const source = new URL("../data/context-records.json", import.meta.url);
const destination = new URL("../docs/records.json", import.meta.url);
const expected = await readFile(source, "utf8");

if (process.argv.includes("--check")) {
  const actual = await readFile(destination, "utf8").catch(() => "");
  if (actual !== expected) {
    console.error("docs/records.json is stale; run npm run demo:sync");
    process.exitCode = 1;
  } else {
    console.log("demo data is in sync");
  }
} else {
  await writeFile(destination, expected);
  console.log("synced data/context-records.json -> docs/records.json");
}
