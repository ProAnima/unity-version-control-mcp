import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { DOCTOR_OPTIONS } from "../src/cli/doctor.js";

const execFileAsync = promisify(execFile);
const fakeCmEnv = {
  ...Object.fromEntries(Object.entries(process.env).filter(([key]) => !key.startsWith("UVCS_"))),
  UVCS_CM_ARGS: path.resolve("scripts/fake-cm.js")
};

async function runDoctor(args, bin = "src/cli.js") {
  const prefix = bin === "src/cli.js" ? ["doctor"] : [];
  try {
    const { stdout, stderr } = await execFileAsync(process.execPath, [path.resolve(bin), ...prefix, ...args], { env: fakeCmEnv });
    return { code: 0, stdout, stderr };
  } catch (error) {
    return { code: error.code, stdout: error.stdout, stderr: error.stderr };
  }
}

async function fakeWorkspace(root, name) {
  const workspace = path.join(root, name);
  await fs.mkdir(path.join(workspace, ".plastic"), { recursive: true });
  await fs.writeFile(path.join(workspace, ".plastic", "plastic.workspace"), [
    `repository=${name}`,
    "server=fake-server:8087"
  ].join("\n"), "utf8");
  return workspace;
}

test("fleet doctor checks every named workspace from one manifest", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-fleet-doctor-"));
  const workspaces = [];
  for (const name of ["project-a", "project-b"]) {
    await fakeWorkspace(root, name);
    workspaces.push({ name, path: `./${name}` });
  }
  const manifestPath = path.join(root, "workspaces.json");
  await fs.writeFile(manifestPath, JSON.stringify({
    version: 1,
    defaults: {
      safety: "readonly",
      cmPath: process.execPath
    },
    workspaces
  }), "utf8");

  const { stdout } = await execFileAsync(process.execPath, [
    "src/cli.js",
    "doctor",
    `--manifest=${manifestPath}`
  ], {
    env: {
      ...process.env,
      UVCS_CM_ARGS: path.resolve("scripts/fake-cm.js")
    }
  });

  assert.match(stdout, /UVCS MCP Fleet Doctor/);
  assert.match(stdout, /Workspaces: 2/);
  assert.match(stdout, /\[project-a\][\s\S]*Status:\s+ok/);
  assert.match(stdout, /\[project-b\][\s\S]*Status:\s+ok/);
});

test("fleet doctor reports a missing manifest workspace without a cm spawn error", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-fleet-doctor-missing-"));
  await fakeWorkspace(root, "present");
  const manifestPath = path.join(root, "workspaces.json");
  await fs.writeFile(manifestPath, JSON.stringify({
    version: 1,
    defaults: { safety: "readonly", cmPath: process.execPath },
    workspaces: [{ name: "present", path: "./present" }, { name: "gone", path: "./gone" }]
  }), "utf8");

  const result = await runDoctor([`--manifest=${manifestPath}`]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /\[present\][\s\S]*Status:\s+ok/);
  assert.match(result.stdout, /\[gone\][\s\S]*Workspace path not found/);
  assert.doesNotMatch(result.stdout, /ENOENT/);
});

test("doctor accepts --workspace <path> and passes for a valid workspace", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-doctor-ok-"));
  const workspace = await fakeWorkspace(root, "game");

  const result = await runDoctor(["--workspace", workspace, "--cm", process.execPath]);

  assert.equal(result.code, 0, result.stdout);
  assert.match(result.stdout, /Status:\s+ok/);
  assert.ok(result.stdout.includes(`Workspace: ${workspace}\n`));
});

test("doctor reports a missing workspace path instead of a cm spawn failure", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-doctor-missing-"));
  const missing = path.join(root, "does-not-exist");

  const result = await runDoctor([`--workspace=${missing}`, `--cm=${process.execPath}`]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /cm:\s+.* \(ok\)/);
  assert.match(result.stdout, /Workspace path not found/);
  assert.match(result.stdout, /\(not checked\)/);
  assert.match(result.stdout, /folder that contains \.plastic/);
  assert.doesNotMatch(result.stdout, /ENOENT|Install Plastic SCM/);
});

test("doctor reports a folder without .plastic as not a UVCS workspace", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-doctor-plain-"));

  const result = await runDoctor([`--workspace=${root}`, `--cm=${process.execPath}`]);

  assert.equal(result.code, 1);
  assert.match(result.stdout, /Not a UVCS workspace: .* has no \.plastic\/plastic\.workspace/);
});

test("doctor without a workspace warns and fails unless --allow-no-workspace", async () => {
  const strict = await runDoctor([`--cm=${process.execPath}`]);
  assert.equal(strict.code, 1);
  assert.match(strict.stdout, /no workspace is configured/);
  assert.match(strict.stdout, /--workspace=<path>/);

  const allowed = await runDoctor([`--cm=${process.execPath}`, "--allow-no-workspace"]);
  assert.equal(allowed.code, 0, allowed.stdout);
  assert.match(allowed.stdout, /cm:\s+.* \(ok\)/);
});

test("doctor --help prints help instead of running checks, from both entry points", async () => {
  for (const [bin, args] of [["src/cli.js", ["--help"]], ["src/cli.js", ["-h"]], ["src/doctor-cli.js", ["--help"]]]) {
    const result = await runDoctor(args, bin);
    assert.equal(result.code, 0);
    assert.doesNotMatch(result.stdout, /UVCS MCP Doctor/);
    for (const option of Object.keys(DOCTOR_OPTIONS)) {
      assert.ok(result.stdout.includes(`--${option}`), `doctor help documents --${option}`);
    }
  }
});

test("doctor rejects unknown flags, bad modes and conflicting targets with exit code 2", async () => {
  for (const args of [["--bogus"], ["--mode=writeall"], ["--workspace=a", "--manifest=b"], ["--workspace"]]) {
    const result = await runDoctor(args);
    assert.equal(result.code, 2, args.join(" "));
    assert.doesNotMatch(result.stderr, /\n\s+at /);
  }
});
