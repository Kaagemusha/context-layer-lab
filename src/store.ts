import { readFile } from "node:fs/promises";

const recordsUrl = new URL("../../data/context-records.json", import.meta.url);

export async function loadRecords(): Promise<unknown[]> {
  const value: unknown = JSON.parse(await readFile(recordsUrl, "utf8"));
  if (!Array.isArray(value)) {
    throw new Error("data/context-records.json must contain an array");
  }
  return value;
}
