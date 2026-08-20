import { z } from "zod";

import type {
  ContextRecord,
  OperationalAssertion,
} from "./context.js";
import {
  buildDiagnosticSnapshot,
  type DiagnosticSnapshot,
} from "./diagnostic-snapshot.js";
import type { OperationalScenario } from "./operational-health.js";

const patrolSchema = z
  .object({
    file: z.string().min(1),
    state: z.string().min(1),
    timestamp: z.string().datetime({ offset: true }).optional(),
    host: z.string().min(1).optional(),
    checked: z.number().int().nonnegative().optional(),
    ok: z.number().int().nonnegative().optional(),
    pending: z.number().int().nonnegative().optional(),
    observed_pending_review: z.number().int().nonnegative().optional(),
    actionable: z.number().nullable().optional(),
    fresh: z.boolean(),
  })
  .passthrough();

const heartbeatSchema = z
  .object({
    loop_id: z.string().min(1),
    iso_timestamp: z.string().datetime({ offset: true }),
    host: z.string().min(1),
    outcome: z.string().min(1).optional(),
    fresh: z.boolean(),
  })
  .passthrough();

const issueSchema = z
  .object({
    file: z.string().min(1),
    title: z.string().min(1),
    description: z.string().optional(),
  })
  .passthrough();

export const reliabilityRollupSchema = z
  .object({
    generated_at: z.string().datetime({ offset: true }),
    status: z.enum(["GREEN", "ATTENTION", "UNKNOWN"]),
    patrol: patrolSchema.nullable(),
    heartbeats: z.array(heartbeatSchema),
    status_reliability_issues: z.array(issueSchema),
  })
  .passthrough()
  .superRefine((rollup, context) => {
    const heartbeatKeys = new Set<string>();
    rollup.heartbeats.forEach((heartbeat, index) => {
      const key = `${heartbeat.host}\0${heartbeat.loop_id}`;
      if (heartbeatKeys.has(key)) {
        context.addIssue({
          code: "custom",
          message: "Heartbeat host and loop ID pairs must be unique.",
          path: ["heartbeats", index, "loop_id"],
        });
      }
      heartbeatKeys.add(key);
    });
  });

export type ReliabilityRollup = z.infer<typeof reliabilityRollupSchema>;

export type ReliabilityCoverage = {
  expected: number | null;
  accountedFor: number;
  verified: number;
  pending: number;
  awaitingReview: number;
  actionable: number;
  unknown: number | null;
  complete: boolean;
};

const SUMMARY_RECORD_ID = "reliability-summary";
const VALIDITY_HOURS = 36;
const FAILED_OUTCOMES = new Set([
  "blocked",
  "error",
  "failed",
  "failure",
  "publication-unconfirmed",
]);
const SUCCESS_OUTCOMES = new Set([
  "applied",
  "deployed",
  "integrated",
  "no-change",
  "no_change",
  "observed",
  "success",
  "succeeded",
]);

function addHours(timestamp: string, hours: number): string {
  return new Date(
    new Date(timestamp).getTime() + hours * 60 * 60 * 1000,
  ).toISOString();
}

function directoryUrl(input: string): URL {
  const url = new URL(input);
  if (!url.pathname.endsWith("/")) url.pathname += "/";
  return url;
}

function sourceUrl(base: URL, path: string): string {
  const segments = path.split("/");
  if (
    segments.some(
      (segment) =>
        segment.length === 0 ||
        segment === "." ||
        segment === ".." ||
        segment.includes("\\"),
    )
  ) {
    throw new Error(`Source path must be relative and traversal-free: ${path}`);
  }
  return new URL(
    segments
      .map((segment) => encodeURIComponent(segment))
      .join("/"),
    base,
  ).toString();
}

function safeId(input: string): string {
  return encodeURIComponent(input);
}

function heartbeatOutcome(
  heartbeat: ReliabilityRollup["heartbeats"][number],
): "success" | "failed" | "preserved_local" {
  if (!heartbeat.fresh) return "preserved_local";
  if (!heartbeat.outcome) return "preserved_local";

  const normalized = heartbeat.outcome.toLowerCase();
  if (FAILED_OUTCOMES.has(normalized)) return "failed";
  if (SUCCESS_OUTCOMES.has(normalized)) return "success";
  return "preserved_local";
}

export function reliabilityCoverage(
  patrol: ReliabilityRollup["patrol"],
): ReliabilityCoverage {
  const expected = patrol?.checked ?? null;
  const verified = patrol?.ok ?? 0;
  const pending = patrol?.pending ?? 0;
  const awaitingReview = patrol?.observed_pending_review ?? 0;
  const actionable = patrol?.actionable ?? 0;
  const countsKnown =
    patrol !== null &&
    expected !== null &&
    patrol.ok !== undefined &&
    patrol.pending !== undefined &&
    patrol.observed_pending_review !== undefined &&
    typeof patrol.actionable === "number";
  const accountedFor = verified + pending + awaitingReview + actionable;
  const unknown = expected === null ? null : Math.max(0, expected - accountedFor);

  return {
    expected,
    accountedFor,
    verified,
    pending,
    awaitingReview,
    actionable,
    unknown,
    complete: countsKnown && accountedFor === expected,
  };
}

function makeRecord(input: {
  id: string;
  title: string;
  text: string;
  tags: string[];
  observedAt: string;
  sourceId: string;
  sourceLabel: string;
  sourceUrl: string;
  operational: OperationalAssertion;
}): ContextRecord {
  return {
    id: input.id,
    title: input.title,
    summary: input.text,
    content: input.text,
    tags: input.tags,
    owner: "Automation Operations",
    updatedAt: input.observedAt,
    validUntil: addHours(input.observedAt, VALIDITY_HOURS),
    sources: [
      {
        id: input.sourceId,
        label: input.sourceLabel,
        url: input.sourceUrl,
        observedAt: input.observedAt,
      },
    ],
    claims: [
      {
        text: input.text,
        sourceIds: [input.sourceId],
        operational: input.operational,
      },
    ],
  };
}

export function adaptReliabilityRollup(
  input: unknown,
  sourceBaseUrl: string,
): DiagnosticSnapshot {
  const rollup = reliabilityRollupSchema.parse(input);
  const base = directoryUrl(sourceBaseUrl);
  const summaryText =
    rollup.status === "GREEN"
      ? "Canonical vault reliability signals are currently clear."
      : rollup.status === "ATTENTION"
        ? "Canonical vault evidence contains an active reliability concern."
        : "Canonical vault evidence cannot establish current reliability.";
  const lanes: OperationalScenario["lanes"] = [];
  const receipts: OperationalScenario["receipts"] = [];
  const records: ContextRecord[] = [];

  if (rollup.patrol) {
    const observedAt = rollup.patrol.timestamp ?? rollup.generated_at;
    const recordId = "reliability-patrol";
    const actionable = rollup.patrol.actionable;
    const coverage = reliabilityCoverage(rollup.patrol);
    const outcome =
      rollup.patrol.state === "PARSED" &&
      rollup.patrol.fresh &&
      coverage.complete &&
      actionable === 0
        ? "success"
        : typeof actionable === "number" && actionable > 0
          ? "failed"
          : "preserved_local";
    const coverageText = coverage.complete
      ? `${coverage.accountedFor}/${coverage.expected} lanes are accounted for: ${coverage.verified} verified, ${coverage.pending} pending, ${coverage.awaitingReview} awaiting review, and ${coverage.actionable} actionable.`
      : coverage.expected === null
        ? "The patrol does not declare expected-lane coverage."
        : `The patrol accounts for ${coverage.accountedFor}/${coverage.expected} expected lanes; ${coverage.unknown ?? 0} are unknown.`;
    const text = `The latest host patrol is ${rollup.patrol.fresh ? "fresh" : "stale"}, has state ${rollup.patrol.state.toLowerCase()}, and ${typeof actionable === "number" ? `reports ${actionable} actionable findings` : "does not report an actionable count"}. ${coverageText}`;
    lanes.push({
      id: "host-patrol",
      label: "Host liveness patrol",
      dueAt: observedAt,
    });
    receipts.push({
      recordId,
      laneId: "host-patrol",
      observedAt,
      outcome,
    });
    records.push(
      makeRecord({
        id: recordId,
        title: "Host Liveness Patrol",
        text,
        tags: ["vault", "reliability", "patrol"],
        observedAt,
        sourceId: "reliability-patrol-source",
        sourceLabel: rollup.patrol.file,
        sourceUrl: sourceUrl(base, `data/liveness/${rollup.patrol.file}`),
        operational: {
          kind: "receipt",
          laneId: "host-patrol",
          observedAt,
          outcome,
        },
      }),
    );
  }

  for (const heartbeat of rollup.heartbeats) {
    const laneId = `heartbeat-${safeId(heartbeat.loop_id)}-${safeId(heartbeat.host)}`;
    const recordId = `reliability-${laneId}`;
    const outcome = heartbeatOutcome(heartbeat);
    const outcomeText = heartbeat.outcome
      ? ` with outcome ${heartbeat.outcome}`
      : " without a reported outcome";
    const text = `${heartbeat.loop_id} was observed at ${heartbeat.iso_timestamp} on ${heartbeat.host}${outcomeText}.`;
    lanes.push({
      id: laneId,
      label: heartbeat.loop_id,
      dueAt: heartbeat.iso_timestamp,
    });
    receipts.push({
      recordId,
      laneId,
      observedAt: heartbeat.iso_timestamp,
      outcome,
    });
    records.push(
      makeRecord({
        id: recordId,
        title: `${heartbeat.loop_id} heartbeat`,
        text,
        tags: ["vault", "reliability", "heartbeat", heartbeat.loop_id],
        observedAt: heartbeat.iso_timestamp,
        sourceId: `${recordId}-source`,
        sourceLabel: "Canonical loop heartbeat log",
        sourceUrl: sourceUrl(base, "data/liveness/heartbeats.jsonl"),
        operational: {
          kind: "receipt",
          laneId,
          observedAt: heartbeat.iso_timestamp,
          outcome,
        },
      }),
    );
  }

  for (const issue of rollup.status_reliability_issues) {
    const issueId = safeId(issue.file);
    const laneId = `status-issue-${issueId}`;
    const recordId = `reliability-${laneId}`;
    const text = issue.description
      ? `${issue.title}: ${issue.description}`
      : issue.title;
    lanes.push({ id: laneId, label: issue.title, dueAt: rollup.generated_at });
    receipts.push({
      recordId,
      laneId,
      observedAt: rollup.generated_at,
      outcome: "failed",
    });
    records.push(
      makeRecord({
        id: recordId,
        title: issue.title,
        text,
        tags: ["vault", "reliability", "active-issue"],
        observedAt: rollup.generated_at,
        sourceId: `${recordId}-source`,
        sourceLabel: issue.file,
        sourceUrl: sourceUrl(base, `ant/issues/${issue.file}`),
        operational: {
          kind: "receipt",
          laneId,
          observedAt: rollup.generated_at,
          outcome: "failed",
        },
      }),
    );
  }

  if (lanes.length === 0) {
    const recordId = "reliability-evidence-missing";
    const text = "The rollup contains no patrol or loop heartbeat evidence.";
    lanes.push({
      id: "reliability-evidence",
      label: "Reliability evidence",
      dueAt: rollup.generated_at,
    });
    receipts.push({
      recordId,
      laneId: "reliability-evidence",
      observedAt: rollup.generated_at,
      outcome: "preserved_local",
    });
    records.push(
      makeRecord({
        id: recordId,
        title: "Reliability Evidence Missing",
        text,
        tags: ["vault", "reliability", "missing-evidence"],
        observedAt: rollup.generated_at,
        sourceId: `${recordId}-source`,
        sourceLabel: "Canonical reliability rollup",
        sourceUrl: sourceUrl(base, "artifacts/reliability-rollup.mjs"),
        operational: {
          kind: "receipt",
          laneId: "reliability-evidence",
          observedAt: rollup.generated_at,
          outcome: "preserved_local",
        },
      }),
    );
  }

  const summaryRecord = makeRecord({
    id: SUMMARY_RECORD_ID,
    title: "Vault Reliability Summary",
    text: summaryText,
    tags: ["vault", "reliability", "summary"],
    observedAt: rollup.generated_at,
    sourceId: "reliability-rollup-source",
    sourceLabel: "Canonical reliability rollup",
    sourceUrl: sourceUrl(base, "artifacts/reliability-rollup.mjs"),
    operational: {
      kind: "summary",
      observedAt: rollup.generated_at,
      verdict: rollup.status === "GREEN" ? "healthy" : "attention",
      lanes,
    },
  });

  const scenario: OperationalScenario = {
    question: "Are the vault's current automation reliability signals healthy?",
    asOf: rollup.generated_at,
    lanes,
    summary: {
      recordId: SUMMARY_RECORD_ID,
      observedAt: rollup.generated_at,
      verdict: rollup.status === "GREEN" ? "healthy" : "attention",
    },
    receipts,
  };

  return buildDiagnosticSnapshot(scenario, [summaryRecord, ...records]);
}
