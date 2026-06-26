#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import readline from "node:readline";

const workspace = process.argv[2] || process.env.UVCS_WORKSPACE;
if (!workspace) {
  throw new Error("Usage: node scripts/mcp-smoke-plastic.js <workspace>");
}

const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
const branch1 = `/main/uvcs-mcp-e2e-${stamp}`;
const branch2 = `/main/uvcs-mcp-e2e-${stamp}-from-label`;
const label = `UVCS_MCP_E2E_${stamp}`;
const smokeDir = ".uvcs-mcp-smoke";
const smokeFile = `${smokeDir}/${stamp}.txt`;
const absoluteSmokeDir = path.join(workspace, smokeDir);
const absoluteSmokeFile = path.join(workspace, smokeFile);

const server = spawn(process.execPath, ["src/cli.js"], {
  cwd: path.resolve(import.meta.dirname, ".."),
  stdio: ["pipe", "pipe", "inherit"],
  windowsHide: true,
  env: {
    ...process.env,
    UVCS_WORKSPACE: workspace,
    UVCS_MCP_MODE: "standard"
  }
});

const pending = new Map();
let nextId = 1;
readline.createInterface({ input: server.stdout, crlfDelay: Infinity }).on("line", (line) => {
  const response = JSON.parse(line);
  const waiter = pending.get(response.id);
  if (!waiter) return;
  pending.delete(response.id);
  if (response.error) waiter.reject(new Error(JSON.stringify(response.error, null, 2)));
  else waiter.resolve(response.result);
});

try {
  await request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: {
      name: "uvcs-mcp-smoke-plastic",
      version: "0.0.0"
    }
  });
  notify("notifications/initialized", {});

  const doctor = await callTool("uvcs_doctor", {});
  if (!doctor.statusOk) {
    throw new Error(`Doctor failed: ${JSON.stringify(doctor, null, 2)}`);
  }

  const branchInfo = await callTool("uvcs_branch_info", {});
  const baseChangeset = parseChangeset(branchInfo.branchLine || branchInfo.stdout);
  if (!baseChangeset) {
    throw new Error(`Cannot parse base changeset from branch info: ${JSON.stringify(branchInfo, null, 2)}`);
  }

  await prepareConfirm("uvcs_branch_create", {
    branch: branch1,
    fromChangeset: `cs:${baseChangeset}`,
    comment: `UVCS MCP E2E branch ${stamp}`
  });

  await prepareConfirm("uvcs_switch_workspace", { target: branch1 });

  await fs.mkdir(absoluteSmokeDir, { recursive: true });
  await fs.writeFile(absoluteSmokeFile, `UVCS MCP E2E first branch ${stamp}\n`, "utf8");
  await prepareConfirm("uvcs_add", { itemPath: smokeDir });
  const firstCheckin = await prepareConfirm("uvcs_checkin", {
    message: `UVCS MCP E2E first checkin ${stamp}`
  });
  const firstChangeset = parseChangeset(firstCheckin.stdout);

  await prepareConfirm("uvcs_label_create", {
    label,
    target: `cs:${firstChangeset}`,
    comment: `UVCS MCP E2E label ${stamp}`
  });

  await prepareConfirm("uvcs_branch_create", {
    branch: branch2,
    fromLabel: `lb:${label}`,
    comment: `UVCS MCP E2E branch from label ${stamp}`
  });

  await prepareConfirm("uvcs_switch_workspace", { target: branch2 });
  await fs.appendFile(absoluteSmokeFile, `UVCS MCP E2E second branch ${stamp}\n`, "utf8");
  const secondCheckin = await prepareConfirm("uvcs_checkin", {
    message: `UVCS MCP E2E second checkin ${stamp}`
  });
  const secondChangeset = parseChangeset(secondCheckin.stdout);

  await prepareConfirm("uvcs_switch_workspace", { target: branch1 });
  await prepareConfirm("uvcs_merge", { source: branch2 });
  const mergeCheckin = await prepareConfirm("uvcs_checkin", {
    message: `UVCS MCP E2E merge checkin ${stamp}`
  });
  const mergeChangeset = parseChangeset(mergeCheckin.stdout);

  await prepareConfirm("uvcs_switch_workspace", { target: "/main" });
  const finalStatus = await callTool("uvcs_workspace_status", {});

  process.stdout.write(JSON.stringify({
    ok: true,
    workspace,
    baseChangeset,
    branch1,
    branch2,
    label,
    firstChangeset,
    secondChangeset,
    mergeChangeset,
    finalStatus: finalStatus.stdout
  }, null, 2) + "\n");
} finally {
  server.kill();
}

async function prepareConfirm(toolBaseName, args) {
  const prepared = await callTool(`${toolBaseName}_prepare`, args);
  return await callTool(`${toolBaseName}_confirm`, {
    token: prepared.token,
    confirmPhrase: prepared.confirmPhrase
  });
}

async function callTool(name, args) {
  const result = await request("tools/call", {
    name,
    arguments: args
  });

  const text = result.content?.[0]?.text ?? "";
  const payload = text ? JSON.parse(text) : {};
  if (result.isError) {
    throw new Error(`${name} failed: ${JSON.stringify(payload, null, 2)}`);
  }
  return payload;
}

async function request(method, params) {
  const id = nextId++;
  const promise = new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
  });
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", id, method, params }) + "\n");
  return await promise;
}

function notify(method, params) {
  server.stdin.write(JSON.stringify({ jsonrpc: "2.0", method, params }) + "\n");
}

function parseChangeset(text) {
  const match = String(text ?? "").match(/cs:(\d+)/);
  return match ? Number(match[1]) : null;
}
