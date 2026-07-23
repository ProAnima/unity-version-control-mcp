#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const root = path.resolve(import.meta.dirname, "..");
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-fleet-smoke-"));
const fakeCm = path.join(root, "scripts", "fake-cm.js");
const names = ["game-client", "game-server"];
const manifestPath = path.join(tempRoot, "workspaces.json");
let server;

try {
  const workspaces = [];
  for (const name of names) {
    const workspace = path.join(tempRoot, name);
    await fs.mkdir(path.join(workspace, ".plastic"), { recursive: true });
    await fs.writeFile(path.join(workspace, ".plastic", "plastic.workspace"), [
      `repository=${name}`,
      "server=fake-server:8087",
      ""
    ].join("\n"), "utf8");
    workspaces.push({
      name,
      path: `./${name}`,
      safety: "guarded",
      allowedRepos: [`${name}@fake-server:8087`]
    });
  }
  await fs.writeFile(manifestPath, JSON.stringify({
    version: 1,
    defaults: {
      cmPath: process.execPath,
      safety: "guarded",
      checkinMaxFiles: 20,
      tokenTtlSec: 120
    },
    workspaces
  }, null, 2), "utf8");

  const client = startMcpServer();
  await client.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "uvcs-mcp-smoke-fleet", version: "0.0.0" }
  });
  client.notify("notifications/initialized", {});

  const listed = await client.request("tools/list", {});
  const policyTool = listed.tools.find((tool) => tool.name === "uvcs_policy_status");
  assert(
    JSON.stringify(policyTool?.inputSchema?.properties?.workspace?.enum) === JSON.stringify(names),
    "Fleet tools must expose the manifest workspace selector"
  );

  const summaries = await Promise.all(names.map(async (name, index) => {
    const policy = await client.callTool("uvcs_policy_status", { workspace: name });
    const setup = await client.callTool("uvcs_setup_status", { workspace: name });
    assert(setup.policy.workspace.name === name, `${name} setup status returned another workspace`);
    await client.prepareConfirm("uvcs_style_init", {
      workspace: name,
      preset: "unity",
      baseBranch: "/main"
    });
    const namePreview = await client.callTool("uvcs_name_preview", {
      workspace: name,
      kind: "branch",
      type: "feature",
      title: `Fleet smoke ${index + 1}`,
      baseBranch: "/main"
    });
    assert(namePreview.value === `/main/feature/fleet-smoke-${index + 1}`, `${name} naming rules were not applied`);
    const target = `/main/fleet-smoke-${index + 1}`;
    await client.prepareConfirm("uvcs_branch_create", {
      workspace: name,
      branch: target,
      fromChangeset: "cs:100"
    });
    await client.prepareConfirm("uvcs_switch_workspace", {
      workspace: name,
      target
    });
    const branch = await client.callTool("uvcs_branch_info", { workspace: name });
    assert(branch.branchLine.includes(target), `${name} did not route to its own fake cm state`);
    return {
      name,
      workspace: policy.workspace.path,
      branchPreview: namePreview.value,
      branch: branch.branchLine
    };
  }));

  const clientState = JSON.parse(await fs.readFile(path.join(tempRoot, "game-client", ".plastic", "fake-cm-state.json"), "utf8"));
  const serverState = JSON.parse(await fs.readFile(path.join(tempRoot, "game-server", ".plastic", "fake-cm-state.json"), "utf8"));
  assert(clientState.branch !== serverState.branch, "Fleet workspaces must keep independent backend state");

  let selectorRejected = false;
  try {
    await client.callTool("uvcs_policy_status", {});
  } catch {
    selectorRejected = true;
  }
  assert(selectorRejected, "Fleet mode must reject calls without an explicit workspace");

  process.stdout.write(`${JSON.stringify({
    ok: true,
    processCount: 1,
    workspaceCount: names.length,
    workspaces: summaries
  }, null, 2)}\n`);
} finally {
  server?.kill();
  await fs.rm(tempRoot, { recursive: true, force: true });
}

function startMcpServer() {
  server = spawn(process.execPath, ["src/cli.js"], {
    cwd: root,
    stdio: ["pipe", "pipe", "inherit"],
    windowsHide: true,
    env: {
      ...process.env,
      UVCS_FLEET_MANIFEST: manifestPath,
      UVCS_CM_ARGS: fakeCm
    }
  });
  const pending = new Map();
  let nextId = 1;
  readline.createInterface({ input: server.stdout, crlfDelay: Infinity }).on("line", (line) => {
    const response = JSON.parse(line);
    const waiter = pending.get(response.id);
    if (!waiter) return;
    pending.delete(response.id);
    if (response.error) waiter.reject(new Error(JSON.stringify(response.error)));
    else waiter.resolve(response.result);
  });
  return {
    request(method, params) {
      const id = nextId++;
      const promise = new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
      });
      server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
      return promise;
    },
    notify(method, params) {
      server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`);
    },
    async callTool(name, args) {
      const result = await this.request("tools/call", { name, arguments: args });
      const payload = JSON.parse(result.content?.[0]?.text ?? "{}");
      if (result.isError) throw new Error(`${name} failed: ${JSON.stringify(payload)}`);
      return payload;
    },
    async prepareConfirm(name, args) {
      const prepared = await this.callTool(`${name}_prepare`, args);
      return await this.callTool(`${name}_confirm`, {
        workspace: args.workspace,
        token: prepared.token,
        confirmPhrase: prepared.confirmPhrase
      });
    }
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
