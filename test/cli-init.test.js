import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { CLIENT_NAMES, INIT_OPTIONS, initHelp, runInit } from "../src/cli/init.js";

const execFileAsync = promisify(execFile);
const NPM_SPEC = /^@proanima\/uvcs-mcp@\d+\.\d+\.\d+/;

async function sandbox() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-cli-init-"));
  const home = path.join(root, "home");
  const workspace = path.join(root, "workspace");
  await fs.mkdir(home, { recursive: true });
  await fs.mkdir(path.join(workspace, ".plastic"), { recursive: true });
  await fs.writeFile(path.join(workspace, ".plastic", "plastic.workspace"), "workspace\nguid\n", "utf8");
  return { root, home, workspace };
}

// Runs init in-process with an injected platform, home, PATH and clock.
async function init(box, args, overrides = {}) {
  let output = "";
  const target = args.some((arg) => arg.startsWith("--manifest")) ? [] : [`--workspace=${box.workspace}`];
  await runInit(["--yes", ...target, ...args], {
    cwd: box.root,
    homeDir: box.home,
    env: { CODEX_HOME: path.join(box.home, ".codex") },
    stdin: { isTTY: false },
    stdout: { write: (text) => { output += text; return true; } },
    cmCandidates: [],
    now: () => new Date(2026, 0, 2, 3, 4, 5),
    ...overrides
  });
  return output;
}

const readJson = async (file) => JSON.parse(await fs.readFile(file, "utf8"));
const backups = async (dir, name) => (await fs.readdir(dir)).filter((file) => file.startsWith(`${name}.`) && file.endsWith(".bak")).sort();

test("npm source on Windows starts npx through cmd /c for every client", async () => {
  const box = await sandbox();
  await init(box, ["--client=cursor,claude-code,opencode,kiro,codex"], { platform: "win32" });

  const cursor = (await readJson(path.join(box.workspace, ".cursor", "mcp.json"))).mcpServers.uvcs;
  assert.equal(cursor.command, "cmd");
  assert.deepEqual(cursor.args.slice(0, 3), ["/c", "npx", "-y"]);
  assert.match(cursor.args[3], NPM_SPEC);
  assert.equal((await readJson(path.join(box.workspace, ".mcp.json"))).mcpServers.uvcs.command, "cmd");
  assert.equal((await readJson(path.join(box.workspace, ".kiro", "settings", "mcp.json"))).mcpServers.uvcs.command, "cmd");
  assert.deepEqual((await readJson(path.join(box.workspace, "opencode.json"))).mcp.uvcs.command.slice(0, 4), ["cmd", "/c", "npx", "-y"]);
  const codex = await fs.readFile(path.join(box.home, ".codex", "config.toml"), "utf8");
  assert.match(codex, /command = "cmd"\nargs = \["\/c", "npx", "-y", "@proanima\/uvcs-mcp@/);
  assert.match(codex, /startup_timeout_sec = 60/);
});

test("npm source on other platforms runs npx directly", async () => {
  const box = await sandbox();
  await init(box, ["--client=cursor"], { platform: "linux" });

  const cursor = (await readJson(path.join(box.workspace, ".cursor", "mcp.json"))).mcpServers.uvcs;
  assert.equal(cursor.command, "npx");
  assert.equal(cursor.args[0], "-y");
  assert.match(cursor.args[1], NPM_SPEC);
});

test("fleet entries use the same Windows launcher and carry the detected cm path", async () => {
  const box = await sandbox();
  const manifest = path.join(box.root, "workspaces.json");
  await fs.writeFile(manifest, JSON.stringify({ version: 1, workspaces: [{ name: "game", path: "./workspace" }] }), "utf8");
  const cm = path.join(box.root, "bin", "cm.exe");

  await init(box, ["--client=cursor-global", `--manifest=${manifest}`, `--cm=${cm}`], { platform: "win32" });
  const entry = (await readJson(path.join(box.home, ".cursor", "mcp.json"))).mcpServers.uvcs;
  assert.equal(entry.command, "cmd");
  assert.equal(entry.env.UVCS_FLEET_MANIFEST, manifest);
  assert.equal(entry.env.UVCS_CM_PATH, cm);
});

test("local install source is refused when running from the npx cache", async () => {
  const box = await sandbox();
  const packageRoot = path.join(box.root, "npm-cache", "_npx", "1a2b", "node_modules", "@proanima", "uvcs-mcp");
  await assert.rejects(
    () => init(box, ["--dry-run", "--client=codex", "--install-source=local"], { packageRoot }),
    (error) => error.exitCode === 1 && /temporary npx cache/.test(error.message) && /--install-source=npm/.test(error.message)
  );
  const output = await init(box, ["--dry-run", "--client=codex"], { packageRoot });
  assert.match(output, /Source: npm/);
});

test("project files go to --project-dir or the workspace, and a missing --project-dir is an error", async () => {
  const box = await sandbox();
  const project = path.join(box.root, "project");
  await fs.mkdir(project);

  const explicit = await init(box, ["--dry-run", "--client=cursor,antigravity", `--project-dir=${project}`]);
  assert.ok(explicit.includes(path.join(project, ".cursor", "mcp.json")));
  assert.ok(explicit.includes(path.join(project, ".agents", "mcp_config.json")));

  const missingWorkspace = { ...box, workspace: path.join(box.root, "not-yet") };
  const fallback = await init(missingWorkspace, ["--dry-run", "--client=cursor"]);
  assert.match(fallback, /Project dir: .* \(current directory\)/);

  await assert.rejects(
    () => init(box, ["--dry-run", "--client=cursor", `--project-dir=${path.join(box.root, "nope")}`]),
    (error) => error.exitCode === 2 && /--project-dir does not exist/.test(error.message)
  );
  await assert.rejects(
    () => init(missingWorkspace, ["--dry-run", "--client=cursor"], { packageRoot: box.root }),
    /Refusing to write project client configs/
  );
});

test("backups are timestamped, never overwritten, and skipped for unchanged files", async () => {
  const box = await sandbox();
  const dir = path.join(box.workspace, ".cursor");
  const file = path.join(dir, "mcp.json");
  const original = `${JSON.stringify({ mcpServers: { other: { command: "keep" } } })}\n`;
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(file, original, "utf8");

  const first = await init(box, ["--client=cursor"]);
  assert.match(first, /Backup: .*mcp\.json\.20260102030405\.bak/);
  assert.deepEqual(await backups(dir, "mcp.json"), ["mcp.json.20260102030405.bak"]);

  const second = await init(box, ["--client=cursor"]);
  assert.match(second, /Unchanged: /);
  assert.doesNotMatch(second, /Backup:/);
  assert.deepEqual(await backups(dir, "mcp.json"), ["mcp.json.20260102030405.bak"]);

  await init(box, ["--client=cursor", "--name=second"]);
  await init(box, ["--client=cursor", "--name=third"], { now: () => new Date(2026, 0, 2, 3, 9, 0) });
  assert.deepEqual(await backups(dir, "mcp.json"), [
    "mcp.json.20260102030405-1.bak",
    "mcp.json.20260102030405.bak",
    "mcp.json.20260102030900.bak"
  ]);
  assert.equal(await fs.readFile(path.join(dir, "mcp.json.20260102030405.bak"), "utf8"), original);

  const noBackup = await init(box, ["--client=cursor", "--name=fourth", "--no-backup"]);
  assert.match(noBackup, /Overwrite without backup/);
  assert.equal((await backups(dir, "mcp.json")).length, 3);
  const config = await readJson(file);
  assert.deepEqual(Object.keys(config.mcpServers).sort(), ["fourth", "other", "second", "third", "uvcs"]);
});

test("a malformed config aborts before any file is written", async () => {
  const box = await sandbox();
  await fs.mkdir(path.join(box.workspace, ".cursor"), { recursive: true });
  const broken = "{\n  // comment\n  \"mcpServers\": {}\n}\n";
  await fs.writeFile(path.join(box.workspace, ".cursor", "mcp.json"), broken, "utf8");
  const codexFile = path.join(box.home, ".codex", "config.toml");

  await assert.rejects(
    () => init(box, ["--client=codex,cursor,claude-code"]),
    (error) => {
      assert.equal(error.exitCode, 1);
      assert.match(error.message, /nothing was written/);
      assert.ok(error.message.includes(path.join(box.workspace, ".cursor", "mcp.json")));
      assert.match(error.message, /not valid JSON/);
      assert.match(error.message, /--skip-invalid/);
      return true;
    }
  );
  await assert.rejects(() => fs.access(codexFile), { code: "ENOENT" });
  await assert.rejects(() => fs.access(path.join(box.workspace, ".mcp.json")), { code: "ENOENT" });
  assert.equal(await fs.readFile(path.join(box.workspace, ".cursor", "mcp.json"), "utf8"), broken);

  const skipped = await init(box, ["--client=codex,cursor", "--skip-invalid"]);
  assert.match(skipped, /Skipped cursor: .*not valid JSON/);
  assert.match(skipped, /Add this entry by hand:\n\{\n {2}"mcpServers"/);
  await fs.access(codexFile);
  assert.equal(await fs.readFile(path.join(box.workspace, ".cursor", "mcp.json"), "utf8"), broken);
});

test("OpenCode JSONC configs are refused instead of losing comments", async () => {
  const box = await sandbox();
  await fs.writeFile(path.join(box.workspace, "opencode.jsonc"), "{ // keep\n}\n", "utf8");
  await assert.rejects(() => init(box, ["--client=opencode"]), /opencode\.jsonc exists next to it/);

  const globalDir = path.join(box.home, ".config", "opencode");
  await fs.mkdir(globalDir, { recursive: true });
  await fs.writeFile(path.join(globalDir, "opencode.jsonc"), "{}\n", "utf8");
  await assert.rejects(() => init(box, ["--client=opencode-global"]), /opencode\.jsonc exists next to it/);
});

test("empty and BOM-prefixed JSON files are merged", async () => {
  const box = await sandbox();
  await fs.writeFile(path.join(box.workspace, ".mcp.json"), "", "utf8");
  await fs.writeFile(path.join(box.workspace, "opencode.json"), `${String.fromCharCode(0xfeff)}{"theme":"dark"}`, "utf8");

  await init(box, ["--client=claude-code,opencode"]);
  assert.equal((await readJson(path.join(box.workspace, ".mcp.json"))).mcpServers.uvcs.type, "stdio");
  const opencode = await readJson(path.join(box.workspace, "opencode.json"));
  assert.equal(opencode.theme, "dark");
  assert.equal(opencode.mcp.uvcs.type, "local");
});

test("--print-config shows only the uvcs entries, never other servers or settings", async () => {
  const box = await sandbox();
  const claudeFile = path.join(box.workspace, ".mcp.json");
  const claudeText = JSON.stringify({ mcpServers: { github: { command: "gh", env: { GITHUB_TOKEN: "ghp_secret" } } } });
  await fs.writeFile(claudeFile, claudeText, "utf8");
  const codexFile = path.join(box.home, ".codex", "config.toml");
  await fs.mkdir(path.dirname(codexFile), { recursive: true });
  const codexText = "model = \"private-model\"\n\n[mcp_servers.other.env]\nAPI_KEY = \"sk-secret\"\n";
  await fs.writeFile(codexFile, codexText, "utf8");

  const output = await init(box, ["--print-config", "--client=claude-code,codex"]);

  assert.doesNotMatch(output, /ghp_secret|sk-secret|private-model|github/);
  assert.ok(output.includes(`claude-code: ${claudeFile} (would merge)`));
  assert.ok(output.includes(`codex: ${codexFile} (would merge)`));
  assert.match(output, /"uvcs": \{/);
  assert.match(output, /\[mcp_servers\.uvcs\]/);
  assert.equal(await fs.readFile(claudeFile, "utf8"), claudeText);
  assert.equal(await fs.readFile(codexFile, "utf8"), codexText);
});

test("cm is resolved to an absolute path and written as UVCS_CM_PATH", async () => {
  const box = await sandbox();
  const bin = path.join(box.root, "bin");
  await fs.mkdir(bin);
  const cm = path.join(bin, process.platform === "win32" ? "cm.exe" : "cm");
  await fs.writeFile(cm, "", { mode: 0o755 });

  const found = await init(box, ["--client=cursor"], { env: { PATH: bin } });
  assert.ok(found.includes(`cm: ${cm} (auto-detected)`));
  assert.equal((await readJson(path.join(box.workspace, ".cursor", "mcp.json"))).mcpServers.uvcs.env.UVCS_CM_PATH, cm);

  const fromCandidates = await init(box, ["--dry-run", "--client=cursor"], { env: {}, cmCandidates: [cm] });
  assert.ok(fromCandidates.includes(`cm: ${cm} (auto-detected)`));

  const fromEnv = await init(box, ["--dry-run", "--client=cursor"], { env: { UVCS_CM_PATH: "/opt/custom/cm" } });
  assert.match(fromEnv, /cm: \/opt\/custom\/cm \(UVCS_CM_PATH\)/);

  const relative = await init(box, ["--dry-run", "--client=cursor", "--cm=bin/cm"]);
  assert.ok(relative.includes(`cm: ${path.join(box.root, "bin", "cm")} (--cm)`));

  const missing = await init(box, ["--client=claude-code"], { env: {} });
  assert.match(missing, /Warning: cm was not found/);
  assert.equal((await readJson(path.join(box.workspace, ".mcp.json"))).mcpServers.uvcs.env.UVCS_CM_PATH, undefined);
});

test("Claude Code gets an equivalent user-scope command hint", async () => {
  const box = await sandbox();
  const output = await init(box, ["--dry-run", "--client=claude-code", "--cm=cm"], { platform: "linux" });
  const line = output.split("\n").find((item) => item.trim().startsWith("claude mcp add"));
  assert.ok(line, output);
  assert.match(line, /--env 'UVCS_WORKSPACE=.*' /);
  assert.match(line, /--env UVCS_CM_PATH=cm --scope user --transport stdio uvcs -- npx -y @proanima\/uvcs-mcp@/);
});

test("init help documents every supported option and client", () => {
  const help = initHelp();
  for (const option of Object.keys(INIT_OPTIONS)) {
    assert.ok(help.includes(`--${option}`), `init help documents --${option}`);
  }
  for (const client of CLIENT_NAMES) {
    assert.match(help, new RegExp(`^ {6}${client} `, "m"), `init help lists ${client}`);
  }
});

test("top-level help includes the init and doctor options", async () => {
  const { stdout } = await execFileAsync(process.execPath, [path.resolve("src/cli.js"), "--help"]);
  for (const option of [...Object.keys(INIT_OPTIONS), "allow-no-workspace"]) {
    assert.ok(stdout.includes(`--${option}`), `--help documents --${option}`);
  }
});

test("a path containing 'doctor' no longer switches the server into doctor mode", async () => {
  const cli = pathToFileURL(path.resolve("src/cli.js")).href;
  const { stdout } = await execFileAsync(process.execPath, [
    "--input-type=module",
    "-e",
    `await import(${JSON.stringify(cli)});`,
    path.join(os.tmpdir(), "doctor-smith", "uvcs-mcp", "cli.js"),
    "--help"
  ]);
  assert.match(stdout, /uvcs-mcp init \[options\]/);
  assert.doesNotMatch(stdout, /UVCS MCP Doctor/);
});
