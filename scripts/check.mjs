// The full suite behind `npm run check`. It compiles once, then runs every
// check against that build. The individual npm scripts still build first,
// so each one also works on its own.
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const node = process.execPath;
const tests = () =>
  readdirSync("dist/test")
    .filter((name) => name.endsWith(".test.js"))
    .sort()
    .map((name) => `dist/test/${name}`);

const steps = [
  ["public-safety scan", [node, "scripts/check-public-safety.mjs"]],
  ["clean build and typecheck", ["npm", "run", "build", "--silent"]],
  ["unit and contract tests", () => [node, "--test", ...tests()]],
  ["record and operational evals", [node, "dist/src/eval-runner.js"]],
  ["retrieval evals", [node, "dist/src/retrieval-eval-runner.js"]],
  ["eval report in sync", [node, "dist/src/eval-report.js", "--check"]],
  ["ingested data in sync", [node, "dist/src/ingest-runner.js", "--check"]],
  ["fixture states", [node, "dist/src/fixture-check-runner.js"]],
  ["browser runtime in sync", [node, "scripts/build-browser-runtime.mjs", "--check"]],
  ["demo data in sync", [node, "scripts/sync-demo.mjs", "--check"]],
  ["demo", [node, "dist/src/demo-runner.js"]],
];

for (const [label, command] of steps) {
  const [program, ...args] = typeof command === "function" ? command() : command;
  console.log(`\n== ${label}`);
  const result = spawnSync(program, args, { stdio: "inherit" });
  if (result.status !== 0) {
    console.error(`\ncheck failed at: ${label}`);
    process.exit(result.status ?? 1);
  }
}
console.log("\nall checks passed");
