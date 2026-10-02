// The README badge and summary state how many evals pass. They are written by
// hand, so this check reads the generated eval report and fails on drift.
import { readFileSync } from "node:fs";

const report = readFileSync("docs/eval-report.md", "utf8").replace(/\s+/g, " ");
const total = Number(report.match(/\*\*(\d+)\/\1 deterministic evaluations pass/)?.[1]);
const record = Number(report.match(/Record and operational: (\d+)\/\1/)?.[1]);
const retrieval = Number(report.match(/Retrieval[^0-9]*(\d+)\/\1/)?.[1]);
if (![total, record, retrieval].every(Number.isInteger) || record + retrieval !== total) {
  throw new Error("Could not read consistent totals from docs/eval-report.md.");
}
const readme = readFileSync("README.md", "utf8").replace(/\s+/g, " ");
const phrases = [
  `eval-${total}%2F${total}`,
  `${total} deterministic cases pass`,
  `(${record} record and operational, ${retrieval} retrieval)`,
];
const missing = phrases.filter((phrase) => !readme.includes(phrase));
if (missing.length > 0) {
  console.error(`README counts are out of date (${total} evals):\n${missing.map((phrase) => `"${phrase}"`).join("\n")}`);
  process.exit(1);
}
console.log(`public counts match: ${total} evals (${record} record and operational, ${retrieval} retrieval)`);
