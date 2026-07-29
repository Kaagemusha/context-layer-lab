import { ingestDirectory, type IngestionSnapshot } from "./ingest.js";

const sourceDirectory = new URL(
  "../../fixtures/source-docs/",
  import.meta.url,
);

export async function loadContextSnapshot(): Promise<IngestionSnapshot> {
  return ingestDirectory(sourceDirectory);
}
