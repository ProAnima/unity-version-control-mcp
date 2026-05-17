import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";
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

export async function runInit(args = []) {
  const flags = parseFlags(args);
  normalizeInitFlags(flags);
  const interactive = flags.yes !== "true" && process.stdin.isTTY;
  const rl = interactive ? readline.createInterface({ input, output }) : null;

  try {
    const workspace = flags.workspace || process.env.UVCS_WORKSPACE || (interactive ? await rl.question("Workspace path: ") : process.cwd());
    const mode = flags.mode || process.env.UVCS_MCP_MODE || (interactive ? await askChoice(rl, "Mode [readonly/standard]", "readonly") : "readonly");
    const installSource = flags.installSource || flags.source || (interactive ? await askChoice(rl, "Install source [local/npm]", "local") : "local");
    const clientAnswer = flags.client || (interactive ? await askChoice(rl, "Clients [cursor,codex,claude-desktop,claude-code,opencode,antigravity,kiro,windsurf,all]", "cursor") : "cursor");
    const clients = expandClients(clientAnswer);
    const serverBlock = makeServerBlock({ workspace, mode, cmPath: flags.cm || process.env.UVCS_CM_PATH, installSource });

    process.stdout.write("UVCS MCP Setup\n");
    process.stdout.write("--------------\n");
    process.stdout.write(`Source: ${installSource}\n`);
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
      const result = await mergeClientConfig(target, serverBlock, flags);
      process.stdout.write(`${result.action}: ${result.file}\n`);
    }
  } finally {
    rl?.close();
  }
}

function makeServerBlock({ workspace, mode, cmPath, installSource }) {
  const env = {
    UVCS_WORKSPACE: path.resolve(workspace),
    UVCS_MCP_MODE: mode
  };
  if (cmPath) env.UVCS_CM_PATH = cmPath;

  if (installSource === "local") {
    return {
      command: process.execPath,
      args: [path.join(REPO_ROOT, "src", "cli.js")],
      env
    };
  }

  return {
    command: "npx",
    args: ["-y", "@proanima/uvcs-mcp"],
    env
  };
}

async function mergeClientConfig(target, serverBlock, flags) {
  const file = target.file;
  if (target.format === "toml") {
    return await mergeTomlConfig(target, serverBlock, flags);
  }

  let config = {};
  let existed = false;

  try {
    config = JSON.parse(await fs.readFile(file, "utf8"));
    existed = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const next = target.patch(config, serverBlock);
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

async function mergeTomlConfig(target, serverBlock, flags) {
  const file = target.file;
  let text = "";
  let existed = false;

  try {
    text = await fs.readFile(file, "utf8");
    existed = true;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const block = target.patch(serverBlock);
  const next = replaceTomlTable(text, "mcp_servers.uvcs", block);

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
    patch: (config, serverBlock) => ({
      ...config,
      mcpServers: {
        ...(config.mcpServers ?? {}),
        uvcs: serverBlock
      }
    })
  };
}

function cursorGlobalConfig() {
  return {
    file: cursorGlobalConfigPath({ homeDir: os.homedir() }),
    patch: (config, serverBlock) => ({
      ...config,
      mcpServers: {
        ...(config.mcpServers ?? {}),
        uvcs: serverBlock
      }
    })
  };
}

function antigravityConfig() {
  return {
    file: path.join(process.cwd(), "mcp_config.json"),
    patch: (config, serverBlock) => ({
      ...config,
      mcpServers: {
        ...(config.mcpServers ?? {}),
        uvcs: serverBlock
      }
    })
  };
}

function claudeCodeConfig() {
  return {
    file: path.join(process.cwd(), ".mcp.json"),
    patch: (config, serverBlock) => ({
      ...config,
      mcpServers: {
        ...(config.mcpServers ?? {}),
        uvcs: {
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
    patch: (serverBlock) => renderCodexToml(serverBlock)
  };
}

function claudeDesktopConfig() {
  return {
    file: claudeDesktopConfigPath({ homeDir: os.homedir(), env: process.env }),
    patch: (config, serverBlock) => ({
      ...config,
      mcpServers: {
        ...(config.mcpServers ?? {}),
        uvcs: serverBlock
      }
    })
  };
}

function kiroConfig() {
  return {
    file: path.join(process.cwd(), ".kiro", "settings", "mcp.json"),
    patch: (config, serverBlock) => ({
      ...config,
      mcpServers: {
        ...(config.mcpServers ?? {}),
        uvcs: {
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
    patch: (config, serverBlock) => ({
      ...config,
      mcpServers: {
        ...(config.mcpServers ?? {}),
        uvcs: {
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
    patch: (config, serverBlock) => ({
      ...config,
      mcp: {
        ...(config.mcp ?? {}),
        uvcs: {
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
    patch: (config, serverBlock) => ({
      ...config,
      mcp: {
        ...(config.mcp ?? {}),
        uvcs: {
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
    patch: (config, serverBlock) => ({
      ...config,
      mcpServers: {
        ...(config.mcpServers ?? {}),
        uvcs: serverBlock
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

function renderCodexToml(serverBlock) {
  const lines = [
    "[mcp_servers.uvcs]",
    `command = ${tomlString(serverBlock.command)}`,
    `args = ${tomlArray(serverBlock.args)}`,
    "",
    "[mcp_servers.uvcs.env]"
  ];

  for (const [key, value] of Object.entries(serverBlock.env)) {
    lines.push(`${key} = ${tomlString(value)}`);
  }

  return `${lines.join("\n")}\n`;
}

function replaceTomlTable(text, tableName, block) {
  const normalized = text.endsWith("\n") || text.length === 0 ? text : `${text}\n`;
  const escaped = escapeRegExp(tableName);
  const sectionPattern = new RegExp(`(^|\\n)\\[${escaped}\\][\\s\\S]*?(?=\\n\\[(?!${escaped}(?:\\.|\\]))[^\\]]+\\]|$)`, "m");

  if (sectionPattern.test(normalized)) {
    return normalized.replace(sectionPattern, (match, prefix) => `${prefix}${block.trimEnd()}\n`);
  }

  const separator = normalized.trim().length > 0 ? "\n" : "";
  return `${normalized}${separator}${block}`;
}

function tomlArray(values) {
  return `[${values.map(tomlString).join(", ")}]`;
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
