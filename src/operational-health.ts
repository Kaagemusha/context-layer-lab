import { z } from "zod";

import {
  contextRecordSchema,
  operationalLaneSchema,
  operationalOutcomeSchema,
  operationalVerdictSchema,
  validationIssueSchema,
  validateRecord,
  type ContextRecord,
  type OperationalAssertion,
  type ValidationIssue,
} from "./context.js";

const summarySchema = z
  .object({
    recordId: z.string().min(1),
    observedAt: z.string().datetime({ offset: true }),
    verdict: operationalVerdictSchema,
  })
  .strict();

const receiptSchema = z
  .object({
    recordId: z.string().min(1),
    laneId: z.string().min(1),
    observedAt: z.string().datetime({ offset: true }),
    outcome: operationalOutcomeSchema,
  })
  .strict();

export const operationalScenarioSchema = z
  .object({
    question: z.string().min(1),
    asOf: z.string().datetime({ offset: true }),
    lanes: z.array(operationalLaneSchema).min(1),
    summary: summarySchema,
    receipts: z.array(receiptSchema),
  })
  .strict()
  .superRefine((scenario, context) => {
    if (new Date(scenario.summary.observedAt) > new Date(scenario.asOf)) {
      context.addIssue({
        code: "custom",
        message: "Summary observation cannot postdate the diagnostic asOf time.",
        path: ["summary", "observedAt"],
      });
    }

    const laneIds = new Set<string>();
    scenario.lanes.forEach((lane, index) => {
      if (laneIds.has(lane.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate lane ID "${lane.id}".`,
          path: ["lanes", index, "id"],
        });
      }
      laneIds.add(lane.id);
    });

    const receiptRecordIds = new Set<string>();
    const receiptTimesByLane = new Map<string, Set<string>>();
    scenario.receipts.forEach((receipt, index) => {
      if (receiptRecordIds.has(receipt.recordId)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate receipt record ID "${receipt.recordId}".`,
          path: ["receipts", index, "recordId"],
        });
      }
      receiptRecordIds.add(receipt.recordId);

      const observedTimes = receiptTimesByLane.get(receipt.laneId) ?? new Set();
      if (observedTimes.has(receipt.observedAt)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate receipt observation for lane "${receipt.laneId}" at ${receipt.observedAt}.`,
          path: ["receipts", index, "observedAt"],
        });
      }
      observedTimes.add(receipt.observedAt);
      receiptTimesByLane.set(receipt.laneId, observedTimes);
    });
  });

export type OperationalScenario = z.infer<typeof operationalScenarioSchema>;

export const laneAssessmentSchema = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    state: z.enum(["healthy", "attention", "missing", "not_due"]),
    outcome: z.enum(["success", "failed", "preserved_local"]).nullable(),
    evidenceRecordId: z.string().min(1).nullable(),
  })
  .strict();

export const operationalAssessmentSchema = z
  .object({
    question: z.string().min(1),
    asOf: z.string().datetime({ offset: true }),
    naiveVerdict: z.enum(["healthy", "attention"]),
    governedVerdict: z.enum(["healthy", "attention"]),
    summaryStale: z.boolean(),
    decisionPrevented: z.boolean(),
    newerEvidenceRecordIds: z.array(z.string().min(1)),
    laneAssessments: z.array(laneAssessmentSchema),
    evidenceQuality: z.record(
      z.string().min(1),
      z
        .object({
          state: z.enum(["valid", "degraded", "invalid"]),
          issues: z.array(validationIssueSchema),
        })
        .strict(),
    ),
  })
  .strict();

export type LaneAssessment = z.infer<typeof laneAssessmentSchema>;
export type OperationalAssessment = z.infer<
  typeof operationalAssessmentSchema
>;

export function assessmentsConflict(
  assessment: OperationalAssessment,
): boolean {
  return assessment.naiveVerdict !== assessment.governedVerdict;
}

export function selectedEvidenceRecordIds(
  assessment: OperationalAssessment,
): string[] {
  return assessment.laneAssessments.flatMap((lane) =>
    lane.evidenceRecordId ? [lane.evidenceRecordId] : [],
  );
}

function assertOperationalBinding(
  record: ContextRecord,
  expected: OperationalAssertion,
): void {
  const operationalClaims = record.claims.filter(
    (claim) => claim.operational !== undefined,
  );
  if (operationalClaims.length !== 1) {
    throw new Error(
      `Operational evidence record "${record.id}" must contain exactly one typed operational assertion.`,
    );
  }

  const operationalClaim = operationalClaims[0]!;
  const assertion = operationalClaim.operational!;
  const hasSourceAtAssertionTime = operationalClaim.sourceIds.some(
    (sourceId) =>
      record.sources.some(
        (source) =>
          source.id === sourceId && source.observedAt === assertion.observedAt,
      ),
  );
  if (!hasSourceAtAssertionTime) {
    throw new Error(
      `Typed operational assertion for record "${record.id}" must identify a declared source observed at ${assertion.observedAt}.`,
    );
  }

  let matches = false;
  if (assertion.kind === "summary" && expected.kind === "summary") {
    matches =
      assertion.observedAt === expected.observedAt &&
      assertion.verdict === expected.verdict &&
      assertion.lanes.length === expected.lanes.length &&
      assertion.lanes.every((lane, index) => {
        const expectedLane = expected.lanes[index];
        return (
          expectedLane !== undefined &&
          lane.id === expectedLane.id &&
          lane.label === expectedLane.label &&
          lane.dueAt === expectedLane.dueAt
        );
      });
  } else if (assertion.kind === "receipt" && expected.kind === "receipt") {
    matches =
      assertion.laneId === expected.laneId &&
      assertion.observedAt === expected.observedAt &&
      assertion.outcome === expected.outcome;
  }
  if (!matches) {
    throw new Error(
      `Scenario ${expected.kind} for record "${record.id}" does not match its typed operational assertion.`,
    );
  }
}

export function assessOperationalHealth(
  input: unknown,
  records: unknown[],
): OperationalAssessment {
  const scenario = operationalScenarioSchema.parse(input);
  const asOf = new Date(scenario.asOf);
  const parsedRecords = new Map<string, ContextRecord>();

  for (const receipt of scenario.receipts) {
    if (!scenario.lanes.some((lane) => lane.id === receipt.laneId)) {
      throw new Error(`Receipt references unknown lane "${receipt.laneId}"`);
    }
  }

  for (const inputRecord of records) {
    const parsed = contextRecordSchema.safeParse(inputRecord);
    if (!parsed.success) continue;
    if (parsedRecords.has(parsed.data.id)) {
      throw new Error(`Duplicate context record ID "${parsed.data.id}".`);
    }
    parsedRecords.set(parsed.data.id, parsed.data);
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

  const summaryRecord = parsedRecords.get(scenario.summary.recordId);
  if (!summaryRecord) {
    throw new Error(
      `Operational evidence record "${scenario.summary.recordId}" was not found`,
    );
  }
  assertOperationalBinding(summaryRecord, {
    kind: "summary",
    observedAt: scenario.summary.observedAt,
    verdict: scenario.summary.verdict,
    lanes: scenario.lanes,
  });
  for (const receipt of scenario.receipts) {
    const record = parsedRecords.get(receipt.recordId);
    if (!record) {
      throw new Error(
        `Operational evidence record "${receipt.recordId}" was not found`,
      );
    }
    assertOperationalBinding(record, {
      kind: "receipt",
      laneId: receipt.laneId,
      observedAt: receipt.observedAt,
      outcome: receipt.outcome,
    });
  }

  const receiptsByLane = new Map<string, OperationalScenario["receipts"]>();
  for (const receipt of scenario.receipts) {
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
