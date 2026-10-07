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
  switchCommand,
  undoCommand
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
    branchInfo: async () => {
      const raw = toRawResult(await runCmSpec(config, CM_COMMANDS.statusText));
      const firstLine = raw.stdout.split(/\r?\n/).find((line) => line.trim().length > 0) ?? "";
      const selector = await readWorkspaceSelector(config);
      return {
        ...raw,
        branchLine: firstLine,
        selector,
        branch: await resolveCurrentBranch(config, selector, firstLine)
      };
    },
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
    undo: (payload) => runCmSpec(config, undoCommand(payload)).then(toRawResult),
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
    workspaceInfo: () => resolveWorkspaceInfo(config)
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

  const cwd = spec.requireWorkspace === false ? process.cwd() : config.workspace;
  try {
    return await runProcess(config.cmPath, [...(config.cmArgs ?? []), ...spec.args], {
      cwd,
      allowFailure: spec.allowFailure,
      timeoutMs: spec.timeoutMs ?? (spec.mutation ? config.writeTimeoutMs : config.readTimeoutMs),
      maxOutputBytes: config.maxOutputBytes,
      outputEncoding: config.cmOutputEncoding,
      env: {
        ...process.env,
        LC_ALL: "C.UTF-8"
      }
    });
  } catch (error) {
    if (error?.code === "PROCESS_SPAWN_FAILED" && cwd && !(await isDirectory(cwd))) {
      throw new UvcsError(`Workspace directory does not exist: ${cwd}`, {
        code: "WORKSPACE_NOT_FOUND",
        details: { workspace: cwd }
      });
    }
    if (spec.mutation && (error?.code === "PROCESS_TIMEOUT" || error?.code === "PROCESS_OUTPUT_TOO_LARGE")) {
      throw new UvcsError(`cm ${spec.args[0]} was interrupted; the workspace state is unknown`, {
        code: "WRITE_INTERRUPTED_STATE_UNKNOWN",
        details: { reason: error.code, ...error.details }
      });
    }
    throw error;
  }
}

async function isDirectory(directory) {
  try {
    return (await fs.stat(directory)).isDirectory();
  } catch {
    return false;
  }
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

export async function resolveWorkspaceInfo(config) {
  const fileInfo = await readWorkspaceInfo(config.workspace);
  if (hasWorkspaceIdentity(fileInfo)) return fileInfo;

  const selector = await readWorkspaceSelector(config);
  if (selector?.repository && selector?.server) {
    return { ...fileInfo, repository: selector.repository, server: selector.server };
  }

  try {
    const result = await runCmSpec(config, CM_COMMANDS.statusHeader);
    return {
      ...fileInfo,
      ...parseStatusHeaderWorkspaceInfo(result.stdout)
    };
  } catch {
    return fileInfo;
  }
}

async function readWorkspaceSelector(config) {
  try {
    return parseWorkspaceSelector((await runCmSpec(config, CM_COMMANDS.workspaceSelector)).stdout);
  } catch {
    return null;
  }
}

// `cm wi --machinereadable` prints `<BR|CS|LB> <spec> <repository>@<server>`,
// for example `BR /main MyGame@uvcs.example.com:8087`. Branch names may
// contain spaces, so the identity is the last token.
export function parseWorkspaceSelector(text) {
  const line = String(text ?? "").split(/\r?\n/).map((item) => item.trim()).find(Boolean) ?? "";
  const match = line.match(/^(BR|CS|LB|SH)\s+(.+)\s+(\S+@\S+)$/);
  if (!match) return null;
  const [, type, spec, identity] = match;
  const separator = identity.lastIndexOf("@");
  return {
    type,
    spec: spec.trim(),
    repository: identity.slice(0, separator),
    server: identity.slice(separator + 1)
  };
}

async function resolveCurrentBranch(config, selector, statusLine) {
  if (selector?.type === "BR") return selector.spec;
  if (selector?.type === "CS" && /^\d+$/.test(selector.spec)) {
    try {
      const result = await runCmSpec(config, findChangesetsCommand({
        query: `where changesetid=${selector.spec}`,
        format: "{branch}"
      }));
      const branch = result.stdout.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
      if (branch) return branch.startsWith("/") ? branch : `/${branch}`;
    } catch {
      // Fall back to the status header below.
    }
  }
  return parseBranchFromStatusLine(statusLine);
}

// Status headers look like `/main@repo@server (cs:11 - head)` when a branch
// is loaded and `cs:11@repo@server (head)` when a changeset is loaded.
export function parseBranchFromStatusLine(line) {
  const text = String(line ?? "").trim();
  if (text.startsWith("/")) return text.slice(0, text.indexOf("@") === -1 ? undefined : text.indexOf("@"));
  return null;
}

export function parseStatusHeaderWorkspaceInfo(text) {
  const header = String(text ?? "").split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? "";
  // Plastic uses different parenthesized suffixes for a clean workspace
  // (`(cs:… - head)`) and a workspace with pending changes (`(head:…)`).
  // Neither suffix is part of the repository server identity.
  const identity = header.replace(/\s+\([^)]*\)\s*$/, "");
  const parts = identity.split("@");
  if (parts.length < 3) return {};
  const repository = parts.slice(1, -1).join("@").trim();
  const server = parts.at(-1).trim();
  if (!repository || !server) return {};
  return { repository, server };
}

export function parseWorkspaceFile(text) {
  const info = {};
  const positional = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.includes("=") ? "=" : line.includes(":") ? ":" : null;
    if (!separator) {
      positional.push(line);
      continue;
    }
    const [key, ...rest] = line.split(separator);
    info[key.trim()] = rest.join(separator).trim();
  }
  if (Object.keys(info).length === 0 && positional.length > 0) {
    info.workspaceName = positional[0];
    if (positional[1]) info.workspaceGuid = positional[1];
  }
  return info;
}

function hasWorkspaceIdentity(info) {
  const entries = Object.entries(info ?? {});
  const values = entries.map(([, value]) => String(value ?? "").trim());
  if (values.some((value) => value.includes("@"))) return true;
  const byKey = Object.fromEntries(entries.map(([key, value]) => [key.toLowerCase(), String(value ?? "").trim()]));
  const repository = byKey.repository || byKey.repo || byKey.reponame;
  const server = byKey.server || byKey.repositoryserver || byKey.servername;
  return Boolean(repository && server);
}
