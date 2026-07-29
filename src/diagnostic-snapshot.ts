import {
  contextRecordSchema,
  type ContextRecord,
} from "./context.js";
import {
  assessOperationalHealth,
  operationalScenarioSchema,
  type OperationalAssessment,
  type OperationalScenario,
} from "./operational-health.js";

export const DIAGNOSTIC_SNAPSHOT_FORMAT = "context-layer-diagnostic/v1";

export type DiagnosticSnapshot = {
  format: typeof DIAGNOSTIC_SNAPSHOT_FORMAT;
  scenario: OperationalScenario;
  assessment: OperationalAssessment;
  records: ContextRecord[];
};

export function buildDiagnosticSnapshot(
  input: unknown,
  records: unknown[],
): DiagnosticSnapshot {
  const scenario = operationalScenarioSchema.parse(input);
  const assessment = assessOperationalHealth(scenario, records);
  const evidenceIds = new Set([
    scenario.summary.recordId,
    ...scenario.receipts.map((receipt) => receipt.recordId),
  ]);
  const evidenceRecords: ContextRecord[] = [];

  for (const inputRecord of records) {
    const parsed = contextRecordSchema.safeParse(inputRecord);
    if (parsed.success && evidenceIds.has(parsed.data.id)) {
      evidenceRecords.push(parsed.data);
    }
  }

  return {
    format: DIAGNOSTIC_SNAPSHOT_FORMAT,
    scenario,
    assessment,
    records: evidenceRecords,
  };
}
