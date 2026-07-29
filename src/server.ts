#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

import { loadContextSnapshot } from "./store.js";
import {
  handleExplainSource,
  handleInspectIngestion,
  handleSearch,
  handleValidate,
} from "./tool-handlers.js";

function toolResult(value: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }],
    isError,
  };
}

const { records, receipts } = await loadContextSnapshot();
const server = new McpServer({
  name: "context-layer-lab",
  version: "0.1.0",
});

server.registerTool(
  "inspect_ingestion",
  {
    description:
      "Show the deterministic receipt linking one context record to its synthetic Markdown source.",
    inputSchema: {
      recordId: z.string().min(1),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  async (input) => {
    const response = handleInspectIngestion(receipts, input);
    return toolResult(response, !response.ok);
  },
);

server.registerTool(
  "search_context",
  {
    description:
      "Search synthetic organizational context. Returns a bounded, ranked set with source IDs and visible freshness or evidence issues on every match.",
    inputSchema: {
      query: z.string().min(1),
      asOf: z.string().datetime({ offset: true }).optional(),
      limit: z.number().int().min(1).max(20).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  async (input) => toolResult(handleSearch(records, input)),
);

server.registerTool(
  "explain_source",
  {
    description:
      "Show a declared source and the exact claims it supports on one context record.",
    inputSchema: {
      recordId: z.string().min(1),
      sourceId: z.string().min(1),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  async (input) => {
    const response = handleExplainSource(records, input);
    return toolResult(response, !response.ok);
  },
);

server.registerTool(
  "validate_record",
  {
    description:
      "Validate a context record's schema, provenance coverage, claim support, and freshness boundary.",
    inputSchema: {
      record: z.unknown(),
      asOf: z.string().datetime({ offset: true }).optional(),
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
    },
  },
  async (input) => {
    const response = handleValidate(input);
    return toolResult(response, !response.ok);
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
