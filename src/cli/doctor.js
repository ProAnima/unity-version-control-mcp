import { loadConfig } from "../config/env.js";
import { loadFleetConfigs } from "../config/fleet.js";
import { createCmBackend } from "../backend/cm.js";
import { createTools } from "../tools/index.js";

export async function runDoctor(args = []) {
  const env = { ...process.env };
  const options = applyCliEnv(args, env);
  if (options.manifest) {
    await runFleetDoctor(options.manifest, env);
    return;
  }

  const config = loadConfig(env);
  const report = await createTools({
    config,
    backend: createCmBackend(config)
  }).call("uvcs_doctor", {});

  process.stdout.write("UVCS MCP Doctor\n");
  process.stdout.write("---------------\n");
  printDoctorReport(report);
  setDoctorExitCode(report);
}

async function runFleetDoctor(manifestPath, env) {
  const fleet = await loadFleetConfigs(manifestPath, env);
  const results = await Promise.all(fleet.configs.map(async (config) => {
    try {
      const report = await createTools({
        config,
        backend: createCmBackend(config)
      }).call("uvcs_doctor", {});
      return { config, report };
    } catch (error) {
      return { config, error };
    }
  }));

  process.stdout.write("UVCS MCP Fleet Doctor\n");
  process.stdout.write("---------------------\n");
  process.stdout.write(`Manifest:   ${fleet.manifestPath}\n`);
  process.stdout.write(`Workspaces: ${results.length}\n`);
  for (const result of results) {
    process.stdout.write(`\n[${result.config.workspaceName}]\n`);
    if (result.error) {
      process.stdout.write(`Workspace: ${result.config.workspace}\n`);
      process.stdout.write(`Error:     ${result.error.message}\n`);
      process.exitCode = 1;
      continue;
    }
    printDoctorReport(result.report);
    setDoctorExitCode(result.report);
  }
}

function printDoctorReport(report) {
  process.stdout.write(`Node:      ${report.node}\n`);
  process.stdout.write(`Mode:      ${report.mode}\n`);
  process.stdout.write(`cm:        ${report.cmPath} (${report.cmAvailable ? "ok" : "failed"})\n`);
  process.stdout.write(`Product:   ${report.product ?? "unknown"}\n`);
  process.stdout.write(`Version:   ${report.cmVersion ?? "unknown"}\n`);
  process.stdout.write(`API:       ${report.apiAvailable ? "available" : "not available"}\n`);
  process.stdout.write(`Workspace: ${report.workspace ?? "not set"}\n`);
  process.stdout.write(`Status:    ${report.statusOk ? "ok" : "not checked/failed"}\n`);
  process.stdout.write(`Caps:      statusMR=${report.capabilities.machineReadableStatus}, locksMR=${report.capabilities.machineReadableLocks}, includeRevId=${report.capabilities.includeRevisionIdStatus}\n`);

  if (Object.keys(report.workspaceInfo).length > 0) {
    process.stdout.write(`Workspace file: ${JSON.stringify(report.workspaceInfo)}\n`);
  }

  if (report.errors.length > 0) {
    process.stdout.write("\nErrors:\n");
    for (const error of report.errors) {
      process.stdout.write(`- ${error}\n`);
    }
    process.stdout.write("\nHints:\n");
    for (const hint of doctorHints(report)) {
      process.stdout.write(`- ${hint}\n`);
    }
  }
}

function applyCliEnv(args, env) {
  const options = {};
  for (const arg of args) {
    const separator = arg.indexOf("=");
    const key = separator >= 0 ? arg.slice(0, separator) : arg;
    const value = separator >= 0 ? arg.slice(separator + 1) : "";
    if (key === "--workspace" && value) env.UVCS_WORKSPACE = value;
    if (key === "--cm" && value) env.UVCS_CM_PATH = value;
    if (key === "--mode" && value) env.UVCS_MCP_MODE = value;
    if (key === "--manifest" && value) options.manifest = value;
  }
  return options;
}

function setDoctorExitCode(report) {
  if (report.errors.length > 0) process.exitCode = 1;
}

function doctorHints(report) {
  const hints = [];
  if (!report.cmAvailable) {
    hints.push("Install Plastic SCM / Unity Version Control CLI, add cm to PATH, or set UVCS_CM_PATH.");
  }
  if (!report.workspace) {
    hints.push("Set UVCS_WORKSPACE to a Plastic SCM / Unity Version Control source-control workspace.");
  }
  if (report.workspace && !report.statusOk) {
    hints.push("Verify the path is an existing workspace and that the local client is logged in to its server.");
  }
  if (!report.capabilities.machineReadableStatus && report.statusOk) {
    hints.push("This cm version may not support machine-readable status; keep text fallback enabled before adding structured parsers.");
  }
  return hints.length > 0 ? hints : ["Run with --workspace=<path> and --cm=<path> to isolate environment issues."];
}
