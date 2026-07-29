import { z } from "zod";

import type { ContextRecord } from "./context.js";
import {
  buildDiagnosticSnapshot,
  type DiagnosticSnapshot,
} from "./diagnostic-snapshot.js";
import type { OperationalScenario } from "./operational-health.js";

const trajectoryRunSchema = z
  .object({
    schema_version: z.literal("trajectory-run-v1"),
    run_id: z.string().min(1),
    ended_at: z.string().datetime({ offset: true }),
    task: z
      .object({
        summary: z.string().min(1),
        lane: z.string().min(1),
      })
      .passthrough(),
    result: z
      .object({
        state: z.string().min(1),
        summary: z.string().min(1),
      })
      .passthrough(),
  })
  .passthrough();

export const trajectoryAdapterInputSchema = z
  .object({
    format: z.literal("context-layer-trajectory-adapter/v1"),
    question: z.string().min(1),
    asOf: z.string().datetime({ offset: true }),
    validityHours: z.number().positive(),
    summary: z
      .object({
        observedAt: z.string().datetime({ offset: true }),
        validUntil: z.string().datetime({ offset: true }),
        verdict: z.enum(["healthy", "attention"]),
        text: z.string().min(1),
        sourceUrl: z.string().url(),
      })
      .strict(),
    lanes: z
      .array(
        z
          .object({
            id: z.string().min(1),
            label: z.string().min(1),
            dueAt: z.string().datetime({ offset: true }),
          })
          .strict(),
      )
      .min(1),
    runs: z.array(trajectoryRunSchema),
    sourceBaseUrl: z.string().url(),
  })
  .strict();

export type TrajectoryAdapterInput = z.infer<
  typeof trajectoryAdapterInputSchema
>;

function addHours(timestamp: string, hours: number): string {
  return new Date(
    new Date(timestamp).getTime() + hours * 60 * 60 * 1000,
  ).toISOString();
}

function outcomeFor(
  state: string,
): "success" | "failed" | "preserved_local" {
  const normalized = state.toLowerCase();
  if (["complete", "completed", "success", "succeeded"].includes(normalized)) {
    return "success";
  }
  if (["blocked", "error", "failed", "failure"].includes(normalized)) {
    return "failed";
  }
  return "preserved_local";
}

export function adaptTrajectoryRuns(input: unknown): DiagnosticSnapshot {
  const packet = trajectoryAdapterInputSchema.parse(input);
  const laneIds = new Set(packet.lanes.map((lane) => lane.id));
  if (laneIds.size !== packet.lanes.length) {
    throw new Error("Trajectory adapter lanes must have unique IDs.");
  }
  const runIds = new Set(packet.runs.map((run) => run.run_id));
  if (runIds.size !== packet.runs.length) {
    throw new Error("Trajectory adapter runs must have unique run IDs.");
  }

  for (const run of packet.runs) {
    if (!laneIds.has(run.task.lane)) {
      throw new Error(
        `Trajectory run "${run.run_id}" references unknown lane "${run.task.lane}".`,
      );
    }
  }

  const summaryRecord: ContextRecord = {
    id: "trajectory-summary",
    title: "Trajectory Fleet Summary",
    summary: packet.summary.text,
    content: packet.summary.text,
    tags: ["trajectory", "summary", "automation-health"],
    owner: "Automation Operations",
    updatedAt: packet.summary.observedAt,
    validUntil: packet.summary.validUntil,
    sources: [
      {
        id: "trajectory-summary-source",
        label: "Declared fleet summary",
        url: packet.summary.sourceUrl,
        observedAt: packet.summary.observedAt,
      },
    ],
    claims: [
      {
        text: packet.summary.text,
        sourceIds: ["trajectory-summary-source"],
      },
    ],
  };

  const runRecords: ContextRecord[] = packet.runs.map((run) => {
    const sourceId = `trajectory-${run.run_id}`;
    return {
      id: run.run_id,
      title: run.task.summary,
      summary: run.result.summary,
      content: run.result.summary,
      tags: ["trajectory", "run-receipt", run.task.lane],
      owner: "Automation Operations",
      updatedAt: run.ended_at,
      validUntil: addHours(run.ended_at, packet.validityHours),
      sources: [
        {
          id: sourceId,
          label: `Trajectory record ${run.run_id}`,
          url: new URL(
            encodeURIComponent(run.run_id),
            packet.sourceBaseUrl,
          ).toString(),
          observedAt: run.ended_at,
        },
      ],
      claims: [
        {
          text: run.result.summary,
          sourceIds: [sourceId],
        },
      ],
    };
  });

  const scenario: OperationalScenario = {
    question: packet.question,
    asOf: packet.asOf,
    lanes: packet.lanes,
    summary: {
      recordId: summaryRecord.id,
      observedAt: packet.summary.observedAt,
      verdict: packet.summary.verdict,
    },
    receipts: packet.runs.map((run) => ({
      recordId: run.run_id,
      laneId: run.task.lane,
      observedAt: run.ended_at,
      outcome: outcomeFor(run.result.state),
    })),
  };

  return buildDiagnosticSnapshot(scenario, [
    summaryRecord,
    ...runRecords,
  ]);
}
