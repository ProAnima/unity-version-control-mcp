import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { mergeCodexServer } from "../src/cli/codex-toml.js";

const execFileAsync = promisify(execFile);
const packageVersion = JSON.parse(await fs.readFile(new URL("../package.json", import.meta.url), "utf8")).version;

// Every CLI run gets a throwaway home so no real client config is read or written.
async function sandbox(prefix = "uvcs-mcp-init-") {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  const home = path.join(root, "home");
  const workspace = path.join(root, "workspace");
  await fs.mkdir(home, { recursive: true });
  await fs.mkdir(path.join(workspace, ".plastic"), { recursive: true });
  await fs.writeFile(path.join(workspace, ".plastic", "plastic.workspace"), "workspace\nguid\n", "utf8");
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("UVCS_")));
  Object.assign(env, {
    HOME: home,
    USERPROFILE: home,
    APPDATA: path.join(home, "AppData", "Roaming"),
    XDG_CONFIG_HOME: path.join(home, ".config"),
    CODEX_HOME: path.join(home, ".codex")
  });
  return { root, home, workspace, env };
}

function runCli(args, { env, cwd = process.cwd() }) {
  return execFileAsync(process.execPath, [path.resolve("src/cli.js"), ...args], { env, cwd });
}

test("init-local dry-run emits Cursor config that runs this checkout", async () => {
  const box = await sandbox();
  const { stdout } = await runCli([
    "init-local",
    "--yes",
    "--dry-run",
    "--client=cursor",
    `--workspace=${box.workspace}`
  ], box);

  assert.match(stdout, /Source: local/);
  assert.match(stdout, /"mcpServers"/);
  assert.match(stdout, /"uvcs"/);
  assert.match(stdout, /src\\\\cli\.js|src\/cli\.js/);
  assert.doesNotMatch(stdout, /@proanima\/uvcs-mcp/);
});

test("npm setup pins the released package version in generated client config", async () => {
  const box = await sandbox();
  const { stdout } = await runCli([
    "init",
    "--yes",
    "--dry-run",
    "--client=cursor",
    `--workspace=${box.workspace}`
  ], box);

  assert.match(stdout, new RegExp(`@proanima/uvcs-mcp@${packageVersion.replaceAll(".", "\\.")}`));
});

test("Codex TOML merge replaces an existing server and all descendant tables", () => {
  const existing = [
    "model = \"gpt-5\"",
    "",
    "[mcp_servers.uvcs]",
    "command = \"old\"",
    "args = [\"old.js\"]",
    "",
    "[mcp_servers.uvcs.env]",
    "UVCS_WORKSPACE = \"old-workspace\"",
    "",
    "[mcp_servers.other]",
    "command = \"keep\"",
    ""
  ].join("\n");

  const { text: merged } = mergeCodexServer(existing, "uvcs", {
    command: "new",
    args: ["new.js"],
    env: { UVCS_FLEET_MANIFEST: "fleet.json" }
  });

  assert.equal((merged.match(/\[mcp_servers\.uvcs\]/g) ?? []).length, 1);
  assert.equal((merged.match(/\[mcp_servers\.uvcs\.env\]/g) ?? []).length, 1);
  assert.doesNotMatch(merged, /old-workspace|old\.js/);
  assert.match(merged, /\[mcp_servers\.other\]\ncommand = "keep"/);
});

test("init-local dry-run emits Codex TOML mcp server", async () => {
  const box = await sandbox();
  const { stdout } = await runCli([
    "init-local",
    "--yes",
    "--dry-run",
    "--client=codex",
    `--workspace=${box.workspace}`
  ], box);

  assert.match(stdout, /\[mcp_servers\.uvcs\]/);
  assert.match(stdout, /\[mcp_servers\.uvcs\.env\]/);
  assert.match(stdout, /UVCS_WORKSPACE/);
  assert.match(stdout, /Source: local/);
  assert.ok(stdout.includes(path.join(box.home, ".codex", "config.toml")), "Codex target honours CODEX_HOME");
});

test("init-local dry-run supports Claude Code, OpenCode, Antigravity, and Kiro", async () => {
  const box = await sandbox();
  const { stdout } = await runCli([
    "init-local",
    "--yes",
    "--dry-run",
    "--client=claude-code,opencode,antigravity,antigravity-global,kiro",
    `--workspace=${box.workspace}`
  ], box);

  assert.match(stdout, /\.mcp\.json/);
  assert.match(stdout, /opencode\.json/);
  assert.ok(stdout.includes(path.join(box.workspace, ".agents", "mcp_config.json")));
  assert.ok(stdout.includes(path.join(box.home, ".gemini", "config", "mcp_config.json")));
  assert.match(stdout, /\.kiro[\\/]settings[\\/]mcp\.json/);
  assert.match(stdout, /"type": "stdio"/);
  assert.match(stdout, /"type": "local"/);
  assert.match(stdout, /"environment"/);
  assert.match(stdout, /"autoApprove": \[\]/);
  assert.match(stdout, /claude mcp add --env .* --scope user --transport stdio uvcs -- /);
});

test("init-local dry-run supports global project clients", async () => {
  const box = await sandbox();
  const { stdout } = await runCli([
    "init-local",
    "--yes",
    "--dry-run",
    "--client=cursor-global,opencode-global,kiro-global,windsurf",
    `--workspace=${box.workspace}`
  ], box);

  assert.ok(stdout.includes(path.join(box.home, ".cursor", "mcp.json")));
  assert.ok(stdout.includes(path.join(box.home, ".config", "opencode", "opencode.json")));
  assert.ok(stdout.includes(path.join(box.home, ".kiro", "settings", "mcp.json")));
  assert.ok(stdout.includes(path.join(box.home, ".codeium", "windsurf", "mcp_config.json")));
  assert.doesNotMatch(stdout, /Project dir:/);
});

test("manifest dry-run emits one fleet server for multiple workspaces by default", async () => {
  const box = await sandbox("uvcs-mcp-fleet-");
  const manifestPath = path.join(box.root, "workspaces.json");
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

  const { stdout } = await runCli([
    "init",
    "--yes",
    "--dry-run",
    "--client=cursor,codex",
    `--manifest=${manifestPath}`
  ], { ...box, cwd: box.root });

  assert.match(stdout, /Workspaces: 2/);
  assert.match(stdout, /uvcs-game-client/);
  assert.match(stdout, /uvcs-game-server/);
  assert.match(stdout, /Fleet layout: single \(1 MCP server\)/);
  assert.match(stdout, /UVCS_FLEET_MANIFEST/);
  assert.match(stdout, /\[mcp_servers\.uvcs\]/);
  assert.doesNotMatch(stdout, /\[mcp_servers\.uvcs-game-client\]/);
});

test("manifest can still emit one isolated MCP server per workspace", async () => {
  const box = await sandbox("uvcs-mcp-fleet-isolated-");
  const manifestPath = path.join(box.root, "workspaces.json");
  await fs.writeFile(manifestPath, JSON.stringify({
    version: 1,
    defaults: { safety: "readonly", installSource: "local" },
    workspaces: [
      { name: "project-a", path: "./a" },
      { name: "project-b", path: "./b" }
    ]
  }), "utf8");

  const { stdout } = await runCli([
    "init",
    "--yes",
    "--dry-run",
    "--client=codex",
    "--fleet-layout=isolated",
    `--manifest=${manifestPath}`
  ], box);

  assert.match(stdout, /Fleet layout: isolated \(2 MCP servers\)/);
  assert.match(stdout, /\[mcp_servers\.uvcs-project-a\]/);
  assert.match(stdout, /\[mcp_servers\.uvcs-project-b\]/);
  assert.match(stdout, /UVCS_ALLOWED_WORKSPACES/);
});

test("guarded safety reports why repository detection failed and how to pin it", async () => {
  const box = await sandbox();
  const plain = path.join(box.root, "plain");
  await fs.mkdir(plain);
  const missingCm = path.join(box.root, "missing", process.platform === "win32" ? "cm.exe" : "cm");

  await assert.rejects(
    () => runCli([
      "init",
      "--yes",
      "--dry-run",
      "--client=cursor",
      `--workspace=${plain}`,
      "--safety=guarded",
      `--cm=${missingCm}`
    ], box),
    (error) => {
      assert.equal(error.code, 1);
      assert.match(error.stderr, /requires allowedRepos/);
      assert.match(error.stderr, /Reason: cm failed: .*ENOENT/);
      assert.match(error.stderr, /--allowed-repos=repo@server:8087/);
      assert.doesNotMatch(error.stderr, /\n\s+at /, "no stack trace");
      return true;
    }
  );
});

test("single-workspace setup reports the configured workspace name and UVCS warning", async () => {
  const box = await sandbox();
  const workspace = path.join(box.root, "not-workspace");
  await fs.mkdir(workspace);
  const { stdout } = await runCli([
    "init-local",
    "--yes",
    "--dry-run",
    "--client=cursor",
    `--workspace=${workspace}`,
    "--name=cartalith",
    "--safety=readonly"
  ], box);

  assert.match(stdout, /cartalith:/);
  assert.match(stdout, /not currently recognized as a UVCS workspace/);
  assert.match(stdout, /uvcs_setup_status/);
  assert.match(stdout, /uvcs_style_init_prepare/);
});

test("guarded safety detects repository identity from the workspace", async () => {
  const box = await sandbox();
  await fs.writeFile(path.join(box.workspace, ".plastic", "plastic.workspace"), [
    "repository=game-client",
    "server=cloud:8087"
  ].join("\n"), "utf8");

  const { stdout } = await runCli([
    "init",
    "--yes",
    "--dry-run",
    "--client=cursor",
    `--workspace=${box.workspace}`,
    "--safety=guarded"
  ], box);

  assert.match(stdout, /UVCS_ALLOWED_REPOS/);
  assert.match(stdout, /game-client@cloud:8087/);
});

test("project client configs are refused inside the package folder unless --project-dir is explicit", async () => {
  const box = await sandbox();
  await assert.rejects(
    () => runCli(["init", "--yes", "--dry-run", "--client=cursor", "--workspace=."], box),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /Refusing to write project client configs/);
      assert.match(error.stderr, /--project-dir=/);
      return true;
    }
  );

  const { stdout } = await runCli(["init", "--yes", "--dry-run", "--client=cursor", "--workspace=.", "--project-dir=."], box);
  assert.match(stdout, /Project dir: .* \(--project-dir\)/);
});

test("init writes project files into the workspace, not the current directory", async () => {
  const box = await sandbox();
  const cwd = path.join(box.root, "elsewhere");
  await fs.mkdir(cwd);

  const { stdout } = await runCli(["init", "--yes", "--client=cursor,claude-code", `--workspace=${box.workspace}`], { ...box, cwd });

  assert.match(stdout, /Project dir: .* \(workspace\)/);
  assert.ok(stdout.includes(path.join(box.workspace, ".cursor", "mcp.json")));
  await fs.access(path.join(box.workspace, ".cursor", "mcp.json"));
  await fs.access(path.join(box.workspace, ".mcp.json"));
  assert.deepEqual(await fs.readdir(cwd), []);
});

test("init exits non-zero on unknown flags and clients and accepts --key value", async () => {
  const box = await sandbox();
  for (const args of [
    ["init", "--yes", "--clients=cursor"],
    ["init", "--yes", "--client=cursor,vscode"],
    ["init", "--yes", "--workspace"],
    ["init", "--yes", "cursor"]
  ]) {
    await assert.rejects(() => runCli(args, box), (error) => {
      assert.equal(error.code, 2, args.join(" "));
      assert.doesNotMatch(error.stderr, /\n\s+at /);
      return true;
    });
  }
  await assert.rejects(() => runCli(["init", "--yes", "--client=vscode"], box), /Valid clients: antigravity, antigravity-global, claude-code/);
  await assert.rejects(() => runCli(["init", "--clients=cursor"], box), /did you mean --client\?/);

  const { stdout } = await runCli(["init", "--yes", "--dry-run", "--client", "codex", "--workspace", box.workspace], box);
  assert.ok(stdout.includes(`uvcs: ${box.workspace} `));
});
