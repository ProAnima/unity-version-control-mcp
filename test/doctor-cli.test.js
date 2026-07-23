import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

test("fleet doctor checks every named workspace from one manifest", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-fleet-doctor-"));
  const workspaces = [];
  for (const name of ["project-a", "project-b"]) {
    const workspace = path.join(root, name);
    await fs.mkdir(path.join(workspace, ".plastic"), { recursive: true });
    await fs.writeFile(path.join(workspace, ".plastic", "plastic.workspace"), [
      `repository=${name}`,
      "server=fake-server:8087"
    ].join("\n"), "utf8");
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
