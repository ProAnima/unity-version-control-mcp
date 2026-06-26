import fs from "node:fs/promises";
import path from "node:path";
import {
  CM_COMMANDS,
  addCommand,
  branchCreateCommand,
  checkinCommand,
  diffFileCommand,
  findBranchesCommand,
  findChangesetsCommand,
  labelCreateCommand,
  mergeCommand,
  switchCommand
} from "./commands.js";
import { runProcess } from "./process-runner.js";
import { parseMachineReadableTable, toRawResult } from "./machine-readable.js";
import { UvcsError } from "./errors.js";

export function createCmBackend(config) {
  return {
    config,
    runSpec: (spec) => runCmSpec(config, spec),
    status: () => runCmSpec(config, CM_COMMANDS.statusShort).then(toRawResult),
    pendingChanges: async () => {
      const withRevisionId = await runCmSpec(config, CM_COMMANDS.statusMachineWithRevisionId);
      if (withRevisionId.code === 0) {
        return toRawResult(withRevisionId, {
          format: "machinereadable",
          includeRevisionId: true,
          rows: parseMachineReadableTable(withRevisionId.stdout)
        });
      }

      const result = await runCmSpec(config, CM_COMMANDS.statusMachine);
      return toRawResult(result, {
        format: "machinereadable",
        includeRevisionId: false,
        rows: parseMachineReadableTable(result.stdout)
      });
    },
    branchInfo: () => runCmSpec(config, CM_COMMANDS.statusText).then((result) => {
      const raw = toRawResult(result);
      const firstLine = raw.stdout.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
      return {
        ...raw,
        branchLine: firstLine
      };
    }),
    locks: async () => {
      const machine = await runCmSpec(config, CM_COMMANDS.locksMachine);
      if (machine.code === 0) {
        return toRawResult(machine, {
          format: "machinereadable",
          rows: parseMachineReadableTable(machine.stdout)
        });
      }
      return runCmSpec(config, CM_COMMANDS.locksText).then(toRawResult);
    },
    diffFile: (filePath) => runCmSpec(config, diffFileCommand(filePath)).then(toRawResult),
    add: (itemPath) => runCmSpec(config, addCommand(itemPath)).then(toRawResult),
    createBranch: (payload) => runCmSpec(config, branchCreateCommand(payload)).then(toRawResult),
    createLabel: (payload) => runCmSpec(config, labelCreateCommand(payload)).then(toRawResult),
    switchTo: (target) => runCmSpec(config, switchCommand(target)).then(toRawResult),
    merge: (payload) => runCmSpec(config, mergeCommand(payload)).then(toRawResult),
    update: () => runCmSpec(config, CM_COMMANDS.updateMachine).then(toRawResult),
    checkin: (message) => runCmSpec(config, checkinCommand(message)).then(toRawResult),
    findBranches: (payload) => runCmSpec(config, findBranchesCommand(payload)).then(toRawResult),
    findChangesets: (payload) => runCmSpec(config, findChangesetsCommand(payload)).then(toRawResult),
    version: () => runCmSpec(config, CM_COMMANDS.version).then(toRawResult),
    showCommands: () => runCmSpec(config, CM_COMMANDS.showCommands).then(toRawResult),
    apiHelp: () => runCmSpec(config, CM_COMMANDS.apiHelp).then(toRawResult),
    workspaceInfo: () => readWorkspaceInfo(config.workspace)
  };
}

export async function runCmSpec(config, spec) {
  if (spec.requireWorkspace !== false && !config.workspace) {
    throw new UvcsError("UVCS_WORKSPACE is required", { code: "WORKSPACE_REQUIRED" });
  }

  if (spec.mutation && config.mode !== "standard") {
    throw new UvcsError("Mutating cm commands require UVCS_MCP_MODE=standard", {
      code: "MUTATION_REQUIRES_STANDARD_MODE",
      details: {
        args: spec.args
      }
    });
  }

  return await runProcess(config.cmPath, [...(config.cmArgs ?? []), ...spec.args], {
    cwd: config.workspace || process.cwd(),
    allowFailure: spec.allowFailure,
    timeoutMs: spec.timeoutMs,
    env: {
      ...process.env,
      LC_ALL: "C.UTF-8"
    }
  });
}

export async function readWorkspaceInfo(workspace) {
  if (!workspace) return {};

  const workspaceFile = path.join(workspace, ".plastic", "plastic.workspace");
  try {
    const text = await fs.readFile(workspaceFile, "utf8");
    return parseWorkspaceFile(text);
  } catch {
    return {};
  }
}

export function parseWorkspaceFile(text) {
  const info = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.includes("=") ? "=" : line.includes(":") ? ":" : null;
    if (!separator) continue;
    const [key, ...rest] = line.split(separator);
    info[key.trim()] = rest.join(separator).trim();
  }
  return info;
}
