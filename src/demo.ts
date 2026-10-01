import {
  assessOperationalHealth,
  type OperationalScenario,
} from "./operational-health.js";

/**
 * Renders the pinned scenario as a short naive-versus-governed answer. Uses
 * the same reconciliation code as the evals and the MCP server. No model
 * call, no clock: the answer depends only on the scenario and records.
 */
export function renderDemo(
  scenario: OperationalScenario,
  records: unknown[],
): string {
  const assessment = assessOperationalHealth(scenario, records);
  const summaryQuality = assessment.evidenceQuality[scenario.summary.recordId];
  const expired = summaryQuality?.issues.find(
    (issue) => issue.code === "stale_record",
  );
  const attention = assessment.laneAssessments.filter(
    (lane) => lane.state === "attention" || lane.state === "missing",
  );
  const notDue = assessment.laneAssessments.filter(
    (lane) => lane.state === "not_due",
  );

  const lines = [
    `Question: ${assessment.question}`,
    `As of:    ${assessment.asOf}`,
    "",
    `Naive answer:    ${assessment.naiveVerdict}. It repeats the dashboard observed at ${scenario.summary.observedAt}.`,
    `Governed answer: ${assessment.governedVerdict}. ${
      attention.length === 0
        ? "Every due lane has current successful evidence."
        : `${attention.length} of ${assessment.laneAssessments.length - notDue.length} due lanes need attention.`
    }`,
    "",
    "Why:",
  ];
  if (expired) {
    lines.push(`- The dashboard record is stale. ${expired.message}`);
  }
  if (assessment.newerEvidenceRecordIds.length > 0) {
    const count = assessment.newerEvidenceRecordIds.length;
    lines.push(
      `- ${count} newer run ${count === 1 ? "receipt supersedes" : "receipts supersede"} it.`,
    );
  }
  for (const lane of attention) {
    lines.push(
      `- ${lane.label}: ${lane.outcome ?? "no receipt"} (${lane.evidenceRecordId ?? "no evidence record"}).`,
    );
  }
  for (const lane of notDue) {
    lines.push(`- ${lane.label}: not due yet, so it is not counted as failed.`);
  }
  return `${lines.join("\n")}\n`;
}
