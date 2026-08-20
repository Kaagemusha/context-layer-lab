import { z } from "zod";

import {
  contextRecordSchema,
  type ContextRecord,
} from "./context.js";
import {
  assessOperationalHealth,
  operationalAssessmentSchema,
  operationalScenarioSchema,
  type OperationalAssessment,
  type OperationalScenario,
} from "./operational-health.js";

export const DIAGNOSTIC_SNAPSHOT_FORMAT = "context-layer-diagnostic/v2";

export const diagnosticSnapshotSchema = z
  .object({
    format: z.literal(DIAGNOSTIC_SNAPSHOT_FORMAT),
    scenario: operationalScenarioSchema,
    assessment: operationalAssessmentSchema,
    records: z.array(contextRecordSchema),
  })
  .strict()
  .superRefine((snapshot, context) => {
    const recordIds = new Set<string>();

    snapshot.records.forEach((record, index) => {
      if (recordIds.has(record.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate record ID "${record.id}".`,
          path: ["records", index, "id"],
        });
      }
      recordIds.add(record.id);
    });
  });

export type DiagnosticSnapshot = z.infer<typeof diagnosticSnapshotSchema>;

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(
        ([key, entry]) =>
          `${JSON.stringify(key)}:${canonicalJson(entry)}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function verifyDiagnosticSnapshot(input: unknown): DiagnosticSnapshot {
  if (
    input !== null &&
    typeof input === "object" &&
    !Array.isArray(input) &&
    "format" in input &&
    input.format === "context-layer-diagnostic/v1"
  ) {
    throw new Error(
      "Snapshot format context-layer-diagnostic/v1 is not evidence-bound; regenerate it as context-layer-diagnostic/v2.",
    );
  }
  const parsed = diagnosticSnapshotSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const path = issue?.path.map(String).join(".") || "root";
    throw new Error(
      `Snapshot is invalid at ${path}: ${issue?.message ?? "unknown schema error"}`,
    );
  }
  const snapshot = parsed.data;
  const assessment = assessOperationalHealth(
    snapshot.scenario,
    snapshot.records,
  );

  if (
    canonicalJson(snapshot.assessment) !== canonicalJson(assessment)
  ) {
    throw new Error(
      "Snapshot assessment does not match its scenario and evidence records.",
    );
  }

  return { ...snapshot, assessment };
}

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
