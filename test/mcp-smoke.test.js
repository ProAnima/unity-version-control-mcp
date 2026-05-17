import test from "node:test";
import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { once } from "node:events";
import { startServer } from "../src/server.js";

test("mcp server lists uvcs tools", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines = [];
  output.on("data", (chunk) => {
    lines.push(...chunk.toString("utf8").trim().split(/\n/).filter(Boolean));
  });

  await startServer({ input, output });

  input.write(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }) + "\n");
  input.end();
  await once(output, "data");

  const response = JSON.parse(lines[0]);
  const toolNames = response.result.tools.map((tool) => tool.name);
  assert.equal(toolNames.includes("uvcs_workspace_status"), true);
  assert.equal(toolNames.includes("uvcs_checkin_prepare"), true);
  assert.equal(toolNames.includes("uvcs_branch_create_prepare"), true);
  assert.equal(toolNames.includes("uvcs_label_create_prepare"), true);
  assert.equal(toolNames.includes("uvcs_switch_workspace_prepare"), true);
  assert.equal(toolNames.includes("uvcs_merge_prepare"), true);
});

test("mcp tool errors are returned as isError results with hints", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines = [];
  output.on("data", (chunk) => {
    lines.push(...chunk.toString("utf8").trim().split(/\n/).filter(Boolean));
  });

  await startServer({ input, output });

  input.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: "uvcs_workspace_status",
      arguments: {}
    }
  }) + "\n");
  input.end();
  await once(output, "data");

  const response = JSON.parse(lines[0]);
  assert.equal(response.result.isError, true);
  const payload = JSON.parse(response.result.content[0].text);
  assert.equal(payload.error.code, "WORKSPACE_REQUIRED");
  assert.match(payload.hint, /UVCS_WORKSPACE|workspace/i);
});
