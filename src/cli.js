#!/usr/bin/env node
import { startServer } from "./server.js";
import { doctorHelp, runDoctor } from "./cli/doctor.js";
import { initHelp, runInit } from "./cli/init.js";

const [command, ...args] = process.argv.slice(2);

async function main() {
  if (command === "doctor") {
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
  uvcs-mcp                        Start the MCP stdio server (what MCP clients run)
  uvcs-mcp init [options]         Configure MCP clients
  uvcs-mcp init-local [options]   Configure clients to run this git checkout
  uvcs-mcp doctor [options]       Check cm and one workspace, or every workspace in a manifest
  uvcs-mcp <command> --help       Show the options of one command

Setup options (init, init-local)
--------------------------------
${withoutUsage(initHelp())}
Safety profiles:
  readonly                 Inspection and planning only
  guarded                  Recommended writes: pins workspace and repository
  standard                 Writes with workspace pinning; trusted workspaces only

Doctor options
--------------
${withoutUsage(doctorHelp())}
After setup:
  uvcs-mcp doctor --workspace=<path>
  uvcs-mcp doctor --manifest=<file>
  Then restart the MCP client and call uvcs_setup_status.

Environment:
  UVCS_WORKSPACE           Required for normal server use
  UVCS_FLEET_MANIFEST      Optional manifest for one-process multi-workspace mode
  UVCS_CM_PATH             Optional path to the cm executable
  UVCS_MCP_MODE            readonly | standard
  CODEX_HOME               Codex config folder used by init --client=codex
`);
    return;
  }

  await startServer();
}

function withoutUsage(help) {
  return help.replace(/^Usage:\n(?: {2}.*\n)+\n/, "");
}

main().catch((error) => {
  // Setup errors carry an exit code and a message meant for people, not a stack.
  process.stderr.write(`[uvcs-mcp] ${error?.exitCode ? error.message : error?.stack ?? error}\n`);
  process.exitCode = error?.exitCode ?? 1;
});
