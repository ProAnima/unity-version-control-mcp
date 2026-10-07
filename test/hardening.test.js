import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { PassThrough } from "node:stream";
import { assertRelativeWorkspacePath } from "../src/policy/policy.js";
import { createTools } from "../src/tools/index.js";
import { summarizePendingChanges } from "../src/services/pending.js";
import { decodeProcessOutput } from "../src/backend/output-encoding.js";
import { runProcess } from "../src/backend/process-runner.js";
import { withWorkspaceWriteLock } from "../src/server/write-lock.js";
import { unityMetaDiagnostics } from "../src/services/unity-meta.js";
import { loadConfig } from "../src/config/env.js";
import { loadFleetConfigs } from "../src/config/fleet.js";
import { startServer } from "../src/server.js";

const SEP = "\u001f";

function standardConfig(overrides = {}) {
  return {
    workspace: process.cwd(),
    mode: "standard",
    tokenTtlSec: 300,
    allowedWorkspaces: [],
    allowedRepos: [],
    checkinMaxFiles: 20,
    ...overrides
  };
}

test("workspace paths that look like cm options are rejected", () => {
  const config = { workspace: process.cwd() };
  for (const value of ["-r", "--recursive", "--checkedout", "-a"]) {
    assert.throws(() => assertRelativeWorkspacePath(config, value), (error) => error.code === "INVALID_PATH", value);
  }
  assert.equal(assertRelativeWorkspacePath(config, "a/-r"), path.join("a", "-r"));
  assert.equal(assertRelativeWorkspacePath(config, "..foo"), "..foo");
  assert.throws(() => assertRelativeWorkspacePath(config, ".."), (error) => error.code === "PATH_OUTSIDE_WORKSPACE");
  assert.throws(() => assertRelativeWorkspacePath(config, "a\nb"), (error) => error.code === "INVALID_PATH");
});

test("undo prepare refuses option-like paths before invoking cm", async () => {
  let invoked = false;
  const backend = {
    pendingChanges: async () => {
      invoked = true;
      return { stdout: "" };
    }
  };
  const tools = createTools({ config: standardConfig(), backend });
  await assert.rejects(() => tools.call("uvcs_undo_prepare", { itemPath: "-r" }), (error) => error.code === "INVALID_PATH");
  assert.equal(invoked, false);
});

test("branch and label names cannot start with a dash", async () => {
  const tools = createTools({ config: standardConfig(), backend: {} });
  await assert.rejects(
    () => tools.call("uvcs_branch_create_prepare", { branch: "-r", fromChangeset: "cs:1" }),
    (error) => error.code === "INVALID_BRANCH_SPEC"
  );
  await assert.rejects(
    () => tools.call("uvcs_label_create_prepare", { label: "-r", target: "cs:1" }),
    (error) => error.code === "INVALID_LABEL_NAME"
  );
});

test("pending change summary ignores private and ignored items", () => {
  const clean = `STATUS${SEP}10${SEP}repo${SEP}server`;
  const withPrivate = `${clean}\nPR${SEP}C:/ws/new.txt${SEP}False${SEP}NO_MERGES\nIG${SEP}C:/ws/Library${SEP}True${SEP}NO_MERGES`;
  const withChange = `${withPrivate}\nCH${SEP}C:/ws/Assets/A.prefab${SEP}False${SEP}NO_MERGES`;

  assert.equal(summarizePendingChanges(withPrivate).trackedCount, 0);
  assert.equal(summarizePendingChanges(withPrivate).untrackedCount, 2);
  assert.equal(summarizePendingChanges(withPrivate).fingerprint, summarizePendingChanges(clean).fingerprint);
  assert.equal(summarizePendingChanges(withChange).trackedCount, 1);
  assert.notEqual(summarizePendingChanges(withChange).fingerprint, summarizePendingChanges(clean).fingerprint);
});

test("switch is allowed when only private files exist", async () => {
  const backend = {
    pendingChanges: async () => ({ stdout: `STATUS${SEP}10${SEP}repo${SEP}server\nPR${SEP}C:/ws/notes.txt${SEP}False${SEP}NO_MERGES` })
  };
  const tools = createTools({ config: standardConfig(), backend });
  const prepared = await tools.call("uvcs_switch_workspace_prepare", { target: "/main/task" });
  assert.equal(prepared.action, "switch_workspace");
});

test("checkin prepare refuses an empty checkin", async () => {
  const backend = {
    pendingChanges: async () => ({ stdout: `STATUS${SEP}10${SEP}repo${SEP}server\nPR${SEP}C:/ws/notes.txt${SEP}False${SEP}NO_MERGES` })
  };
  const tools = createTools({ config: standardConfig(), backend });
  await assert.rejects(
    () => tools.call("uvcs_checkin_prepare", { message: "fix: nothing" }),
    (error) => error.code === "NOTHING_TO_CHECKIN"
  );
});

test("update prepare warns about pending changes", async () => {
  const backend = {
    branchInfo: async () => ({ branchLine: "cs:10@/main@repo@server" }),
    pendingChanges: async () => ({ stdout: `STATUS${SEP}10${SEP}repo${SEP}server\nCH${SEP}C:/ws/A.prefab${SEP}False${SEP}NO_MERGES` })
  };
  const tools = createTools({ config: standardConfig(), backend });
  const prepared = await tools.call("uvcs_update_workspace_prepare", {});
  assert.equal(prepared.payload.pendingChangesCount, 1);
  assert.match(prepared.payload.warning, /pending changes/);
});

test("diff output is truncated to a bounded size", async () => {
  const backend = { diffFile: async () => ({ ok: true, stdout: "x".repeat(250_000), stderr: "" }) };
  const tools = createTools({ config: standardConfig({ mode: "readonly" }), backend });
  const result = await tools.call("uvcs_diff_file", { filePath: "Assets/A.prefab" });
  assert.equal(result.truncated, true);
  assert.ok(result.stdout.length < 201_000);
});

test("tools carry MCP annotations that separate reads from destructive writes", () => {
  const tools = createTools({ config: standardConfig(), backend: {} }).list();
  const byName = Object.fromEntries(tools.map((tool) => [tool.name, tool.annotations]));
  assert.equal(byName.uvcs_workspace_status.readOnlyHint, true);
  assert.equal(byName.uvcs_undo_prepare.readOnlyHint, true);
  assert.equal(byName.uvcs_undo_confirm.readOnlyHint, false);
  assert.equal(byName.uvcs_undo_confirm.destructiveHint, true);
  assert.equal(byName.uvcs_merge_confirm.destructiveHint, true);
  assert.equal(byName.uvcs_add_confirm.destructiveHint, false);
  assert.equal(byName.uvcs_checkin_confirm.readOnlyHint, false);
  assert.ok(tools.every((tool) => tool.annotations), "every tool has annotations");
});

test("system code page output decodes to readable text", () => {
  const systemEncodings = ["ibm866", "windows-1251"];
  const options = { platform: "win32", systemEncodings };
  assert.equal(decodeProcessOutput(Buffer.from("92a5e1e2", "hex"), options), "Тест");
  assert.equal(decodeProcessOutput(Buffer.from("d2e5f1f2", "hex"), options), "Тест");
  assert.equal(decodeProcessOutput(Buffer.from("Тест", "utf8"), options), "Тест");
  assert.equal(decodeProcessOutput(Buffer.from("92a5e1e2", "hex"), { encoding: "ibm866" }), "Тест");
});

test("runProcess keeps multi-byte characters split across output chunks", async () => {
  const script = "const b=Buffer.from('Привет','utf8');process.stdout.write(b.subarray(0,3));setTimeout(()=>process.stdout.write(b.subarray(3)),50);";
  const result = await runProcess(process.execPath, ["-e", script], { timeoutMs: 5000 });
  assert.equal(result.stdout, "Привет");
});

test("runProcess gives the child a closed stdin", async () => {
  const script = "process.stdin.on('data',()=>{}).on('end',()=>{process.stdout.write('eof')});";
  const result = await runProcess(process.execPath, ["-e", script], { timeoutMs: 5000 });
  assert.equal(result.stdout, "eof");
});

test("runProcess timeout terminates the child before rejecting", async () => {
  const marker = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-timeout-")), "pid");
  const script = `require('fs').writeFileSync(${JSON.stringify(marker)}, String(process.pid)); setInterval(() => {}, 1000);`;
  await assert.rejects(
    () => runProcess(process.execPath, ["-e", script], { timeoutMs: 500 }),
    (error) => error.code === "PROCESS_TIMEOUT"
  );
  const pid = Number(await fs.readFile(marker, "utf8"));
  assert.throws(() => process.kill(pid, 0), (error) => error.code === "ESRCH");
});

async function lockWorkspace(prefix) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const plasticDir = path.join(workspace, ".plastic");
  await fs.mkdir(plasticDir);
  return { workspace, lockPath: path.join(plasticDir, "uvcs-mcp.write.lock") };
}

test("write lock left by a dead process on this host is reclaimed immediately", async () => {
  const { workspace, lockPath } = await lockWorkspace("uvcs-mcp-dead-lock-");
  const dead = await runProcess(process.execPath, ["-e", "process.stdout.write(String(process.pid))"]);
  await fs.writeFile(lockPath, JSON.stringify({
    pid: Number(dead.stdout),
    hostname: os.hostname(),
    token: "dead-process",
    createdAt: new Date().toISOString()
  }), "utf8");

  const result = await withWorkspaceWriteLock(workspace, async () => "recovered", { waitMs: 500 });
  assert.equal(result, "recovered");
});

test("abandoned cleanup marker does not block writes forever", async () => {
  const { workspace, lockPath } = await lockWorkspace("uvcs-mcp-cleanup-");
  const cleanupPath = `${lockPath}.cleanup`;
  await fs.writeFile(cleanupPath, "", "utf8");
  const old = new Date(Date.now() - 60_000);
  await fs.utimes(cleanupPath, old, old);

  const result = await withWorkspaceWriteLock(workspace, async () => "written", { waitMs: 500 });
  assert.equal(result, "written");
  await assert.rejects(() => fs.access(cleanupPath), (error) => error.code === "ENOENT");
});

test("write lock heartbeat keeps a long operation fresh", async () => {
  const { workspace, lockPath } = await lockWorkspace("uvcs-mcp-heartbeat-");
  await withWorkspaceWriteLock(workspace, async () => {
    const old = new Date(Date.now() - 600_000);
    await fs.utimes(lockPath, old, old);
    await new Promise((resolve) => {
      setTimeout(resolve, 150);
    });
    const stat = await fs.stat(lockPath);
    assert.ok(Date.now() - stat.mtimeMs < 10_000, "heartbeat refreshed the lock mtime");
  }, { heartbeatMs: 50 });
});

test("unity meta diagnostics follows Unity import rules", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-meta-rules-"));
  await fs.mkdir(path.join(workspace, "Assets", "Samples~"), { recursive: true });
  await fs.mkdir(path.join(workspace, "Assets", ".hidden"), { recursive: true });
  await fs.writeFile(path.join(workspace, "Assets", "Samples~", "Demo.cs"), "", "utf8");
  await fs.writeFile(path.join(workspace, "Assets", "scratch.tmp"), "", "utf8");
  await fs.mkdir(path.join(workspace, "Packages", "com.studio.tool"), { recursive: true });
  await fs.writeFile(path.join(workspace, "Packages", "manifest.json"), "{}", "utf8");
  await fs.writeFile(path.join(workspace, "Packages", "packages-lock.json"), "{}", "utf8");
  await fs.writeFile(path.join(workspace, "Packages", "com.studio.tool", "package.json"), "{}", "utf8");

  const result = await unityMetaDiagnostics(workspace);
  assert.deepEqual(result.findings.map((item) => item.path), ["Packages/com.studio.tool/package.json"]);
});

test("loadConfig warns about unrecognised mode and numeric values", () => {
  const config = loadConfig({ UVCS_MCP_MODE: "Standard", UVCS_CHECKIN_MAX_FILES: "many" });
  assert.equal(config.mode, "readonly");
  assert.equal(config.checkinMaxFiles, 20);
  assert.equal(config.configWarnings.length, 2);
});

test("fleet manifest rejects duplicate paths and ignores process-wide workspace settings", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-fleet-env-"));
  const manifestPath = path.join(root, "workspaces.json");
  await fs.writeFile(manifestPath, JSON.stringify({
    version: 1,
    workspaces: [{ name: "a", path: "./a" }, { name: "b", path: "./A/../a" }]
  }), "utf8");
  await assert.rejects(() => loadFleetConfigs(manifestPath, {}), /Duplicate workspace path/);

  await fs.writeFile(manifestPath, JSON.stringify({
    version: 1,
    workspaces: [{ name: "a", path: "./a" }]
  }), "utf8");
  const { configs } = await loadFleetConfigs(manifestPath, {
    UVCS_ALLOWED_REPOS: "other@server",
    UVCS_AUDIT_LOG: "shared.jsonl",
    UVCS_CM_PATH: "/opt/cm"
  });
  assert.deepEqual(configs[0].allowedRepos, []);
  assert.equal(configs[0].auditLogPath, "");
  assert.equal(configs[0].cmPath, "/opt/cm");
});

test("mcp server publishes instructions and tool annotations", async () => {
  const input = new PassThrough();
  const output = new PassThrough();
  const lines = [];
  output.on("data", (chunk) => {
    lines.push(...chunk.toString("utf8").trim().split(/\n/).filter(Boolean));
  });
  await startServer({ input, output, env: {} });

  input.write(JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "test", version: "0.0.0" } }
  }) + "\n");
  await once(output, "data");
  input.write(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} }) + "\n");
  input.write(JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }) + "\n");
  input.end();
  await once(output, "data");

  const byId = (id) => JSON.parse(lines.find((line) => JSON.parse(line).id === id));
  assert.match(byId(1).result.instructions, /prepare/);
  const undo = byId(2).result.tools.find((tool) => tool.name === "uvcs_undo_confirm");
  assert.equal(undo.annotations.destructiveHint, true);
  const analytics = byId(2).result.tools.find((tool) => tool.name === "uvcs_changeset_analytics");
  assert.equal(analytics.inputSchema.properties.maxResults.type, "integer");
});

test("workspace selector parsing matches real cm wi output", async () => {
  const { parseWorkspaceSelector, parseBranchFromStatusLine } = await import("../src/backend/cm.js");
  assert.deepEqual(parseWorkspaceSelector("BR /main team/tools/game@10.0.0.5:8087\r\n"), {
    type: "BR",
    spec: "/main",
    repository: "team/tools/game",
    server: "10.0.0.5:8087"
  });
  assert.equal(parseWorkspaceSelector("CS 111 MyGame@uvcs.example.com:8087").spec, "111");
  assert.equal(parseWorkspaceSelector("BR /release 1.0 MyGame@uvcs.example.com:8087").spec, "/release 1.0");
  assert.equal(parseWorkspaceSelector("Error: Can't resolve DNS entry"), null);
  assert.equal(parseBranchFromStatusLine("/main/task@MyGame@uvcs.example.com:8087 (cs:11 - head)"), "/main/task");
  assert.equal(parseBranchFromStatusLine("cs:11@MyGame@uvcs.example.com:8087 (head)"), null);
});

test("branch safety report never mistakes the repository for the branch", async () => {
  const { branchSafetyReport } = await import("../src/services/safety.js");
  const backend = {
    branchInfo: async () => ({ branchLine: "cs:11@MyGame@uvcs.example.com:8087 (head)", branch: null }),
    pendingChanges: async () => ({ stdout: "" }),
    findChangesets: async () => ({ stdout: "" })
  };
  await assert.rejects(() => branchSafetyReport({ backend }), (error) => error.code === "CURRENT_BRANCH_UNKNOWN");
  const report = await branchSafetyReport({
    backend: { ...backend, branchInfo: async () => ({ branchLine: "/main/task@MyGame@uvcs.example.com:8087 (cs:11 - head)" }) }
  });
  assert.equal(report.currentBranch, "/main/task");
});

test("policy checks reject a missing workspace before repository identity", async () => {
  const config = standardConfig({ workspace: path.join(os.tmpdir(), "uvcs-mcp-missing-workspace"), allowedRepos: ["MyGame@uvcs.example.com:8087"] });
  const backend = { workspaceInfo: async () => ({}), status: async () => ({ stdout: "" }) };
  await assert.rejects(
    () => createTools({ config, backend }).call("uvcs_workspace_status", {}),
    (error) => error.code === "WORKSPACE_NOT_FOUND"
  );
});

test("a confirm after expiry reports CONFIRM_TOKEN_EXPIRED", async () => {
  const { createConfirmToken, consumeConfirmToken } = await import("../src/policy/policy.js");
  const { token } = createConfirmToken({ action: "add", payload: {}, ttlSec: -1, context: "ws" });
  createConfirmToken({ action: "add", payload: {}, ttlSec: 60, context: "ws" });
  assert.throws(() => consumeConfirmToken({ token, action: "add", context: "ws" }), (error) => error.code === "CONFIRM_TOKEN_EXPIRED");
});

test("branch names cannot contain dot segments", async () => {
  const tools = createTools({ config: standardConfig(), backend: {} });
  for (const branch of ["/main/../x", "/main/./x"]) {
    await assert.rejects(
      () => tools.call("uvcs_branch_create_prepare", { branch, fromChangeset: "cs:1" }),
      (error) => error.code === "INVALID_BRANCH_SPEC",
      branch
    );
  }
});
