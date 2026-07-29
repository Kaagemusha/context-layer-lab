import { z } from "zod";

import {
  contextRecordSchema,
  validateRecord,
  type ContextRecord,
  type ValidationIssue,
} from "./context.js";

const laneSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    dueAt: z.string().datetime({ offset: true }),
  })
  .strict();

const summarySchema = z
  .object({
    recordId: z.string().min(1),
    observedAt: z.string().datetime({ offset: true }),
    verdict: z.enum(["healthy", "attention"]),
  })
  .strict();

const receiptSchema = z
  .object({
    recordId: z.string().min(1),
    laneId: z.string().min(1),
    observedAt: z.string().datetime({ offset: true }),
    outcome: z.enum(["success", "failed", "preserved_local"]),
  })
  .strict();

export const operationalScenarioSchema = z
  .object({
    question: z.string().min(1),
    asOf: z.string().datetime({ offset: true }),
    lanes: z.array(laneSchema).min(1),
    summary: summarySchema,
    receipts: z.array(receiptSchema),
  })
  .strict();

export type OperationalScenario = z.infer<typeof operationalScenarioSchema>;

export type LaneAssessment = {
  id: string;
  label: string;
  state: "healthy" | "attention" | "missing" | "not_due";
  outcome: "success" | "failed" | "preserved_local" | null;
  evidenceRecordId: string | null;
};

export type OperationalAssessment = {
  question: string;
  asOf: string;
  naiveVerdict: "healthy" | "attention";
  governedVerdict: "healthy" | "attention";
  summaryStale: boolean;
  decisionPrevented: boolean;
  newerEvidenceRecordIds: string[];
  laneAssessments: LaneAssessment[];
  evidenceQuality: Record<
    string,
    { state: "valid" | "degraded" | "invalid"; issues: ValidationIssue[] }
  >;
};

export function assessOperationalHealth(
  input: unknown,
  records: unknown[],
): OperationalAssessment {
  const scenario = operationalScenarioSchema.parse(input);
  const asOf = new Date(scenario.asOf);
  const parsedRecords = new Map<string, ContextRecord>();

  for (const inputRecord of records) {
    const parsed = contextRecordSchema.safeParse(inputRecord);
    if (parsed.success) parsedRecords.set(parsed.data.id, parsed.data);
  }

  const evidenceIds = [
    scenario.summary.recordId,
    ...scenario.receipts.map((receipt) => receipt.recordId),
  ];
  const evidenceQuality: OperationalAssessment["evidenceQuality"] = {};
  for (const id of [...new Set(evidenceIds)]) {
    const record = parsedRecords.get(id);
    if (!record) throw new Error(`Operational evidence record "${id}" was not found`);
    const validation = validateRecord(record, asOf);
    evidenceQuality[id] = {
      state: validation.state,
      issues: validation.issues,
    };
  }

  const receiptsByLane = new Map<string, OperationalScenario["receipts"]>();
  for (const receipt of scenario.receipts) {
    if (!scenario.lanes.some((lane) => lane.id === receipt.laneId)) {
      throw new Error(`Receipt references unknown lane "${receipt.laneId}"`);
    }
    if (new Date(receipt.observedAt) > asOf) continue;
    const laneReceipts = receiptsByLane.get(receipt.laneId) ?? [];
    laneReceipts.push(receipt);
    receiptsByLane.set(receipt.laneId, laneReceipts);
  }

  const laneAssessments = scenario.lanes.map((lane): LaneAssessment => {
    if (new Date(lane.dueAt) > asOf) {
      return {
        id: lane.id,
        label: lane.label,
        state: "not_due",
        outcome: null,
        evidenceRecordId: null,
      };
    }
    const latest = (receiptsByLane.get(lane.id) ?? []).sort(
      (left, right) =>
        new Date(right.observedAt).getTime() -
        new Date(left.observedAt).getTime(),
    )[0];
    if (!latest || new Date(latest.observedAt) < new Date(lane.dueAt)) {
      return {
        id: lane.id,
        label: lane.label,
        state: "missing",
        outcome: null,
        evidenceRecordId: null,
      };
    }
    return {
      id: lane.id,
      label: lane.label,
      state:
        latest.outcome === "success" &&
        evidenceQuality[latest.recordId]?.state === "valid"
          ? "healthy"
          : "attention",
      outcome: latest.outcome,
      evidenceRecordId: latest.recordId,
    };
  });

  const newerEvidenceRecordIds = scenario.receipts
    .filter(
      (receipt) =>
        new Date(receipt.observedAt) > new Date(scenario.summary.observedAt) &&
        new Date(receipt.observedAt) <= asOf,
    )
    .map((receipt) => receipt.recordId);
  const summaryQuality = evidenceQuality[scenario.summary.recordId];
  const summaryStale =
    newerEvidenceRecordIds.length > 0 || summaryQuality?.state !== "valid";
  const governedVerdict = laneAssessments.some(
    (lane) => lane.state === "attention" || lane.state === "missing",
  )
    ? "attention"
    : "healthy";

  return {
    question: scenario.question,
    asOf: scenario.asOf,
    naiveVerdict: scenario.summary.verdict,
    governedVerdict,
    summaryStale,
    decisionPrevented:
      scenario.summary.verdict === "healthy" && governedVerdict === "attention",
    newerEvidenceRecordIds,
    laneAssessments,
    evidenceQuality,
  };
}
