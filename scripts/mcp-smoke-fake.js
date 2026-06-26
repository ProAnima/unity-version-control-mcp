#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-fake-"));
const workspace = path.join(tempRoot, "workspace");
const fakeCm = path.join(root, "scripts", "fake-cm.js");

await fs.mkdir(path.join(workspace, ".plastic"), { recursive: true });
await fs.writeFile(path.join(workspace, ".plastic", "plastic.workspace"), [
  "repository=fake-repo",
  "server=fake-server:8087",
  ""
].join("\n"), "utf8");

try {
  const result = await runSmoke();
  process.stdout.write(result.stdout);
  process.stderr.write(result.stderr);
  if (result.code !== 0) {
    process.exitCode = result.code;
  }
} finally {
  await fs.rm(tempRoot, { recursive: true, force: true });
}

async function runSmoke() {
  return await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ["scripts/mcp-smoke-plastic.js", workspace], {
      cwd: root,
      windowsHide: true,
      env: {
        ...process.env,
        UVCS_CM_PATH: process.execPath,
        UVCS_CM_ARGS: fakeCm,
        UVCS_ALLOWED_WORKSPACES: workspace,
        UVCS_ALLOWED_REPOS: "fake-repo@fake-server:8087"
      }
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ code, stdout, stderr });
    });
  });
}
