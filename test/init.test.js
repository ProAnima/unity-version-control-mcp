import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("init-local dry-run emits Cursor config that runs this checkout", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "src/cli.js",
    "init-local",
    "--yes",
    "--dry-run",
    "--client=cursor",
    "--workspace=."
  ]);

  assert.match(stdout, /Source: local/);
  assert.match(stdout, /"mcpServers"/);
  assert.match(stdout, /"uvcs"/);
  assert.match(stdout, /src\\\\cli\.js|src\/cli\.js/);
  assert.doesNotMatch(stdout, /@proanima\/uvcs-mcp/);
});

test("init-local dry-run emits Codex TOML mcp server", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "src/cli.js",
    "init-local",
    "--yes",
    "--dry-run",
    "--client=codex",
    "--workspace=."
  ]);

  assert.match(stdout, /\[mcp_servers\.uvcs\]/);
  assert.match(stdout, /\[mcp_servers\.uvcs\.env\]/);
  assert.match(stdout, /UVCS_WORKSPACE/);
  assert.match(stdout, /Source: local/);
});

test("init-local dry-run supports Claude Code, OpenCode, Antigravity, and Kiro", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "src/cli.js",
    "init-local",
    "--yes",
    "--dry-run",
    "--client=claude-code,opencode,antigravity,kiro",
    "--workspace=."
  ]);

  assert.match(stdout, /\.mcp\.json/);
  assert.match(stdout, /opencode\.json/);
  assert.match(stdout, /mcp_config\.json/);
  assert.match(stdout, /\.kiro[\\/]settings[\\/]mcp\.json/);
  assert.match(stdout, /"type": "stdio"/);
  assert.match(stdout, /"type": "local"/);
  assert.match(stdout, /"environment"/);
  assert.match(stdout, /"autoApprove": \[\]/);
});

test("init-local dry-run supports global project clients", async () => {
  const { stdout } = await execFileAsync(process.execPath, [
    "src/cli.js",
    "init-local",
    "--yes",
    "--dry-run",
    "--client=cursor-global,opencode-global,kiro-global,windsurf",
    "--workspace=."
  ]);

  assert.match(stdout, /\.cursor[\\/]mcp\.json/);
  assert.match(stdout, /\.config[\\/]opencode[\\/]opencode\.json|AppData|opencode\.json/);
  assert.match(stdout, /\.kiro[\\/]settings[\\/]mcp\.json/);
  assert.match(stdout, /\.codeium[\\/]windsurf[\\/]mcp_config\.json/);
});

test("manifest dry-run emits one fleet server for multiple workspaces by default", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-fleet-"));
  const manifestPath = path.join(root, "workspaces.json");
  await fs.writeFile(manifestPath, JSON.stringify({
    version: 1,
    defaults: {
      safety: "guarded",
      installSource: "local",
      checkinMaxFiles: 12,
      tokenTtlSec: 90
    },
    workspaces: [
      {
        name: "game-client",
        path: "./client",
        allowedRepos: ["client@server:8087"]
      },
      {
        name: "game-server",
        path: "./server",
        allowedRepos: ["server@server:8087"]
      }
    ]
  }), "utf8");

  const { stdout } = await execFileAsync(process.execPath, [
    "src/cli.js",
    "init",
    "--yes",
    "--dry-run",
    "--client=cursor,codex",
    `--manifest=${manifestPath}`
  ]);

  assert.match(stdout, /Workspaces: 2/);
  assert.match(stdout, /uvcs-game-client/);
  assert.match(stdout, /uvcs-game-server/);
  assert.match(stdout, /Fleet layout: single \(1 MCP server\)/);
  assert.match(stdout, /UVCS_FLEET_MANIFEST/);
  assert.match(stdout, /\[mcp_servers\.uvcs\]/);
  assert.doesNotMatch(stdout, /\[mcp_servers\.uvcs-game-client\]/);
});

test("manifest can still emit one isolated MCP server per workspace", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-fleet-isolated-"));
  const manifestPath = path.join(root, "workspaces.json");
  await fs.writeFile(manifestPath, JSON.stringify({
    version: 1,
    defaults: { safety: "readonly", installSource: "local" },
    workspaces: [
      { name: "project-a", path: "./a" },
      { name: "project-b", path: "./b" }
    ]
  }), "utf8");

  const { stdout } = await execFileAsync(process.execPath, [
    "src/cli.js",
    "init",
    "--yes",
    "--dry-run",
    "--client=codex",
    "--fleet-layout=isolated",
    `--manifest=${manifestPath}`
  ]);

  assert.match(stdout, /Fleet layout: isolated \(2 MCP servers\)/);
  assert.match(stdout, /\[mcp_servers\.uvcs-project-a\]/);
  assert.match(stdout, /\[mcp_servers\.uvcs-project-b\]/);
  assert.match(stdout, /UVCS_ALLOWED_WORKSPACES/);
});

test("guarded safety requires an explicit repository allowlist", async () => {
  await assert.rejects(
    () => execFileAsync(process.execPath, [
      "src/cli.js",
      "init",
      "--yes",
      "--dry-run",
      "--client=cursor",
      "--workspace=.",
      "--safety=guarded"
    ]),
    /requires allowedRepos/
  );
});

test("guarded safety detects repository identity from the workspace", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-guarded-"));
  await fs.mkdir(path.join(workspace, ".plastic"));
  await fs.writeFile(path.join(workspace, ".plastic", "plastic.workspace"), [
    "repository=game-client",
    "server=cloud:8087"
  ].join("\n"), "utf8");

  const { stdout } = await execFileAsync(process.execPath, [
    "src/cli.js",
    "init",
    "--yes",
    "--dry-run",
    "--client=cursor",
    `--workspace=${workspace}`,
    "--safety=guarded"
  ]);

  assert.match(stdout, /UVCS_ALLOWED_REPOS/);
  assert.match(stdout, /game-client@cloud:8087/);
});
