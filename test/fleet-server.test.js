import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { PassThrough } from "node:stream";
import { startServer } from "../src/server.js";

test("one fleet MCP server routes tools to an explicit workspace", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-fleet-server-"));
  for (const name of ["project-a", "project-b"]) {
    const workspace = path.join(root, name);
    await fs.mkdir(path.join(workspace, ".plastic"), { recursive: true });
    await fs.writeFile(path.join(workspace, ".plastic", "plastic.workspace"), [
      `repository=${name}`,
      "server=fake-server:8087"
    ].join("\n"), "utf8");
  }
  const manifestPath = path.join(root, "workspaces.json");
  await fs.writeFile(manifestPath, JSON.stringify({
    version: 1,
    defaults: { safety: "readonly" },
    workspaces: [
      { name: "project-a", path: "./project-a" },
      { name: "project-b", path: "./project-b" }
    ]
  }), "utf8");

  const input = new PassThrough();
  const output = new PassThrough();
  const lines = [];
  output.on("data", (chunk) => {
    lines.push(...chunk.toString("utf8").trim().split(/\n/).filter(Boolean));
  });
  await startServer({
    input,
    output,
    env: {
      ...process.env,
      UVCS_FLEET_MANIFEST: manifestPath,
      UVCS_CM_PATH: process.execPath,
      UVCS_CM_ARGS: path.resolve("scripts/fake-cm.js")
    }
  });

  await initializeMcp(input, output);
  input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })}\n`);
  await once(output, "data");
  const listed = responseById(lines, 2);
  const policyTool = listed.result.tools.find((tool) => tool.name === "uvcs_policy_status");
  assert.deepEqual(policyTool.inputSchema.properties.workspace.enum, ["project-a", "project-b"]);
  assert.equal(policyTool.inputSchema.required.includes("workspace"), true);

  input.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "uvcs_policy_status",
      arguments: { workspace: "project-b" }
    }
  })}\n`);
  await once(output, "data");
  const called = responseById(lines, 3);
  const payload = JSON.parse(called.result.content[0].text);
  assert.equal(payload.workspace.name, "project-b");
  assert.equal(payload.workspace.path, path.join(root, "project-b"));

  input.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "uvcs_policy_status",
      arguments: {}
    }
  })}\n`);
  input.end();
  await once(output, "data");
  const missing = responseById(lines, 4);
  assert.equal(missing.result.isError, true);
  assert.match(missing.result.content[0].text, /workspace/i);
});

function responseById(lines, id) {
  return JSON.parse(lines.find((line) => JSON.parse(line).id === id));
}

async function initializeMcp(input, output) {
  input.write(`${JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "uvcs-fleet-test", version: "0.0.0" }
    }
  })}\n`);
  await once(output, "data");
  input.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`);
}
