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

  await initializeMcp(input, output);
  input.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
  input.end();
  await once(output, "data");

  const response = JSON.parse(lines.find((line) => JSON.parse(line).id === 2));
  const toolNames = response.result.tools.map((tool) => tool.name);
  assert.equal(toolNames.includes("uvcs_workspace_status"), true);
  assert.equal(toolNames.includes("uvcs_style_rules"), true);
  assert.equal(toolNames.includes("uvcs_style_setup_check"), true);
  assert.equal(toolNames.includes("uvcs_style_init_prepare"), true);
  assert.equal(toolNames.includes("uvcs_name_preview"), true);
  assert.equal(toolNames.includes("uvcs_release_plan"), true);
  assert.equal(toolNames.includes("uvcs_changeset_analytics"), true);
  assert.equal(toolNames.includes("uvcs_cleanup_candidates"), true);
  assert.equal(toolNames.includes("uvcs_branch_safety_report"), true);
  assert.equal(toolNames.includes("uvcs_update_workspace_prepare"), true);
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

  await initializeMcp(input, output);
  input.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "uvcs_workspace_status",
      arguments: {}
    }
  }) + "\n");
  input.end();
  await once(output, "data");

  const response = JSON.parse(lines.find((line) => JSON.parse(line).id === 2));
  assert.equal(response.result.isError, true);
  const payload = JSON.parse(response.result.content[0].text);
  assert.equal(payload.error.code, "WORKSPACE_REQUIRED");
  assert.match(payload.hint, /UVCS_WORKSPACE|workspace/i);
});

test("mcp sdk rejects tool arguments outside the declared schema", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines = [];
  output.on("data", (chunk) => {
    lines.push(...chunk.toString("utf8").trim().split(/\n/).filter(Boolean));
  });

  await startServer({ input, output });

  await initializeMcp(input, output);
  input.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "uvcs_diff_file",
      arguments: {
        filePath: "Assets/Foo.prefab",
        unexpected: true
      }
    }
  }) + "\n");
  input.end();
  await once(output, "data");

  const response = JSON.parse(lines.find((line) => JSON.parse(line).id === 2));
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /Input validation error/);
  assert.match(response.result.content[0].text, /unexpected/);
});

test("mcp sdk rejects missing required tool arguments", async () => {
  const { input, output, lines } = await startTestMcp();

  await initializeMcp(input, output);
  input.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "uvcs_diff_file",
      arguments: {}
    }
  }) + "\n");
  input.end();
  await once(output, "data");

  const response = responseById(lines, 2);
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /Input validation error/);
  assert.match(response.result.content[0].text, /filePath/);
});

test("mcp sdk rejects wrong tool argument types", async () => {
  const { input, output, lines } = await startTestMcp();

  await initializeMcp(input, output);
  input.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "uvcs_changeset_analytics",
      arguments: {
        maxResults: "10"
      }
    }
  }) + "\n");
  input.end();
  await once(output, "data");

  const response = responseById(lines, 2);
  assert.equal(response.result.isError, true);
  assert.match(response.result.content[0].text, /Input validation error/);
  assert.match(response.result.content[0].text, /maxResults/);
});

async function startTestMcp() {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines = [];
  output.on("data", (chunk) => {
    lines.push(...chunk.toString("utf8").trim().split(/\n/).filter(Boolean));
  });

  await startServer({ input, output });
  return { input, output, lines };
}

function responseById(lines, id) {
  return JSON.parse(lines.find((line) => JSON.parse(line).id === id));
}

async function initializeMcp(input, output) {
  input.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "uvcs-mcp-test", version: "0.0.0" }
    }
  }) + "\n");
  await once(output, "data");
  input.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
}
