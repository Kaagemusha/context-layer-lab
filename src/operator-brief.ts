import type { DiagnosticSnapshot } from "./diagnostic-snapshot.js";
import {
  reliabilityCoverage,
  reliabilityRollupSchema,
  type ReliabilityCoverage,
} from "./reliability-adapter.js";

export type OperatorBrief = {
  state: "HEALTHY" | "ATTENTION" | "UNKNOWN";
  coverage: ReliabilityCoverage;
  change: "baseline" | "changed" | "unchanged";
  changeSummary: string;
  evidenceAsOf: string;
  nextAction: string;
};

function laneState(snapshot: DiagnosticSnapshot): string {
  return snapshot.assessment.laneAssessments
    .map((lane) => `${lane.id}:${lane.state}:${lane.outcome ?? "none"}`)
    .sort()
    .join("|");
}

export function buildOperatorBrief(
  rollupInput: unknown,
  snapshot: DiagnosticSnapshot,
  previous?: DiagnosticSnapshot,
): OperatorBrief {
  const rollup = reliabilityRollupSchema.parse(rollupInput);
  const coverage = reliabilityCoverage(rollup.patrol);
  const attention = snapshot.assessment.laneAssessments
    .filter((lane) => lane.state === "attention" || lane.state === "missing")
    .map((lane) => lane.label);
  const independentAttention = snapshot.assessment.laneAssessments.some(
    (lane) =>
      (lane.state === "attention" || lane.state === "missing") &&
      lane.id !== "host-patrol",
  );
  const state = independentAttention || (coverage.complete && attention.length > 0)
    ? "ATTENTION"
    : !coverage.complete
      ? "UNKNOWN"
      : "HEALTHY";
  const changed = previous
    ? previous.assessment.governedVerdict !== snapshot.assessment.governedVerdict ||
      laneState(previous) !== laneState(snapshot)
    : null;
  return {
    state,
    coverage,
    change: changed === null ? "baseline" : changed ? "changed" : "unchanged",
    changeSummary:
      changed === null
        ? "Baseline captured."
        : changed
          ? "Material lane or verdict state changed."
          : "No material lane or verdict change.",
    evidenceAsOf: snapshot.assessment.asOf,
    nextAction:
      state === "UNKNOWN"
        ? "Inspect host-patrol coverage before relying on the healthy summary."
        : attention.length > 0
          ? `Inspect: ${attention.join(", ")}.`
          : "No action needed.",
  };
}

export function renderOperatorBrief(brief: OperatorBrief): string {
  const coverage = brief.coverage;
  const coverageText = coverage.complete
    ? `${coverage.accountedFor}/${coverage.expected} accounted for; ${coverage.verified} verified, ${coverage.pending} pending, ${coverage.awaitingReview} awaiting review, ${coverage.actionable} actionable.`
    : coverage.expected === null
      ? "Expected-lane coverage is unavailable."
      : `${coverage.accountedFor}/${coverage.expected} accounted for; ${coverage.unknown ?? 0} unknown.`;

  return [
    "# Context Health",
    `- Status: ${brief.state}`,
    `- Coverage: ${coverageText}`,
    `- Change: ${brief.changeSummary}`,
    `- Evidence: ${brief.evidenceAsOf}`,
    `- Next: ${brief.nextAction}`,
    "",
  ].join("\n");
}
