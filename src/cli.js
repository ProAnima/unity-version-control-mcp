#!/usr/bin/env node
import { startServer } from "./server.js";
import { runDoctor } from "./cli/doctor.js";
import { runInit } from "./cli/init.js";

const [command, ...args] = process.argv.slice(2);
const invokedAsDoctor = process.argv[1]?.toLowerCase().includes("doctor");

async function main() {
  if (invokedAsDoctor || command === "doctor") {
    await runDoctor(args);
    return;
  }

  if (command === "init") {
    await runInit(args);
    return;
  }

  if (command === "init-local") {
    await runInit(["--install-source=local", ...args]);
    return;
  }

  if (command === "--help" || command === "-h" || command === "help") {
    process.stdout.write(`UVCS MCP

Usage:
  uvcs-mcp              Start MCP stdio server
  uvcs-mcp init         Configure MCP clients
  uvcs-mcp init-local   Configure clients to run this git checkout
  uvcs-mcp doctor       Check cm, workspace, and server readiness

Setup:
  --workspace=<path>    Configure one workspace
  --manifest=<file>     Configure named workspaces from a fleet manifest
  --fleet-layout=<mode> single (one MCP) | isolated (one MCP per workspace)
  --safety=<profile>    readonly | guarded | standard
  --allowed-repos=<ids> Semicolon-separated repository@server allowlist
  --print-config        Preview without writing

Environment:
  UVCS_WORKSPACE        Required for normal server use
  UVCS_FLEET_MANIFEST   Optional manifest for one-process multi-workspace mode
  UVCS_CM_PATH          Optional path to cm executable
  UVCS_MCP_MODE         readonly | standard
`);
    return;
  }

  await startServer();
}

main().catch((error) => {
  process.stderr.write(`[uvcs-mcp] ${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
