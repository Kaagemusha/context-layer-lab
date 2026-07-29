import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";

import {
  contextRecordSchema,
  validateRecord,
  type ContextRecord,
} from "./context.js";

const metadataSchema = contextRecordSchema.omit({ content: true });

export type SourceDocument = {
  sourcePath: string;
  content: string;
};

export type IngestionReceipt = {
  recordId: string;
  documentPath: string;
  contentSha256: string;
  byteLength: number;
  declaredSourceIds: string[];
  recordUpdatedAt: string;
};

export type IngestionSnapshot = {
  records: ContextRecord[];
  receipts: IngestionReceipt[];
};

function parseDocument(document: SourceDocument): {
  record: ContextRecord;
  receipt: IngestionReceipt;
} {
  const match = document.content.match(
    /^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]+)$/,
  );
  if (!match) {
    throw new Error(
      `${document.sourcePath}: expected JSON front matter between --- delimiters`,
    );
  }

  let metadata: unknown;
  try {
    metadata = JSON.parse(match[1] ?? "");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `${document.sourcePath}: invalid JSON front matter: ${message}`,
    );
  }

  const parsedMetadata = metadataSchema.safeParse(metadata);
  if (!parsedMetadata.success) {
    const issue = parsedMetadata.error.issues[0];
    const path = issue?.path.map(String).join(".") || "front matter";
    throw new Error(
      `${document.sourcePath}: invalid ${path}: ${issue?.message ?? "unknown error"}`,
    );
  }

  const body = (match[2] ?? "").trim();
  const parsedRecord = contextRecordSchema.safeParse({
    ...parsedMetadata.data,
    content: body,
  });
  if (!parsedRecord.success) {
    const issue = parsedRecord.error.issues[0];
    const path = issue?.path.map(String).join(".") || "document";
    throw new Error(
      `${document.sourcePath}: invalid ${path}: ${issue?.message ?? "unknown error"}`,
    );
  }

  const validation = validateRecord(
    parsedRecord.data,
    new Date(parsedRecord.data.updatedAt),
  );
  const semanticError = validation.issues.find(
    (issue) => issue.severity === "error",
  );
  if (semanticError) {
    throw new Error(
      `${document.sourcePath}: invalid ${semanticError.path ?? "record"}: ${semanticError.message}`,
    );
  }

  return {
    record: parsedRecord.data,
    receipt: {
      recordId: parsedRecord.data.id,
      documentPath: document.sourcePath,
      contentSha256: createHash("sha256")
        .update(document.content, "utf8")
        .digest("hex"),
      byteLength: Buffer.byteLength(document.content, "utf8"),
      declaredSourceIds: parsedRecord.data.sources.map((source) => source.id),
      recordUpdatedAt: parsedRecord.data.updatedAt,
    },
  };
}

export function ingestDocuments(
  documents: SourceDocument[],
): IngestionSnapshot {
  if (documents.length === 0) {
    throw new Error("No Markdown source documents were found");
  }

  const records: ContextRecord[] = [];
  const receipts: IngestionReceipt[] = [];
  const recordIds = new Set<string>();

  for (const document of [...documents].sort((left, right) =>
    left.sourcePath.localeCompare(right.sourcePath),
  )) {
    const { record, receipt } = parseDocument(document);
    if (recordIds.has(record.id)) {
      throw new Error(
        `${document.sourcePath}: duplicate record id "${record.id}"`,
      );
    }
    recordIds.add(record.id);
    records.push(record);
    receipts.push(receipt);
  }

  return { records, receipts };
}

export async function ingestDirectory(
  directory: URL,
  publicPath = "fixtures/source-docs",
): Promise<IngestionSnapshot> {
  const entries = await readdir(directory, { withFileTypes: true });
  const names = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => entry.name)
    .sort();
  const documents = await Promise.all(
    names.map(async (name) => ({
      sourcePath: `${publicPath}/${name}`,
      content: await readFile(new URL(name, directory), "utf8"),
    })),
  );
  return ingestDocuments(documents);
}
