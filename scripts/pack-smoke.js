#!/usr/bin/env node
// Installs the packed tarball into a clean project and starts the installed
// binary, so a release can never ship files or dependencies the runtime needs
// but the package does not contain.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";

const root = path.resolve(import.meta.dirname, "..");
const temp = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-pack-"));

try {
  const packed = npm(["pack", "--silent", "--pack-destination", temp], root).trim().split(/\r?\n/).at(-1);
  const project = path.join(temp, "project");
  await fs.mkdir(project);
  await fs.writeFile(path.join(project, "package.json"), JSON.stringify({ name: "uvcs-mcp-pack-smoke", private: true }), "utf8");
  npm(["install", "--silent", "--no-audit", "--no-fund", path.join(temp, packed)], project);

  const cli = path.join(project, "node_modules", "@proanima", "uvcs-mcp", "src", "cli.js");
  const help = run(process.execPath, [cli, "--help"], project);
  if (!/uvcs-mcp/i.test(help)) throw new Error(`Unexpected --help output:\n${help}`);

  const tools = await listTools(cli, project);
  if (!tools.includes("uvcs_setup_status")) throw new Error(`Installed server did not list uvcs tools: ${tools.join(", ")}`);
  process.stdout.write(`Pack smoke OK: ${packed}, ${tools.length} tools\n`);
} finally {
  await fs.rm(temp, { recursive: true, force: true });
}

// `npm run` exposes the npm CLI script, which runs through node without a
// shell on every platform; fall back to the npm binary on POSIX.
function npm(args, cwd) {
  const npmCli = process.env.npm_execpath;
  if (npmCli?.endsWith(".js")) return run(process.execPath, [npmCli, ...args], cwd);
  if (process.platform === "win32") throw new Error("Run this script through `npm run smoke:pack`");
  return run("npm", args, cwd);
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed:\n${result.stderr || result.stdout || result.error}`);
  }
  return result.stdout;
}

async function listTools(cli, cwd) {
  const server = spawn(process.execPath, [cli], { cwd, stdio: ["pipe", "pipe", "inherit"], env: { ...process.env, UVCS_WORKSPACE: "" } });
  const responses = new Map();
  const waiters = new Map();
  readline.createInterface({ input: server.stdout }).on("line", (line) => {
    const message = JSON.parse(line);
    if (waiters.has(message.id)) waiters.get(message.id)(message);
    else responses.set(message.id, message);
  });
  const request = (id, method, params) => new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), 15_000);
    waiters.set(id, (message) => {
      clearTimeout(timer);
      resolve(message);
    });
    server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
  });

  try {
    await request(1, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "uvcs-mcp-pack-smoke", version: "0.0.0" }
    });
    server.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized", params: {} })}\n`);
    const list = await request(2, "tools/list", {});
    return list.result.tools.map((tool) => tool.name);
  } finally {
    server.kill();
  }
}
