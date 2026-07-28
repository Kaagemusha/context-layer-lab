import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import test from "node:test";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("an MCP client can discover and call the stdio server", async () => {
  const serverPath = fileURLToPath(new URL("../src/server.js", import.meta.url));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
  });
  const client = new Client({
    name: "context-layer-lab-test",
    version: "0.1.0",
  });

  try {
    await client.connect(transport);
    const listed = await client.listTools();
    assert.deepEqual(
      listed.tools.map((tool) => tool.name).sort(),
      ["explain_source", "search_context", "validate_record"],
    );

    const response = await client.callTool({
      name: "search_context",
      arguments: {
        query: "launch",
        asOf: "2026-07-28T12:00:00Z",
      },
    });
    assert.equal(response.isError, false);
    assert.match(JSON.stringify(response.content), /launch-readiness/);
  } finally {
    await client.close();
  }
});
