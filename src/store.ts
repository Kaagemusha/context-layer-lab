import { readFile } from "node:fs/promises";

import { z } from "zod";

import { ingestDirectory, type IngestionSnapshot } from "./ingest.js";

const sourceDirectory = new URL(
  "../../fixtures/source-docs/",
  import.meta.url,
);

export const snapshotMetadataSchema = z
  .object({
    snapshotAsOf: z.string().datetime({ offset: true }),
    ageThresholdDays: z.number().int().positive(),
    intentionalStaleRecordIds: z.array(z.string().min(1)),
  })
  .strict();

export type SnapshotMetadata = z.infer<typeof snapshotMetadataSchema>;
export type ContextSnapshot = IngestionSnapshot & {
  snapshotAsOf?: string;
};

export async function loadContextSnapshot(): Promise<ContextSnapshot> {
  const [snapshot, metadata] = await Promise.all([
    ingestDirectory(sourceDirectory),
    readFile(
      new URL("../../data/snapshot-metadata.json", import.meta.url),
      "utf8",
    )
      .then(JSON.parse)
      .then((input) => snapshotMetadataSchema.parse(input))
      .catch((error: unknown) => {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ENOENT"
        ) {
          return undefined;
        }
        throw error;
      }),
  ]);

  return {
    ...snapshot,
    ...(metadata ? { snapshotAsOf: metadata.snapshotAsOf } : {}),
  };
}
