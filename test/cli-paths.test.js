import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  antigravityGlobalConfigPath,
  cmInstallCandidates,
  codexConfigPath,
  findCmExecutable
} from "../src/platform/paths.js";

test("Codex config honours CODEX_HOME and falls back to ~/.codex", () => {
  const home = path.join("Users", "dev");
  assert.equal(codexConfigPath({ homeDir: home, env: { CODEX_HOME: path.join("custom", "codex") } }), path.join("custom", "codex", "config.toml"));
  assert.equal(codexConfigPath({ homeDir: home, env: {} }), path.join(home, ".codex", "config.toml"));
});

test("Antigravity global config lives under ~/.gemini/config", () => {
  assert.equal(antigravityGlobalConfigPath({ homeDir: "home" }), path.join("home", ".gemini", "config", "mcp_config.json"));
});

test("standard cm install locations are listed per platform", () => {
  assert.ok(cmInstallCandidates({ platform: "win32", env: { ProgramFiles: "C:\\Program Files" } }).includes("C:\\Program Files\\PlasticSCM5\\client\\cm.exe"));
  assert.ok(cmInstallCandidates({ platform: "darwin", env: {} }).includes("/Applications/PlasticSCM.app/Contents/Applications/cm.app/Contents/MacOS/cm"));
  assert.deepEqual(cmInstallCandidates({ platform: "linux", env: {} }), ["/usr/bin/cm", "/opt/plasticscm5/client/cm"]);
});

test("cm is found on PATH before the standard locations and relative PATH entries are ignored", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-cm-"));
  const name = process.platform === "win32" ? "cm.exe" : "cm";
  const [first, second, fallback] = ["first", "second", "fallback"].map((dir) => path.join(root, dir));
  for (const dir of [first, second, fallback]) {
    await fs.mkdir(dir);
  }
  await fs.writeFile(path.join(second, name), "", { mode: 0o755 });
  await fs.writeFile(path.join(fallback, name), "", { mode: 0o755 });
  const separator = process.platform === "win32" ? ";" : ":";
  const pathKey = process.platform === "win32" ? "Path" : "PATH";

  const env = { [pathKey]: ["relative-dir", first, second].join(separator), PATHEXT: ".COM;.EXE;.BAT;.CMD" };
  assert.equal(await findCmExecutable({ env, candidates: [path.join(fallback, name)] }), path.join(second, name));
  assert.equal(await findCmExecutable({ env: { [pathKey]: first }, candidates: [path.join(fallback, name)] }), path.join(fallback, name));
  assert.equal(await findCmExecutable({ env: { [pathKey]: first }, candidates: [] }), null);
});

test("Windows lookup only accepts executables that can run without a shell", { skip: process.platform !== "win32" }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-cm-ext-"));
  await fs.writeFile(path.join(root, "cm.cmd"), "", "utf8");
  assert.equal(await findCmExecutable({ platform: "win32", env: { PATH: root, PATHEXT: ".CMD;.EXE" }, candidates: [] }), null);
  await fs.writeFile(path.join(root, "cm.exe"), "", "utf8");
  assert.equal(await findCmExecutable({ platform: "win32", env: { PATH: `"${root}"`, PATHEXT: ".CMD;.EXE" }, candidates: [] }), path.join(root, "cm.exe"));
});

test("POSIX lookup requires the executable bit", { skip: process.platform === "win32" }, async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-cm-mode-"));
  await fs.writeFile(path.join(root, "cm"), "", { mode: 0o644 });
  assert.equal(await findCmExecutable({ platform: process.platform, env: { PATH: root }, candidates: [] }), null);
  await fs.chmod(path.join(root, "cm"), 0o755);
  assert.equal(await findCmExecutable({ platform: process.platform, env: { PATH: root }, candidates: [] }), path.join(root, "cm"));
});

test("client templates use the current formats and the unversioned package", async () => {
  const dir = new URL("../templates/mcp/", import.meta.url);
  for (const file of await fs.readdir(dir)) {
    const text = await fs.readFile(new URL(file, dir), "utf8");
    assert.match(text, /@proanima\/uvcs-mcp"/, `${file} uses the unversioned package`);
    if (file.endsWith(".json")) JSON.parse(text);
  }

  const zed = JSON.parse(await fs.readFile(new URL("zed.json", dir), "utf8")).context_servers.uvcs;
  assert.equal(zed.command, "npx");
  assert.deepEqual(zed.args, ["-y", "@proanima/uvcs-mcp"]);
  assert.equal(zed.env.UVCS_MCP_MODE, "readonly");
  assert.match(await fs.readFile(new URL("codex.toml", dir), "utf8"), /startup_timeout_sec = 60/);
});
