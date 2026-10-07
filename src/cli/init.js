import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { isDeepStrictEqual, parseArgs } from "node:util";
import { createCmBackend } from "../backend/cm.js";
import { CM_COMMANDS } from "../backend/commands.js";
import { loadConfig } from "../config/env.js";
import { mergeCodexServer, normalizeEol, renderCodexServer } from "./codex-toml.js";
import {
  antigravityGlobalConfigPath,
  claudeDesktopConfigPath,
  codexConfigPath,
  cursorGlobalConfigPath,
  findCmExecutable,
  kiroGlobalConfigPath,
  opencodeGlobalConfigPath,
  windsurfConfigPath
} from "../platform/paths.js";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const NPM_PACKAGE_SPEC = "@proanima/uvcs-mcp@1.3.0";
const CODEX_NPM_STARTUP_TIMEOUT_SEC = 60;
const INSTALL_SOURCES = ["npm", "local"];
const MODES = ["readonly", "standard"];
const FLEET_LAYOUTS = ["single", "isolated"];

// windowsCmdShim: on native Windows, start npx through `cmd /c` because the
// client is not confirmed to resolve npx.cmd itself. Claude Code, Claude
// Desktop, Cursor, Codex (0.59+), Kiro, and OpenCode spawn npx directly.
const CLIENTS = {
  antigravity: {
    scope: "project",
    windowsCmdShim: true,
    file: (ctx) => path.join(ctx.projectDir, ".agents", "mcp_config.json"),
    note: "Antigravity builds older than the .agents/ layout read ~/.gemini/antigravity/mcp_config.json; copy the entry there if the server does not show up."
  },
  "antigravity-global": {
    scope: "user",
    windowsCmdShim: true,
    file: (ctx) => antigravityGlobalConfigPath(ctx),
    note: "Antigravity builds older than the ~/.gemini/config/ layout read ~/.gemini/antigravity/mcp_config.json; copy the entry there if the server does not show up."
  },
  "claude-code": {
    scope: "project",
    file: (ctx) => path.join(ctx.projectDir, ".mcp.json"),
    entry: (block) => ({ type: "stdio", ...block })
  },
  cursor: {
    scope: "project",
    file: (ctx) => path.join(ctx.projectDir, ".cursor", "mcp.json")
  },
  "cursor-global": {
    scope: "user",
    file: (ctx) => cursorGlobalConfigPath(ctx)
  },
  codex: {
    scope: "user",
    format: "toml",
    file: (ctx) => codexConfigPath(ctx)
  },
  "claude-desktop": {
    scope: "user",
    file: (ctx) => claudeDesktopConfigPath(ctx)
  },
  kiro: {
    scope: "project",
    file: (ctx) => path.join(ctx.projectDir, ".kiro", "settings", "mcp.json"),
    entry: kiroEntry
  },
  "kiro-global": {
    scope: "user",
    file: (ctx) => kiroGlobalConfigPath(ctx),
    entry: kiroEntry
  },
  opencode: {
    scope: "project",
    file: (ctx) => path.join(ctx.projectDir, "opencode.json"),
    key: "mcp",
    entry: openCodeEntry,
    jsoncSibling: true
  },
  "opencode-global": {
    scope: "user",
    file: (ctx) => opencodeGlobalConfigPath(ctx),
    key: "mcp",
    entry: openCodeEntry,
    jsoncSibling: true
  },
  windsurf: {
    scope: "user",
    windowsCmdShim: true,
    file: (ctx) => windsurfConfigPath(ctx),
    note: "Windsurf was renamed Devin Desktop; if your build reads ~/.config/devin/mcp_config.json (Windows: %APPDATA%\\devin\\mcp_config.json), copy the entry there."
  }
};
export const CLIENT_NAMES = Object.keys(CLIENTS);

export const INIT_OPTIONS = {
  help: { type: "boolean", short: "h" },
  yes: { type: "boolean", short: "y" },
  "dry-run": { type: "boolean" },
  "print-config": { type: "boolean" },
  "no-backup": { type: "boolean" },
  "skip-invalid": { type: "boolean" },
  client: { type: "string" },
  "project-dir": { type: "string" },
  workspace: { type: "string" },
  name: { type: "string" },
  manifest: { type: "string" },
  "fleet-layout": { type: "string" },
  "install-source": { type: "string" },
  source: { type: "string" },
  cm: { type: "string" },
  safety: { type: "string" },
  mode: { type: "string" },
  "allowed-repos": { type: "string" },
  "checkin-max-files": { type: "string" },
  "token-ttl-sec": { type: "string" },
  "audit-log": { type: "string" },
  "read-timeout-ms": { type: "string" },
  "write-timeout-ms": { type: "string" },
  "max-output-bytes": { type: "string" }
};

export function initHelp() {
  return `Usage:
  uvcs-mcp init [options]         Write MCP client configs for a UVCS workspace
  uvcs-mcp init-local [options]   Same, with --install-source=local (run this checkout)

Clients:
  --client=<list>          Comma-separated list, or "all" (default: cursor)
    Project files, written to --project-dir:
      cursor               .cursor/mcp.json
      claude-code          .mcp.json
      kiro                 .kiro/settings/mcp.json
      opencode             opencode.json (opencode.jsonc is refused, not rewritten)
      antigravity          .agents/mcp_config.json
    User files:
      cursor-global        ~/.cursor/mcp.json
      codex                $CODEX_HOME/config.toml (default ~/.codex/config.toml)
      claude-desktop       Claude Desktop claude_desktop_config.json
      kiro-global          ~/.kiro/settings/mcp.json
      opencode-global      $XDG_CONFIG_HOME/opencode/opencode.json (default ~/.config)
      windsurf             ~/.codeium/windsurf/mcp_config.json
      antigravity-global   ~/.gemini/config/mcp_config.json
  --project-dir=<path>     Folder for project files (default: the workspace when it
                           exists, else the current directory)

Workspace:
  --workspace=<path>       Workspace to configure (default: $UVCS_WORKSPACE, a prompt,
                           or the current directory)
  --name=<name>            MCP server name (default: uvcs)
  --manifest=<file>        Configure the named workspaces of a fleet manifest instead
  --fleet-layout=<mode>    single: one MCP server for the manifest (default)
                           isolated: one MCP server per workspace

Safety:
  --safety=<profile>       readonly (default) | guarded | standard
  --mode=<mode>            readonly | standard; must match the safety profile
                           (default: derived from --safety or $UVCS_MCP_MODE)
  --allowed-repos=<ids>    Semicolon-separated repo@server:port allowlist; guarded
                           detects it from the workspace when omitted
  --checkin-max-files=<n>  Files allowed per checkin (guarded default: 20)
  --token-ttl-sec=<n>      Confirmation token lifetime (guarded default: 120)
  --audit-log=<file>       Append a JSON line per tool call to this file
  --read-timeout-ms=<n>    Timeout for read-only cm commands
  --write-timeout-ms=<n>   Timeout for mutating cm commands
  --max-output-bytes=<n>   Output limit for one cm command

Runtime:
  --install-source=<src>   npm (default): npx -y ${NPM_PACKAGE_SPEC}
                           local: run this checkout with the current node
                           (alias: --source)
  --cm=<path>              cm executable written as UVCS_CM_PATH (default:
                           $UVCS_CM_PATH, else PATH and standard install folders)

Output:
  --dry-run                Show targets and the uvcs entries; write nothing
  --print-config           Same as --dry-run
  --no-backup              Do not keep <file>.<YYYYMMDDHHmmss>.bak before changing it
  --skip-invalid           Skip clients whose config cannot be parsed and print the
                           entry to add by hand (default: abort before writing)
  -y, --yes                Never prompt; use defaults for missing answers
  -h, --help               Show this help
`;
}

export async function runInit(args = [], overrides = {}) {
  const flags = parseInitArgs(args);
  const ctx = createContext(overrides);
  if (flags.help) {
    ctx.write(initHelp());
    return;
  }

  const interactive = !flags.yes && Boolean(ctx.stdin.isTTY);
  const rl = interactive ? readline.createInterface({ input: ctx.stdin, output: ctx.stdout }) : null;
  try {
    await configureClients(flags, ctx, rl);
  } finally {
    rl?.close();
  }
}

async function configureClients(flags, ctx, rl) {
  const installSource = flags.installSource ?? (rl ? await askChoice(rl, "Install source [npm/local]", "npm") : "npm");
  assertInstallSource(installSource, ctx);
  const clients = expandClients(flags.client ?? (rl ? await askChoice(rl, `Clients [${CLIENT_NAMES.join(",")},all]`, "cursor") : "cursor"));
  const fleetLayout = flags.fleetLayout ?? "single";
  if (!FLEET_LAYOUTS.includes(fleetLayout)) {
    throw usageError(`--fleet-layout must be single or isolated (got "${fleetLayout}")`);
  }
  if (flags.manifest && flags.workspace) {
    throw usageError("Use either --workspace or --manifest, not both");
  }

  const cm = await resolveCm(flags, ctx);
  const workspaceEntries = flags.manifest
    ? await loadManifestEntries(flags.manifest, { installSource, cm, ctx })
    : [await createSingleWorkspaceEntry({ flags, rl, installSource, cm, ctx })];
  const fleetSources = new Set(workspaceEntries.map((entry) => entry.source));
  if (flags.manifest && fleetLayout === "single" && fleetSources.size !== 1) {
    throw cliError("One-process fleet layout requires one installSource for all workspaces");
  }
  const serverEntries = flags.manifest && fleetLayout === "single"
    ? [createFleetServerEntry({
        name: normalizeServerName(flags.name ?? "uvcs"),
        manifestPath: path.resolve(ctx.cwd, flags.manifest),
        installSource: workspaceEntries[0].source,
        cmPath: cm.path,
        ctx
      })]
    : workspaceEntries;

  const dryRun = Boolean(flags.dryRun || flags.printConfig);
  ctx.write("UVCS MCP Setup\n");
  ctx.write("--------------\n");
  ctx.write(`Workspaces: ${workspaceEntries.length}\n`);
  for (const entry of workspaceEntries) {
    ctx.write(`- ${entry.name}: ${entry.workspace} (${entry.safety}, ${entry.block.env.UVCS_MCP_MODE}, source=${entry.source})\n`);
    for (const warning of entry.warnings) {
      ctx.write(`  Warning: ${warning}\n`);
    }
  }
  if (flags.manifest) ctx.write(`Fleet layout: ${fleetLayout} (${serverEntries.length} MCP server${serverEntries.length === 1 ? "" : "s"})\n`);
  if (serverEntries.length === 1) ctx.write(`Source: ${serverEntries[0].source}\n`);
  if (cm.path) {
    ctx.write(`cm: ${cm.path} (${cm.origin})\n`);
  } else {
    ctx.write("Warning: cm was not found on PATH or in the standard install folders; the generated config relies on the MCP client's PATH. Pass --cm=<path> to pin it.\n");
  }

  const projectDir = clients.some((client) => CLIENTS[client].scope === "project")
    ? await resolveProjectDir(flags, workspaceEntries, ctx)
    : undefined;
  if (projectDir) ctx.write(`Project dir: ${projectDir.dir} (${projectDir.origin})\n`);
  if (dryRun) ctx.write("Mode: dry run\n");

  const targetCtx = { ...ctx, projectDir: projectDir?.dir };
  const targets = await Promise.all(clients.map((client) => prepareTarget(client, serverEntries, targetCtx)));
  ctx.write("Targets:\n");
  for (const target of targets) {
    ctx.write(`- ${target.client} (${target.scope}): ${target.file}\n`);
    if (CLIENTS[target.client].note) ctx.write(`  Note: ${CLIENTS[target.client].note}\n`);
  }

  const invalid = targets.filter((target) => target.problem);
  if (invalid.length > 0 && !flags.skipInvalid) {
    const lines = invalid.map((target) => `- ${target.client}: ${target.file}: ${target.problem}`);
    throw cliError([
      `Cannot update ${invalid.length === 1 ? "this client config" : "these client configs"}; nothing was written:`,
      ...lines,
      "Fix the file, or re-run with --skip-invalid to configure the other clients and print the entry to add by hand."
    ].join("\n"));
  }

  for (const target of targets) {
    if (target.problem) {
      ctx.write(`\nSkipped ${target.client}: ${target.file}: ${target.problem}\nAdd this entry by hand:\n${target.snippet}`);
      continue;
    }
    if (dryRun) {
      ctx.write(`\n${target.client}: ${target.file} (${target.unchanged ? "unchanged" : target.existed ? "would merge" : "would create"})\n${target.snippet}`);
      continue;
    }
    await writeTarget(target, flags, ctx);
  }

  if (clients.includes("claude-code")) {
    ctx.write("\nClaude Code user scope (instead of the project .mcp.json):\n");
    for (const entry of entriesForClient("claude-code", serverEntries, ctx)) {
      ctx.write(`  ${claudeCodeAddCommand(entry, ctx.platform)}\n`);
    }
  }
  ctx.write("\nNext: restart the MCP client and call uvcs_setup_status.\n");
  if (flags.manifest && fleetLayout === "single") {
    ctx.write("Fleet tools require an explicit workspace name from the manifest on every call.\n");
  }
  ctx.write("If naming rules are missing, use uvcs_style_init_prepare and uvcs_style_init_confirm in guarded or standard mode.\n");
}

function createContext(overrides) {
  const stdout = overrides.stdout ?? process.stdout;
  return {
    platform: overrides.platform ?? process.platform,
    env: overrides.env ?? process.env,
    cwd: overrides.cwd ?? process.cwd(),
    homeDir: overrides.homeDir ?? os.homedir(),
    packageRoot: overrides.packageRoot ?? REPO_ROOT,
    execPath: overrides.execPath ?? process.execPath,
    cmCandidates: overrides.cmCandidates,
    now: overrides.now ?? (() => new Date()),
    stdin: overrides.stdin ?? process.stdin,
    stdout,
    write: (text) => stdout.write(text)
  };
}

function parseInitArgs(args) {
  let parsed;
  try {
    parsed = parseArgs({ args, options: INIT_OPTIONS, strict: true, allowPositionals: false });
  } catch (error) {
    throw parseArgsError(error, INIT_OPTIONS, "uvcs-mcp init --help");
  }
  const flags = {};
  for (const [key, value] of Object.entries(parsed.values)) {
    if (typeof value === "string" && value.trim() === "") {
      throw usageError(`--${key} requires a value`);
    }
    flags[toCamel(key)] = typeof value === "string" ? value.trim() : value;
  }
  if (flags.source !== undefined) {
    flags.installSource ??= flags.source;
    delete flags.source;
  }
  return flags;
}

export function parseArgsError(error, options, helpCommand) {
  if (!String(error?.code ?? "").startsWith("ERR_PARSE_ARGS")) return error;
  const option = String(error.message).match(/'(-[^'\s]*)/)?.[1];
  if (error.code === "ERR_PARSE_ARGS_UNKNOWN_OPTION" && option) {
    const bare = option.replace(/^-+/, "").split("=")[0];
    const similar = Object.keys(options).find((name) => name !== bare && (name.startsWith(bare) || bare.startsWith(name)));
    return usageError(`Unknown option ${option}${similar ? ` (did you mean --${similar}?)` : ""}. Run "${helpCommand}" for the supported options.`);
  }
  if (error.code === "ERR_PARSE_ARGS_UNEXPECTED_POSITIONAL") {
    return usageError(`Unexpected argument ${String(error.message).match(/'[^']*'/)?.[0] ?? ""}; options use --name=value. Run "${helpCommand}".`);
  }
  return usageError(`${String(error.message).split(". To specify")[0]}. Run "${helpCommand}".`);
}

function cliError(message, exitCode = 1) {
  return Object.assign(new Error(message), { exitCode });
}

function usageError(message) {
  return cliError(message, 2);
}

function toCamel(key) {
  return key.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
}

function expandClients(value) {
  const requested = [...new Set(String(value).split(",").map((item) => item.trim()).filter(Boolean))];
  if (requested.length === 0) throw usageError(`--client requires at least one client. Valid clients: ${CLIENT_NAMES.join(", ")}, all`);
  if (requested.includes("all")) {
    if (requested.length > 1) throw usageError("--client=all cannot be combined with other clients");
    return CLIENT_NAMES;
  }
  const unknown = requested.filter((client) => !CLIENTS[client]);
  if (unknown.length > 0) {
    throw usageError(`Unknown client${unknown.length === 1 ? "" : "s"}: ${unknown.join(", ")}. Valid clients: ${CLIENT_NAMES.join(", ")}, all`);
  }
  return requested;
}

async function askChoice(rl, question, fallback) {
  const answer = (await rl.question(`${question} (${fallback}): `)).trim();
  return answer || fallback;
}

function assertInstallSource(installSource, ctx) {
  if (!INSTALL_SOURCES.includes(installSource)) {
    throw usageError(`Install source must be npm or local (got "${installSource}")`);
  }
  if (installSource === "local" && isNpxCache(ctx.packageRoot)) {
    throw cliError(`Install source "local" would point MCP clients at the temporary npx cache (${ctx.packageRoot}), which npm may delete at any time. Use --install-source=npm, or clone the repository and run "node src/cli.js init-local" from the checkout.`);
  }
}

function isNpxCache(directory) {
  return directory.split(/[\\/]+/).includes("_npx");
}

async function resolveCm(flags, ctx) {
  if (flags.cm) {
    const looksLikePath = /[\\/]/.test(flags.cm);
    return { path: looksLikePath ? path.resolve(ctx.cwd, flags.cm) : flags.cm, origin: "--cm" };
  }
  if (ctx.env.UVCS_CM_PATH?.trim()) return { path: ctx.env.UVCS_CM_PATH.trim(), origin: "UVCS_CM_PATH" };
  const found = await findCmExecutable({ platform: ctx.platform, env: ctx.env, candidates: ctx.cmCandidates });
  return found ? { path: found, origin: "auto-detected" } : { path: undefined, origin: "not found" };
}

function createFleetServerEntry({ name, manifestPath, installSource, cmPath, ctx }) {
  const env = { UVCS_FLEET_MANIFEST: manifestPath };
  if (cmPath) env.UVCS_CM_PATH = cmPath;
  return {
    name,
    safety: "fleet",
    source: installSource,
    block: { ...launchCommand(installSource, ctx), env }
  };
}

async function createSingleWorkspaceEntry({ flags, rl, installSource, cm, ctx }) {
  const answer = flags.workspace ?? (ctx.env.UVCS_WORKSPACE?.trim() || (rl ? await rl.question("Workspace path: ") : ""));
  const workspace = path.resolve(ctx.cwd, answer.trim() || ".");
  const name = normalizeServerName(flags.name ?? "uvcs");
  const requestedMode = flags.mode ?? (ctx.env.UVCS_MCP_MODE?.trim() || undefined);
  if (requestedMode !== undefined && !MODES.includes(requestedMode)) {
    throw usageError(`Mode must be readonly or standard (got "${requestedMode}")`);
  }
  const safety = flags.safety ?? (requestedMode === "standard" ? "standard" : "readonly");
  const mode = requestedMode ?? modeForSafety(safety);
  validateSafetyMode(safety, mode, name);
  let allowedRepos = splitValues(flags.allowedRepos ?? ctx.env.UVCS_ALLOWED_REPOS);
  if (safety === "guarded" && allowedRepos.length === 0) {
    const detection = await detectWorkspaceRepos(workspace, cm.path, ctx);
    allowedRepos = detection.repos;
    if (allowedRepos.length === 0) {
      throw cliError(guardedDetectionMessage(name, workspace, detection.reason, "--allowed-repos=repo@server:8087 (several: separate with ;)"));
    }
  }

  return {
    name,
    workspace,
    safety,
    source: installSource,
    warnings: await workspaceSetupWarnings(workspace),
    block: makeServerBlock({
      workspace,
      workspaceName: name,
      safetyProfile: safety,
      mode,
      cmPath: cm.path,
      installSource,
      allowedRepos,
      checkinMaxFiles: positiveInt(flags.checkinMaxFiles, safety === "guarded" ? 20 : undefined, "--checkin-max-files"),
      tokenTtlSec: positiveInt(flags.tokenTtlSec, safety === "guarded" ? 120 : undefined, "--token-ttl-sec"),
      auditLog: flags.auditLog ? path.resolve(ctx.cwd, flags.auditLog) : undefined,
      readTimeoutMs: positiveInt(flags.readTimeoutMs, undefined, "--read-timeout-ms"),
      writeTimeoutMs: positiveInt(flags.writeTimeoutMs, undefined, "--write-timeout-ms"),
      maxOutputBytes: positiveInt(flags.maxOutputBytes, undefined, "--max-output-bytes"),
      ctx
    })
  };
}

async function loadManifestEntries(manifestPath, { installSource, cm, ctx }) {
  const absoluteManifest = path.resolve(ctx.cwd, manifestPath);
  const manifestDir = path.dirname(absoluteManifest);
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(absoluteManifest, "utf8"));
  } catch (error) {
    throw cliError(`Cannot read workspace manifest ${absoluteManifest}: ${error.message}`);
  }
  assertPlainObject(manifest, "Workspace manifest");
  assertKnownKeys(manifest, ["$schema", "version", "defaults", "workspaces"], "Workspace manifest");
  if (manifest.version !== 1) {
    throw cliError("Workspace manifest version must be 1");
  }
  if (!Array.isArray(manifest.workspaces) || manifest.workspaces.length === 0 || manifest.workspaces.length > 50) {
    throw cliError("Workspace manifest must contain from 1 to 50 workspaces");
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
    if (names.has(name)) throw cliError(`Duplicate workspace name in manifest: ${name}`);
    names.add(name);

    if (typeof workspaceConfig.path !== "string" || workspaceConfig.path.trim().length === 0) {
      throw cliError(`Workspace ${name} requires a path`);
    }
    const workspace = path.resolve(manifestDir, workspaceConfig.path);
    const source = workspaceConfig.installSource ?? defaults.installSource ?? installSource;
    assertInstallSource(source, ctx);
    const cmPath = workspaceConfig.cmPath ?? defaults.cmPath ?? cm.path;
    const safety = workspaceConfig.safety ?? defaults.safety ?? "readonly";
    modeForSafety(safety);
    let allowedRepos = normalizeStringList(workspaceConfig.allowedRepos ?? defaults.allowedRepos ?? []);
    if (safety === "guarded" && allowedRepos.length === 0) {
      const detection = await detectWorkspaceRepos(workspace, cmPath, ctx);
      allowedRepos = detection.repos;
      if (allowedRepos.length === 0) {
        throw cliError(guardedDetectionMessage(name, workspace, detection.reason, `"allowedRepos": ["repo@server:8087"] in the manifest entry`));
      }
    }
    const mode = workspaceConfig.mode ?? defaults.mode ?? modeForSafety(safety);
    if (!MODES.includes(mode)) {
      throw cliError(`Workspace ${name} mode must be readonly or standard`);
    }
    validateSafetyMode(safety, mode, name);

    return {
      name: `uvcs-${name}`,
      workspace,
      safety,
      source,
      warnings: await workspaceSetupWarnings(workspace),
      block: makeServerBlock({
        workspace,
        workspaceName: name,
        safetyProfile: safety,
        mode,
        cmPath,
        installSource: source,
        allowedRepos,
        checkinMaxFiles: positiveInt(workspaceConfig.checkinMaxFiles ?? defaults.checkinMaxFiles, safety === "guarded" ? 20 : undefined, `${name}.checkinMaxFiles`),
        tokenTtlSec: positiveInt(workspaceConfig.tokenTtlSec ?? defaults.tokenTtlSec, safety === "guarded" ? 120 : undefined, `${name}.tokenTtlSec`),
        auditLog: resolveOptionalPath(manifestDir, workspaceConfig.auditLog ?? defaults.auditLog),
        readTimeoutMs: positiveInt(workspaceConfig.readTimeoutMs ?? defaults.readTimeoutMs, undefined, `${name}.readTimeoutMs`),
        writeTimeoutMs: positiveInt(workspaceConfig.writeTimeoutMs ?? defaults.writeTimeoutMs, undefined, `${name}.writeTimeoutMs`),
        maxOutputBytes: positiveInt(workspaceConfig.maxOutputBytes ?? defaults.maxOutputBytes, undefined, `${name}.maxOutputBytes`),
        ctx
      })
    };
  }));
}

function modeForSafety(safety) {
  if (safety === "readonly") return "readonly";
  if (safety === "guarded" || safety === "standard") return "standard";
  throw usageError(`Safety profile must be readonly, guarded, or standard (got "${safety}")`);
}

function validateSafetyMode(safety, mode, name) {
  if (mode !== modeForSafety(safety)) {
    throw cliError(`Workspace ${name} safety=${safety} requires mode=${modeForSafety(safety)}`);
  }
}

function guardedDetectionMessage(name, workspace, reason, example) {
  return [
    `Workspace ${name} uses guarded safety and requires allowedRepos, but the repository could not be detected at ${workspace}.`,
    `Reason: ${reason}`,
    `Pass the repository explicitly, e.g. ${example}`
  ].join("\n");
}

function normalizeServerName(value) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(value)) {
    throw usageError(`Workspace name must use lowercase letters, numbers, and dashes (got "${value}")`);
  }
  return value;
}

function normalizeStringList(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw cliError("allowedRepos must be an array of non-empty strings");
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
  if (!Number.isInteger(parsed) || parsed <= 0) throw usageError(`${name} must be a positive integer (got "${value}")`);
  return parsed;
}

function resolveOptionalPath(baseDir, value) {
  if (!value) return undefined;
  if (typeof value !== "string") throw cliError("auditLog must be a string path");
  return path.resolve(baseDir, value);
}

async function isDirectory(directory) {
  try {
    return (await fs.stat(directory)).isDirectory();
  } catch {
    return false;
  }
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

async function detectWorkspaceRepos(workspace, cmPath, ctx) {
  if (!(await isDirectory(workspace))) {
    return { repos: [], reason: "the workspace path does not exist or is not a directory" };
  }

  const backend = createCmBackend(loadConfig({
    ...ctx.env,
    UVCS_WORKSPACE: workspace,
    UVCS_MCP_MODE: "readonly",
    UVCS_CM_PATH: cmPath || ctx.env.UVCS_CM_PATH || ""
  }));
  const repos = reposFromWorkspaceInfo(await backend.workspaceInfo());
  if (repos.length > 0) return { repos };

  // workspaceInfo() swallows cm failures; repeat the cheap local probe to say why.
  try {
    await backend.runSpec(CM_COMMANDS.workspaceSelector);
    return { repos: [], reason: "neither .plastic/plastic.workspace, cm wi nor cm status --header reported a repository@server identity" };
  } catch (error) {
    return { repos: [], reason: `cm failed: ${error.message}` };
  }
}

function reposFromWorkspaceInfo(info) {
  const entries = Object.entries(info ?? {});
  const direct = entries
    .map(([, value]) => String(value ?? "").trim())
    .filter((value) => value.includes("@"));
  const byKey = Object.fromEntries(entries.map(([key, value]) => [key.toLowerCase(), String(value ?? "").trim()]));
  const repo = byKey.repository || byKey.repo || byKey.name || byKey.reponame;
  const server = byKey.server || byKey.repositoryserver || byKey.servername;
  return [...new Set([...direct, ...(repo && server ? [`${repo}@${server}`] : [])])];
}

function launchCommand(installSource, ctx) {
  if (installSource === "local") {
    return { command: ctx.execPath, args: [path.join(ctx.packageRoot, "src", "cli.js")] };
  }
  return { command: "npx", args: ["-y", NPM_PACKAGE_SPEC] };
}

// On native Windows `npx` is the npx.cmd shim. Clients that spawn commands
// without resolving .cmd files get it through `cmd /c`; the rest run npx directly.
function entriesForClient(client, serverEntries, ctx) {
  if (ctx.platform !== "win32" || !CLIENTS[client].windowsCmdShim) return serverEntries;
  return serverEntries.map((entry) => entry.block.command === "npx"
    ? { ...entry, block: { ...entry.block, command: "cmd", args: ["/c", "npx", ...entry.block.args] } }
    : entry);
}

function makeServerBlock({ workspace, workspaceName, safetyProfile, mode, cmPath, installSource, allowedRepos = [], checkinMaxFiles, tokenTtlSec, auditLog, readTimeoutMs, writeTimeoutMs, maxOutputBytes, ctx }) {
  const env = {
    UVCS_WORKSPACE: workspace,
    UVCS_WORKSPACE_NAME: workspaceName,
    UVCS_SAFETY_PROFILE: safetyProfile,
    UVCS_MCP_MODE: mode,
    UVCS_ALLOWED_WORKSPACES: workspace
  };
  if (cmPath) env.UVCS_CM_PATH = cmPath;
  if (allowedRepos.length > 0) env.UVCS_ALLOWED_REPOS = allowedRepos.join(";");
  if (checkinMaxFiles) env.UVCS_CHECKIN_MAX_FILES = String(checkinMaxFiles);
  if (tokenTtlSec) env.UVCS_TOKEN_TTL_SEC = String(tokenTtlSec);
  if (auditLog) env.UVCS_AUDIT_LOG = auditLog;
  if (readTimeoutMs) env.UVCS_READ_TIMEOUT_MS = String(readTimeoutMs);
  if (writeTimeoutMs) env.UVCS_WRITE_TIMEOUT_MS = String(writeTimeoutMs);
  if (maxOutputBytes) env.UVCS_MAX_OUTPUT_BYTES = String(maxOutputBytes);

  return { ...launchCommand(installSource, ctx), env };
}

function assertPlainObject(value, name) {
  if (!isPlainObject(value)) {
    throw cliError(`${name} must be an object`);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertKnownKeys(value, allowed, name) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) {
    throw cliError(`${name} contains unknown fields: ${unknown.join(", ")}`);
  }
}

async function resolveProjectDir(flags, workspaceEntries, ctx) {
  if (flags.projectDir) {
    const dir = path.resolve(ctx.cwd, flags.projectDir);
    if (!(await isDirectory(dir))) throw usageError(`--project-dir does not exist or is not a directory: ${dir}`);
    return { dir, origin: "--project-dir" };
  }

  const workspace = flags.manifest ? undefined : workspaceEntries[0]?.workspace;
  const resolved = workspace && await isDirectory(workspace)
    ? { dir: workspace, origin: "workspace" }
    : { dir: ctx.cwd, origin: "current directory" };
  if (await samePath(resolved.dir, ctx.packageRoot, ctx.platform)) {
    throw usageError([
      `Refusing to write project client configs (.cursor/mcp.json, .mcp.json, ...) into the uvcs-mcp package folder ${resolved.dir}.`,
      "Pass --project-dir=<your project folder> (or --workspace=<workspace>) to choose where they go."
    ].join("\n"));
  }
  return resolved;
}

async function samePath(left, right, platform) {
  const normalize = async (value) => {
    const resolved = await fs.realpath(value).catch(() => path.resolve(value));
    return platform === "win32" || platform === "darwin" ? resolved.toLowerCase() : resolved;
  };
  return (await normalize(left)) === (await normalize(right));
}

async function prepareTarget(client, serverEntries, ctx) {
  const spec = CLIENTS[client];
  const target = { client, scope: spec.scope, file: spec.file(ctx) };
  const entries = entriesForClient(client, serverEntries, ctx);
  return spec.format === "toml"
    ? { ...target, ...(await prepareTomlTarget(target.file, entries)) }
    : { ...target, ...(await prepareJsonTarget(spec, target.file, entries)) };
}

async function prepareJsonTarget(spec, file, serverEntries) {
  const snippet = `${JSON.stringify(patchJsonConfig(spec, {}, serverEntries), null, 2)}\n`;
  if (spec.jsoncSibling) {
    const jsonc = file.replace(/\.json$/, ".jsonc");
    if (await pathExists(jsonc)) {
      return { snippet, problem: `${path.basename(jsonc)} exists next to it; init does not rewrite JSONC because comments would be lost` };
    }
  }

  let text;
  try {
    text = await readOptional(file);
  } catch (error) {
    return { snippet, problem: `cannot read the file (${error.message})` };
  }
  const source = stripBom(text ?? "");
  let config = {};
  if (source.trim()) {
    try {
      config = JSON.parse(source);
    } catch (error) {
      return { snippet, problem: `not valid JSON (${error.message}); comments and trailing commas are not supported` };
    }
  }
  const key = spec.key ?? "mcpServers";
  if (!isPlainObject(config)) return { snippet, problem: "the top-level value is not a JSON object" };
  if (config[key] !== undefined && !isPlainObject(config[key])) return { snippet, problem: `"${key}" is not an object` };

  const next = patchJsonConfig(spec, config, serverEntries);
  return {
    snippet,
    existed: text !== null,
    unchanged: text !== null && isDeepStrictEqual(config, next),
    content: `${JSON.stringify(next, null, 2)}\n`
  };
}

function stripBom(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

function patchJsonConfig(spec, config, serverEntries) {
  const key = spec.key ?? "mcpServers";
  const entry = spec.entry ?? ((block) => block);
  return serverEntries.reduce((current, server) => ({
    ...current,
    [key]: {
      ...(current[key] ?? {}),
      [server.name]: entry(server.block)
    }
  }), config);
}

function kiroEntry(block) {
  return { ...block, disabled: false, autoApprove: [] };
}

function openCodeEntry(block) {
  return {
    type: "local",
    command: [block.command, ...block.args],
    enabled: true,
    environment: block.env
  };
}

async function prepareTomlTarget(file, serverEntries) {
  const options = (entry) => ({ startupTimeoutSec: entry.source === "npm" ? CODEX_NPM_STARTUP_TIMEOUT_SEC : undefined });
  let text;
  try {
    text = await readOptional(file);
  } catch (error) {
    return { snippet: renderCodexSnippet(serverEntries, options), problem: `cannot read the file (${error.message})` };
  }

  let merged = text ?? "";
  const sections = [];
  try {
    for (const entry of serverEntries) {
      const result = mergeCodexServer(merged, entry.name, entry.block, options(entry));
      merged = result.text;
      sections.push(result.section);
    }
  } catch (error) {
    return { snippet: renderCodexSnippet(serverEntries, options), problem: `cannot merge TOML safely: ${error.message}` };
  }
  return {
    snippet: sections.join("\n"),
    existed: text !== null,
    unchanged: text !== null && normalizeEol(merged).trimEnd() === normalizeEol(text).trimEnd(),
    content: merged
  };
}

function renderCodexSnippet(serverEntries, options) {
  return serverEntries
    .map((entry) => `${renderCodexServer(entry.name, entry.block, [], options(entry).startupTimeoutSec).join("\n")}\n`)
    .join("\n");
}

async function readOptional(file) {
  try {
    return await fs.readFile(file, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function pathExists(file) {
  try {
    await fs.access(file);
    return true;
  } catch {
    return false;
  }
}

async function writeTarget(target, flags, ctx) {
  if (target.unchanged) {
    ctx.write(`Unchanged: ${target.file}\n`);
    return;
  }
  try {
    await fs.mkdir(path.dirname(target.file), { recursive: true });
    if (target.existed && flags.noBackup) {
      ctx.write(`Overwrite without backup: ${target.file}\n`);
    } else if (target.existed) {
      ctx.write(`Backup: ${await backupFile(target.file, ctx.now())}\n`);
    }
    await fs.writeFile(target.file, target.content, "utf8");
  } catch (error) {
    throw cliError(`Cannot write ${target.file}: ${error.message}`);
  }
  ctx.write(`${target.existed ? "Merged" : "Written"}: ${target.file}\n`);
}

async function backupFile(file, date) {
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  for (let attempt = 0; ; attempt += 1) {
    const backup = `${file}.${stamp}${attempt > 0 ? `-${attempt}` : ""}.bak`;
    try {
      await fs.copyFile(file, backup, fs.constants.COPYFILE_EXCL);
      return backup;
    } catch (error) {
      if (error?.code !== "EEXIST" || attempt >= 99) throw error;
    }
  }
}

function claudeCodeAddCommand(entry, platform) {
  const quote = platform === "win32"
    ? (value) => (/^[A-Za-z0-9_@+=:,./\\-]+$/.test(value) ? value : `"${value.replace(/"/g, "\\\"")}"`)
    : (value) => (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value) ? value : `'${value.replace(/'/g, "'\\''")}'`);
  // --env is variadic: a non-env option must separate it from the server name.
  const parts = ["claude", "mcp", "add"];
  for (const [key, value] of Object.entries(entry.block.env)) parts.push("--env", `${key}=${value}`);
  parts.push("--scope", "user", "--transport", "stdio", entry.name, "--", entry.block.command, ...entry.block.args);
  return parts.map(quote).join(" ");
}
