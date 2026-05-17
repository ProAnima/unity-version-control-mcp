import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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
