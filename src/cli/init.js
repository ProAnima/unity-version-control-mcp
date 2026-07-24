import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";
import { createCmBackend } from "../backend/cm.js";
import { loadConfig } from "../config/env.js";
import {
  claudeDesktopConfigPath,
  codexConfigPath,
  cursorGlobalConfigPath,
  kiroGlobalConfigPath,
  opencodeGlobalConfigPath,
  windsurfConfigPath
} from "../platform/paths.js";

const CLIENTS = new Map([
  ["antigravity", antigravityConfig],
  ["claude-code", claudeCodeConfig],
  ["cursor", cursorConfig],
  ["cursor-global", cursorGlobalConfig],
  ["codex", codexConfig],
  ["claude-desktop", claudeDesktopConfig],
  ["kiro", kiroConfig],
  ["kiro-global", kiroGlobalConfig],
  ["opencode", openCodeConfig],
  ["opencode-global", openCodeGlobalConfig],
  ["windsurf", windsurfConfig]
]);

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NPM_PACKAGE_SPEC = "@proanima/uvcs-mcp@1.2.1";

export async function runInit(args = []) {
  const flags = parseFlags(args);
  normalizeInitFlags(flags);
  const interactive = flags.yes !== "true" && process.stdin.isTTY;
  const rl = interactive ? readline.createInterface({ input, output }) : null;

  try {
    const defaultInstallSource = flags.installSource || flags.source || (interactive ? await askChoice(rl, "Install source [local/npm]", "npm") : "npm");
    const clientAnswer = flags.client || (interactive ? await askChoice(rl, "Clients [cursor,codex,claude-desktop,claude-code,opencode,antigravity,kiro,windsurf,all]", "cursor") : "cursor");
    const clients = expandClients(clientAnswer);
    const workspaceEntries = flags.manifest
      ? await loadManifestEntries(flags.manifest, { flags, defaultInstallSource })
      : [await createSingleWorkspaceEntry({ flags, interactive, rl, defaultInstallSource })];
    const fleetLayout = flags.fleetLayout || "single";
    if (!["single", "isolated"].includes(fleetLayout)) {
      throw new Error("fleetLayout must be single or isolated");
    }
    const fleetSources = new Set(workspaceEntries.map((entry) => entry.source));
    if (flags.manifest && fleetLayout === "single" && fleetSources.size !== 1) {
      throw new Error("One-process fleet layout requires one installSource for all workspaces");
    }
    const serverEntries = flags.manifest && fleetLayout === "single"
      ? [createFleetServerEntry({
          name: normalizeServerName(flags.name || "uvcs"),
          manifestPath: flags.manifest,
          installSource: workspaceEntries[0].source
        })]
      : workspaceEntries;

    process.stdout.write("UVCS MCP Setup\n");
    process.stdout.write("--------------\n");
    process.stdout.write(`Workspaces: ${workspaceEntries.length}\n`);
    for (const entry of workspaceEntries) {
      process.stdout.write(`- ${entry.name}: ${entry.block.env.UVCS_WORKSPACE} (${entry.safety}, ${entry.block.env.UVCS_MCP_MODE}, source=${entry.source})\n`);
      for (const warning of entry.warnings ?? []) {
        process.stdout.write(`  Warning: ${warning}\n`);
      }
    }
    if (flags.manifest) process.stdout.write(`Fleet layout: ${fleetLayout} (${serverEntries.length} MCP server${serverEntries.length === 1 ? "" : "s"})\n`);
    if (serverEntries.length === 1) process.stdout.write(`Source: ${serverEntries[0].source}\n`);
    if (flags.dryRun === "true" || flags.printConfig === "true") {
      process.stdout.write("Mode: dry run\n");
    }

    for (const client of clients) {
      const factory = CLIENTS.get(client);
      if (!factory) {
        process.stdout.write(`Skipped unsupported client: ${client}\n`);
        continue;
      }
      const target = factory();
      const result = await mergeClientConfig(target, serverEntries, flags);
      process.stdout.write(`${result.action}: ${result.file}\n`);
    }
    process.stdout.write("Next: restart the MCP client and call uvcs_setup_status.\n");
    if (flags.manifest && fleetLayout === "single") {
      process.stdout.write("Fleet tools require an explicit workspace name from the manifest on every call.\n");
    }
    process.stdout.write("If naming rules are missing, use uvcs_style_init_prepare and uvcs_style_init_confirm in guarded or standard mode.\n");
  } finally {
    rl?.close();
  }
}

function createFleetServerEntry({ name, manifestPath, installSource }) {
  if (!["local", "npm"].includes(installSource)) {
    throw new Error("installSource must be local or npm");
  }
  const env = {
    UVCS_FLEET_MANIFEST: path.resolve(manifestPath)
  };
  const block = installSource === "local"
    ? {
        command: process.execPath,
        args: [path.join(REPO_ROOT, "src", "cli.js")],
        env
      }
    : {
        command: "npx",
        args: ["-y", NPM_PACKAGE_SPEC],
        env
      };
  return {
    name,
    safety: "fleet",
    source: installSource,
    block
  };
}

async function createSingleWorkspaceEntry({ flags, interactive, rl, defaultInstallSource }) {
  const workspace = flags.workspace || process.env.UVCS_WORKSPACE || (interactive ? await rl.question("Workspace path: ") : process.cwd());
  const workspaceName = normalizeServerName(flags.name || "uvcs");
  const requestedMode = flags.mode || process.env.UVCS_MCP_MODE;
  const safety = flags.safety || (requestedMode === "standard" ? "standard" : "readonly");
  const mode = requestedMode || modeForSafety(safety);
  let allowedRepos = splitValues(flags.allowedRepos || process.env.UVCS_ALLOWED_REPOS);
  if (safety === "guarded" && allowedRepos.length === 0) {
    allowedRepos = await detectWorkspaceRepos(workspace, flags.cm || process.env.UVCS_CM_PATH);
  }
  validateSafety(safety, allowedRepos, workspaceName);
  validateSafetyMode(safety, mode, workspaceName);

  return {
    name: workspaceName,
    safety,
    source: defaultInstallSource,
    warnings: await workspaceSetupWarnings(path.resolve(workspace)),
    block: makeServerBlock({
      workspace,
      workspaceName,
      safetyProfile: safety,
      mode,
      cmPath: flags.cm || process.env.UVCS_CM_PATH,
      installSource: defaultInstallSource,
      allowedRepos,
      checkinMaxFiles: positiveInt(flags.checkinMaxFiles, safety === "guarded" ? 20 : undefined, "checkinMaxFiles"),
      tokenTtlSec: positiveInt(flags.tokenTtlSec, safety === "guarded" ? 120 : undefined, "tokenTtlSec"),
      auditLog: flags.auditLog,
      readTimeoutMs: positiveInt(flags.readTimeoutMs, undefined, "readTimeoutMs"),
      writeTimeoutMs: positiveInt(flags.writeTimeoutMs, undefined, "writeTimeoutMs"),
      maxOutputBytes: positiveInt(flags.maxOutputBytes, undefined, "maxOutputBytes")
    })
  };
}

async function loadManifestEntries(manifestPath, { flags, defaultInstallSource }) {
  const absoluteManifest = path.resolve(manifestPath);
  const manifestDir = path.dirname(absoluteManifest);
  const manifest = JSON.parse(await fs.readFile(absoluteManifest, "utf8"));
  assertPlainObject(manifest, "Workspace manifest");
  assertKnownKeys(manifest, ["$schema", "version", "defaults", "workspaces"], "Workspace manifest");
  if (manifest.version !== 1) {
    throw new Error("Workspace manifest version must be 1");
  }
  if (!Array.isArray(manifest.workspaces) || manifest.workspaces.length === 0 || manifest.workspaces.length > 50) {
    throw new Error("Workspace manifest must contain from 1 to 50 workspaces");
  }

  const defaults = manifest.defaults ?? {};
  assertPlainObject(defaults, "Workspace manifest defaults");
  assertKnownKeys(defaults, [
    "safety", "mode", "installSource", "cmPath", "allowedRepos", "checkinMaxFiles",
    "tokenTtlSec", "auditLog", "readTimeoutMs", "writeTimeoutMs", "maxOutputBytes"
  ], "Workspace manifest defaults");
  const names = new Set();
  return await Promise.all(manifest.workspaces.map(async (workspaceConfig) => {
    assertPlainObject(workspaceConfig, "Workspace entry");
    assertKnownKeys(workspaceConfig, [
      "name", "path", "safety", "mode", "installSource", "cmPath", "allowedRepos",
      "checkinMaxFiles", "tokenTtlSec", "auditLog", "readTimeoutMs", "writeTimeoutMs",
      "maxOutputBytes"
    ], "Workspace entry");
    const name = normalizeServerName(workspaceConfig.name);
    if (names.has(name)) throw new Error(`Duplicate workspace name in manifest: ${name}`);
    names.add(name);

    if (typeof workspaceConfig.path !== "string" || workspaceConfig.path.trim().length === 0) {
      throw new Error(`Workspace ${name} requires a path`);
    }
    const workspace = path.resolve(manifestDir, workspaceConfig.path);
    const safety = workspaceConfig.safety ?? defaults.safety ?? "readonly";
    let allowedRepos = normalizeStringList(workspaceConfig.allowedRepos ?? defaults.allowedRepos ?? []);
    if (safety === "guarded" && allowedRepos.length === 0) {
      allowedRepos = await detectWorkspaceRepos(workspace, workspaceConfig.cmPath ?? defaults.cmPath ?? flags.cm ?? process.env.UVCS_CM_PATH);
    }
    validateSafety(safety, allowedRepos, name);
    const mode = workspaceConfig.mode ?? defaults.mode ?? modeForSafety(safety);
    if (!["readonly", "standard"].includes(mode)) {
      throw new Error(`Workspace ${name} mode must be readonly or standard`);
    }
    validateSafetyMode(safety, mode, name);

    return {
      name: `uvcs-${name}`,
      safety,
      source: workspaceConfig.installSource ?? defaults.installSource ?? defaultInstallSource,
      warnings: await workspaceSetupWarnings(workspace),
      block: makeServerBlock({
        workspace,
        workspaceName: name,
        safetyProfile: safety,
        mode,
        cmPath: workspaceConfig.cmPath ?? defaults.cmPath ?? flags.cm ?? process.env.UVCS_CM_PATH,
        installSource: workspaceConfig.installSource ?? defaults.installSource ?? defaultInstallSource,
        allowedRepos,
        checkinMaxFiles: positiveInt(workspaceConfig.checkinMaxFiles ?? defaults.checkinMaxFiles, safety === "guarded" ? 20 : undefined, `${name}.checkinMaxFiles`),
        tokenTtlSec: positiveInt(workspaceConfig.tokenTtlSec ?? defaults.tokenTtlSec, safety === "guarded" ? 120 : undefined, `${name}.tokenTtlSec`),
        auditLog: resolveOptionalPath(manifestDir, workspaceConfig.auditLog ?? defaults.auditLog),
        readTimeoutMs: positiveInt(workspaceConfig.readTimeoutMs ?? defaults.readTimeoutMs, undefined, `${name}.readTimeoutMs`),
        writeTimeoutMs: positiveInt(workspaceConfig.writeTimeoutMs ?? defaults.writeTimeoutMs, undefined, `${name}.writeTimeoutMs`),
        maxOutputBytes: positiveInt(workspaceConfig.maxOutputBytes ?? defaults.maxOutputBytes, undefined, `${name}.maxOutputBytes`)
      })
    };
  }));
}

function modeForSafety(safety) {
  if (safety === "readonly") return "readonly";
  if (safety === "guarded" || safety === "standard") return "standard";
  throw new Error("safety must be readonly, guarded, or standard");
}

function validateSafety(safety, allowedRepos, name) {
  modeForSafety(safety);
  if (safety === "guarded" && allowedRepos.length === 0) {
    throw new Error(`Workspace ${name} uses guarded safety and requires allowedRepos`);
  }
}

function validateSafetyMode(safety, mode, name) {
  if (mode !== modeForSafety(safety)) {
    throw new Error(`Workspace ${name} safety=${safety} requires mode=${modeForSafety(safety)}`);
  }
}

function normalizeServerName(value) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(value)) {
    throw new Error("Workspace name must use lowercase letters, numbers, and dashes");
  }
  return value;
}

function normalizeStringList(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error("allowedRepos must be an array of non-empty strings");
  }
  return value.map((item) => item.trim());
}

function splitValues(value) {
  if (!value) return [];
  return String(value).split(";").map((item) => item.trim()).filter(Boolean);
}

function positiveInt(value, fallback, name) {
  if (value === undefined || value === null || value === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`);
  return parsed;
}

function resolveOptionalPath(baseDir, value) {
  if (!value) return undefined;
  if (typeof value !== "string") throw new Error("auditLog must be a string path");
  return path.resolve(baseDir, value);
}

async function workspaceSetupWarnings(workspace) {
  try {
    const stat = await fs.stat(workspace);
    if (!stat.isDirectory()) return ["Path exists but is not a directory."];
  } catch (error) {
    if (error?.code === "ENOENT") return ["Path does not exist yet."];
    throw error;
  }

  try {
    await fs.access(path.join(workspace, ".plastic", "plastic.workspace"));
    return [];
  } catch (error) {
    if (error?.code === "ENOENT") {
      return ["Path is not currently recognized as a UVCS workspace (.plastic/plastic.workspace is missing)."];
    }
    throw error;
  }
}

async function detectWorkspaceRepos(workspace, cmPath) {
  const info = await createCmBackend(loadConfig({
    ...process.env,
    UVCS_WORKSPACE: path.resolve(workspace),
    UVCS_MCP_MODE: "readonly",
    UVCS_CM_PATH: cmPath || process.env.UVCS_CM_PATH
  })).workspaceInfo();
  const entries = Object.entries(info);
  const direct = entries
    .map(([, value]) => String(value ?? "").trim())
    .filter((value) => value.includes("@"));
  const byKey = Object.fromEntries(entries.map(([key, value]) => [key.toLowerCase(), String(value ?? "").trim()]));
  const repo = byKey.repository || byKey.repo || byKey.name || byKey.reponame;
  const server = byKey.server || byKey.repositoryserver || byKey.servername;
  return [...new Set([...direct, ...(repo && server ? [`${repo}@${server}`] : [])])];
}

function makeServerBlock({ workspace, workspaceName, safetyProfile, mode, cmPath, installSource, allowedRepos = [], checkinMaxFiles, tokenTtlSec, auditLog, readTimeoutMs, writeTimeoutMs, maxOutputBytes }) {
  if (!["local", "npm"].includes(installSource)) {
    throw new Error("installSource must be local or npm");
  }
  const env = {
    UVCS_WORKSPACE: path.resolve(workspace),
    UVCS_WORKSPACE_NAME: workspaceName,
    UVCS_SAFETY_PROFILE: safetyProfile,
    UVCS_MCP_MODE: mode,
    UVCS_ALLOWED_WORKSPACES: path.resolve(workspace)
  };
  if (cmPath) env.UVCS_CM_PATH = cmPath;
  if (allowedRepos.length > 0) env.UVCS_ALLOWED_REPOS = allowedRepos.join(";");
  if (checkinMaxFiles) env.UVCS_CHECKIN_MAX_FILES = String(checkinMaxFiles);
  if (tokenTtlSec) env.UVCS_TOKEN_TTL_SEC = String(tokenTtlSec);
  if (auditLog) env.UVCS_AUDIT_LOG = path.resolve(auditLog);
  if (readTimeoutMs) env.UVCS_READ_TIMEOUT_MS = String(readTimeoutMs);
  if (writeTimeoutMs) env.UVCS_WRITE_TIMEOUT_MS = String(writeTimeoutMs);
  if (maxOutputBytes) env.UVCS_MAX_OUTPUT_BYTES = String(maxOutputBytes);

  if (installSource === "local") {
    return {
      command: process.execPath,
      args: [path.join(REPO_ROOT, "src", "cli.js")],
      env
    };
  }

  return {
    command: "npx",
    args: ["-y", NPM_PACKAGE_SPEC],
    env
  };
}

function assertPlainObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${name} must be an object`);
  }
}

function assertKnownKeys(value, allowed, name) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw new Error(`${name} contains unknown fields: ${unknown.join(", ")}`);
  }
}

async function mergeClientConfig(target, serverEntries, flags) {
  const file = target.file;
  if (target.format === "toml") {
    return await mergeTomlConfig(target, serverEntries, flags);
  }

  let config = {};
  let existed = false;

  try {
    config = JSON.parse(await fs.readFile(file, "utf8"));
    existed = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const next = serverEntries.reduce(
    (current, entry) => target.patch(current, entry.block, entry.name),
    config
  );
  if (flags.dryRun === "true" || flags.printConfig === "true") {
    process.stdout.write(`${file}\n${JSON.stringify(next, null, 2)}\n`);
    return { action: "Dry run", file };
  }

  await fs.mkdir(path.dirname(file), { recursive: true });
  if (existed && flags.backup !== "false") {
    await fs.copyFile(file, `${file}.bak`);
    process.stdout.write(`Backup: ${file}.bak\n`);
  } else if (existed) {
    process.stdout.write(`Overwrite without backup: ${file}\n`);
  }
  await fs.writeFile(file, `${JSON.stringify(next, null, 2)}\n`, "utf8");

  return { action: existed ? "Merged" : "Written", file };
}

async function mergeTomlConfig(target, serverEntries, flags) {
  const file = target.file;
  let text = "";
  let existed = false;

  try {
    text = await fs.readFile(file, "utf8");
    existed = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const next = serverEntries.reduce((current, entry) => {
    const block = target.patch(entry.block, entry.name);
    return replaceTomlTable(current, `mcp_servers.${entry.name}`, block);
  }, text);

  if (flags.dryRun === "true" || flags.printConfig === "true") {
    process.stdout.write(`${file}\n${next}`);
    return { action: "Dry run", file };
  }

  await fs.mkdir(path.dirname(file), { recursive: true });
  if (existed && flags.backup !== "false") {
    await fs.copyFile(file, `${file}.bak`);
    process.stdout.write(`Backup: ${file}.bak\n`);
  } else if (existed) {
    process.stdout.write(`Overwrite without backup: ${file}\n`);
  }
  await fs.writeFile(file, next, "utf8");

  return { action: existed ? "Merged" : "Written", file };
}

function cursorConfig() {
  return {
    file: path.join(process.cwd(), ".cursor", "mcp.json"),
    patch: (config, serverBlock, serverName) => ({
      ...config,
      mcpServers: {
        ...(config.mcpServers ?? {}),
        [serverName]: serverBlock
      }
    })
  };
}

function cursorGlobalConfig() {
  return {
    file: cursorGlobalConfigPath({ homeDir: os.homedir() }),
    patch: (config, serverBlock, serverName) => ({
      ...config,
      mcpServers: {
        ...(config.mcpServers ?? {}),
        [serverName]: serverBlock
      }
    })
  };
}

function antigravityConfig() {
  return {
    file: path.join(process.cwd(), "mcp_config.json"),
    patch: (config, serverBlock, serverName) => ({
      ...config,
      mcpServers: {
        ...(config.mcpServers ?? {}),
        [serverName]: serverBlock
      }
    })
  };
}

function claudeCodeConfig() {
  return {
    file: path.join(process.cwd(), ".mcp.json"),
    patch: (config, serverBlock, serverName) => ({
      ...config,
      mcpServers: {
        ...(config.mcpServers ?? {}),
        [serverName]: {
          type: "stdio",
          ...serverBlock
        }
      }
    })
  };
}

function codexConfig() {
  return {
    file: codexConfigPath({ homeDir: os.homedir() }),
    format: "toml",
    patch: (serverBlock, serverName) => renderCodexToml(serverBlock, serverName)
  };
}

function claudeDesktopConfig() {
  return {
    file: claudeDesktopConfigPath({ homeDir: os.homedir(), env: process.env }),
    patch: (config, serverBlock, serverName) => ({
      ...config,
      mcpServers: {
        ...(config.mcpServers ?? {}),
        [serverName]: serverBlock
      }
    })
  };
}

function kiroConfig() {
  return {
    file: path.join(process.cwd(), ".kiro", "settings", "mcp.json"),
    patch: (config, serverBlock, serverName) => ({
      ...config,
      mcpServers: {
        ...(config.mcpServers ?? {}),
        [serverName]: {
          ...serverBlock,
          disabled: false,
          autoApprove: []
        }
      }
    })
  };
}

function kiroGlobalConfig() {
  return {
    file: kiroGlobalConfigPath({ homeDir: os.homedir() }),
    patch: (config, serverBlock, serverName) => ({
      ...config,
      mcpServers: {
        ...(config.mcpServers ?? {}),
        [serverName]: {
          ...serverBlock,
          disabled: false,
          autoApprove: []
        }
      }
    })
  };
}

function openCodeConfig() {
  return {
    file: path.join(process.cwd(), "opencode.json"),
    patch: (config, serverBlock, serverName) => ({
      ...config,
      mcp: {
        ...(config.mcp ?? {}),
        [serverName]: {
          type: "local",
          command: [serverBlock.command, ...serverBlock.args],
          enabled: true,
          environment: serverBlock.env
        }
      }
    })
  };
}

function openCodeGlobalConfig() {
  return {
    file: opencodeGlobalConfigPath({ homeDir: os.homedir(), env: process.env }),
    patch: (config, serverBlock, serverName) => ({
      ...config,
      mcp: {
        ...(config.mcp ?? {}),
        [serverName]: {
          type: "local",
          command: [serverBlock.command, ...serverBlock.args],
          enabled: true,
          environment: serverBlock.env
        }
      }
    })
  };
}

function windsurfConfig() {
  return {
    file: windsurfConfigPath({ homeDir: os.homedir() }),
    patch: (config, serverBlock, serverName) => ({
      ...config,
      mcpServers: {
        ...(config.mcpServers ?? {}),
        [serverName]: serverBlock
      }
    })
  };
}

function parseFlags(args) {
  const flags = {};
  for (const arg of args) {
    if (!arg.startsWith("--")) continue;
    const [key, value] = arg.slice(2).split("=");
    flags[toCamel(key)] = value ?? "true";
  }
  return flags;
}

function normalizeInitFlags(flags) {
  if (flags.noBackup === "true") flags.backup = "false";
  if (flags.printConfig === "true") flags.dryRun = "true";
}

function toCamel(key) {
  return key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function expandClients(value) {
  if (value === "all") return [...CLIENTS.keys()];
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

async function askChoice(rl, question, fallback) {
  const answer = (await rl.question(`${question} (${fallback}): `)).trim();
  return answer || fallback;
}

function renderCodexToml(serverBlock, serverName) {
  const lines = [
    `[mcp_servers.${serverName}]`,
    `command = ${tomlString(serverBlock.command)}`,
    `args = ${tomlArray(serverBlock.args)}`,
    "",
    `[mcp_servers.${serverName}.env]`
  ];

  for (const [key, value] of Object.entries(serverBlock.env)) {
    lines.push(`${key} = ${tomlString(value)}`);
  }

  return `${lines.join("\n")}\n`;
}

export function replaceTomlTable(text, tableName, block) {
  const normalized = text.replace(/\r\n/g, "\n");
  const lines = normalized.split("\n");
  const sectionStarts = [];
  for (let index = 0; index < lines.length; index += 1) {
    const name = tomlTableName(lines[index]);
    if (name) sectionStarts.push({ index, name });
  }

  const matchingRanges = sectionStarts
    .map((section, index) => ({
      start: section.index,
      end: sectionStarts[index + 1]?.index ?? lines.length,
      matches: section.name === tableName || section.name.startsWith(`${tableName}.`)
    }))
    .filter((range) => range.matches);

  if (matchingRanges.length === 0) {
    const prefix = normalized.trim().length > 0 ? `${normalized.trimEnd()}\n\n` : "";
    return `${prefix}${block.trimEnd()}\n`;
  }

  const replacementAt = matchingRanges[0].start;
  const skipped = new Set(matchingRanges.flatMap((range) => (
    Array.from({ length: range.end - range.start }, (_, offset) => range.start + offset)
  )));
  const output = [];
  for (let index = 0; index < lines.length; index += 1) {
    if (index === replacementAt) output.push(...block.trimEnd().split("\n"));
    if (!skipped.has(index)) output.push(lines[index]);
  }
  return `${output.join("\n").trimEnd()}\n`;
}

function tomlArray(values) {
  return `[${values.map(tomlString).join(", ")}]`;
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function tomlTableName(line) {
  const match = String(line).match(/^\s*\[([A-Za-z0-9_.-]+)\]\s*(?:#.*)?$/);
  return match?.[1]?.trim() || "";
}
