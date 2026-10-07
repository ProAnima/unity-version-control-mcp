import fs from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import { loadConfig } from "../config/env.js";
import { loadFleetConfigs } from "../config/fleet.js";
import { createCmBackend } from "../backend/cm.js";
import { createTools } from "../tools/index.js";
import { findCmExecutable } from "../platform/paths.js";
import { parseArgsError } from "./init.js";

export const DOCTOR_OPTIONS = {
  help: { type: "boolean", short: "h" },
  workspace: { type: "string" },
  manifest: { type: "string" },
  cm: { type: "string" },
  mode: { type: "string" },
  "allow-no-workspace": { type: "boolean" }
};

export function doctorHelp() {
  return `Usage:
  uvcs-mcp doctor [options]
  uvcs-mcp-doctor [options]

Checks the cm CLI and one workspace, or every workspace of a fleet manifest.
Exits with code 1 when a check fails.

Options:
  --workspace=<path>       Workspace root, the folder that contains .plastic
                           (default: $UVCS_WORKSPACE)
  --manifest=<file>        Check every workspace of a fleet manifest instead
  --cm=<path>              cm executable (default: $UVCS_CM_PATH, else cm on PATH)
  --mode=<mode>            readonly | standard (default: $UVCS_MCP_MODE or readonly)
  --allow-no-workspace     Only check cm; do not fail when no workspace is set
  -h, --help               Show this help
`;
}

export async function runDoctor(args = [], { env: baseEnv = process.env, stdout = process.stdout } = {}) {
  const options = parseDoctorArgs(args);
  const write = (text) => stdout.write(text);
  if (options.help) {
    write(doctorHelp());
    return;
  }

  const env = { ...baseEnv };
  if (options.workspace) env.UVCS_WORKSPACE = options.workspace;
  if (options.cm) env.UVCS_CM_PATH = options.cm;
  if (options.mode) env.UVCS_MCP_MODE = options.mode;
  if (options.manifest) {
    if (options.workspace) throw usageError("Use either --workspace or --manifest, not both");
    await runFleetDoctor(options.manifest, env, write);
    return;
  }

  const config = loadConfig(env);
  write("UVCS MCP Doctor\n");
  write("---------------\n");
  const result = await diagnose(config, env);
  if (result.error) {
    write(`Workspace: ${config.workspace}\n`);
    write(`Error:     ${result.error.message}\n`);
    markFailed();
    return;
  }
  printDoctorReport(result.report, write);
  setDoctorExitCode(result.report);

  if (!config.workspace) {
    write("\nWarning: no workspace is configured, so only cm was checked.\n");
    write("Hint: pass --workspace=<path> (the folder that contains .plastic), set UVCS_WORKSPACE, or use --manifest=<file>.\n");
    if (!options.allowNoWorkspace) markFailed();
  }
}

function parseDoctorArgs(args) {
  let parsed;
  try {
    parsed = parseArgs({ args, options: DOCTOR_OPTIONS, strict: true, allowPositionals: false });
  } catch (error) {
    throw parseArgsError(error, DOCTOR_OPTIONS, "uvcs-mcp doctor --help");
  }
  const options = {};
  for (const [key, value] of Object.entries(parsed.values)) {
    if (typeof value === "string" && value.trim() === "") throw usageError(`--${key} requires a value`);
    options[key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase())] = typeof value === "string" ? value.trim() : value;
  }
  if (options.mode && !["readonly", "standard"].includes(options.mode)) {
    throw usageError(`--mode must be readonly or standard (got "${options.mode}")`);
  }
  return options;
}

function usageError(message) {
  return Object.assign(new Error(message), { exitCode: 2 });
}

async function runFleetDoctor(manifestPath, env, write) {
  let fleet;
  try {
    fleet = await loadFleetConfigs(manifestPath, env);
  } catch (error) {
    throw Object.assign(new Error(`Cannot load workspace manifest ${path.resolve(manifestPath)}: ${error.message}`), { exitCode: 1 });
  }
  const results = await Promise.all(fleet.configs.map(async (config) => ({
    config,
    ...(await diagnose(config, env))
  })));

  write("UVCS MCP Fleet Doctor\n");
  write("---------------------\n");
  write(`Manifest:   ${fleet.manifestPath}\n`);
  write(`Workspaces: ${results.length}\n`);
  for (const result of results) {
    write(`\n[${result.config.workspaceName}]\n`);
    if (result.error) {
      write(`Workspace: ${result.config.workspace}\n`);
      write(`Error:     ${result.error.message}\n`);
      markFailed();
      continue;
    }
    printDoctorReport(result.report, write);
    setDoctorExitCode(result.report);
  }
}

// A missing or non-UVCS workspace would make every cm call fail with a misleading
// spawn error, so only the workspace-independent cm checks run in that case.
async function diagnose(config, env) {
  const problem = config.workspace ? await workspaceProblem(config.workspace) : null;
  const checked = problem ? { ...config, workspace: "" } : config;
  let report;
  try {
    report = await createTools({
      config: checked,
      backend: createCmBackend(checked)
    }).call("uvcs_doctor", {});
  } catch (error) {
    return { error };
  }

  if (problem) {
    report.workspace = config.workspace;
    report.workspaceProblem = problem;
    report.errors.unshift(problem.message);
  }
  if (!report.cmAvailable && report.errors.some((message) => /\bENOENT\b/.test(message))) {
    const found = await findCmExecutable({ env });
    if (found && found !== config.cmPath) report.cmSuggestion = found;
  }
  return { report };
}

async function workspaceProblem(workspace) {
  let stat;
  try {
    stat = await fs.stat(workspace);
  } catch {
    return {
      message: `Workspace path not found: ${workspace}`,
      hint: "Check the path and pass the workspace root (the folder that contains .plastic) with --workspace=<path>."
    };
  }
  if (!stat.isDirectory()) {
    return {
      message: `Workspace path is not a directory: ${workspace}`,
      hint: "Pass the workspace root folder (the one that contains .plastic), not a file."
    };
  }
  try {
    await fs.access(path.join(workspace, ".plastic", "plastic.workspace"));
    return null;
  } catch {
    return {
      message: `Not a UVCS workspace: ${workspace} has no .plastic/plastic.workspace`,
      hint: "Pass the workspace root (the folder that contains .plastic), or create/download the workspace in the Unity Version Control client first."
    };
  }
}

function printDoctorReport(report, write) {
  write(`Node:      ${report.node}\n`);
  write(`Mode:      ${report.mode}\n`);
  write(`cm:        ${report.cmPath} (${report.cmAvailable ? "ok" : "failed"})\n`);
  write(`Product:   ${report.product ?? "unknown"}\n`);
  write(`Version:   ${report.cmVersion ?? "unknown"}\n`);
  write(`API:       ${report.apiAvailable ? "available" : "not available"}\n`);
  write(`Workspace: ${report.workspace ?? "not set"}${report.workspaceProblem ? " (not checked)" : ""}\n`);
  write(`Status:    ${report.statusOk ? "ok" : "not checked/failed"}\n`);
  write(`Caps:      statusMR=${report.capabilities.machineReadableStatus}, locksMR=${report.capabilities.machineReadableLocks}, includeRevId=${report.capabilities.includeRevisionIdStatus}\n`);

  if (Object.keys(report.workspaceInfo).length > 0) {
    write(`Workspace file: ${JSON.stringify(report.workspaceInfo)}\n`);
  }

  if (report.errors.length > 0) {
    write("\nErrors:\n");
    for (const error of report.errors) {
      write(`- ${error}\n`);
    }
    write("\nHints:\n");
    for (const hint of doctorHints(report)) {
      write(`- ${hint}\n`);
    }
  }
}

function setDoctorExitCode(report) {
  if (report.errors.length > 0) markFailed();
}

function markFailed() {
  process.exitCode = 1;
}

function doctorHints(report) {
  const hints = [];
  if (report.workspaceProblem) {
    hints.push(report.workspaceProblem.hint);
  }
  if (!report.cmAvailable) {
    hints.push(report.cmSuggestion
      ? `cm was found at ${report.cmSuggestion}; pass --cm="${report.cmSuggestion}" or set UVCS_CM_PATH to it.`
      : "Install Plastic SCM / Unity Version Control CLI, add cm to PATH, or set UVCS_CM_PATH.");
  }
  if (!report.workspace) {
    hints.push("Set UVCS_WORKSPACE to a Plastic SCM / Unity Version Control source-control workspace.");
  }
  if (report.workspace && !report.workspaceProblem && !report.statusOk) {
    hints.push("Verify the path is an existing workspace and that the local client is logged in to its server.");
  }
  if (!report.capabilities.machineReadableStatus && report.statusOk) {
    hints.push("This cm version may not support machine-readable status; keep text fallback enabled before adding structured parsers.");
  }
  return hints.length > 0 ? hints : ["Run with --workspace=<path> and --cm=<path> to isolate environment issues."];
}
