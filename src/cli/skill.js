import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { parseArgsError } from "./init.js";

export const SKILL_NAME = "uvcs-version-control";
export const SKILL_SOURCE = path.resolve(import.meta.dirname, "..", "..", "skills", SKILL_NAME);

// Skill folders each agent loads. `.agents/skills` is the shared location read
// by Codex, Cursor, OpenCode, Gemini CLI, and other SKILL.md agents; Claude
// Code reads only `.claude/skills`.
export const SKILL_AGENTS = {
  claude: {
    label: "Claude Code",
    project: (dir) => path.join(dir, ".claude", "skills"),
    user: ({ homeDir }) => path.join(homeDir, ".claude", "skills")
  },
  agents: {
    label: "Codex, Cursor, OpenCode, Gemini CLI, and other agents that read .agents/skills",
    project: (dir) => path.join(dir, ".agents", "skills"),
    user: ({ homeDir }) => path.join(homeDir, ".agents", "skills")
  },
  cursor: {
    label: "Cursor",
    project: (dir) => path.join(dir, ".cursor", "skills"),
    user: ({ homeDir }) => path.join(homeDir, ".cursor", "skills")
  },
  opencode: {
    label: "OpenCode",
    project: (dir) => path.join(dir, ".opencode", "skills"),
    user: ({ homeDir, env }) => path.join(env.XDG_CONFIG_HOME || path.join(homeDir, ".config"), "opencode", "skills")
  },
  codex: {
    label: "Codex (CODEX_HOME skills folder)",
    project: (dir) => path.join(dir, ".agents", "skills"),
    user: ({ homeDir, env }) => path.join(env.CODEX_HOME || path.join(homeDir, ".codex"), "skills")
  }
};

const DEFAULT_AGENTS = ["claude", "agents"];

const SKILL_OPTIONS = {
  help: { type: "boolean", short: "h" },
  agent: { type: "string" },
  scope: { type: "string" },
  "project-dir": { type: "string" },
  force: { type: "boolean" },
  "print-only": { type: "boolean" }
};

export function skillHelp() {
  return `Usage:
  uvcs-mcp skill install [options]
  uvcs-mcp skill path

Installs the ${SKILL_NAME} agent skill (SKILL.md) that teaches agents to use
the uvcs MCP tools. "path" prints the folder of the bundled skill.

Options:
  --agent=<list>           Comma-separated: ${Object.keys(SKILL_AGENTS).join(", ")}, all
                           (default: ${DEFAULT_AGENTS.join(",")})
                             claude    Claude Code
                             agents    .agents/skills: Codex, Cursor, OpenCode, Gemini CLI, ...
                             cursor    .cursor/skills
                             opencode  .opencode/skills or ~/.config/opencode/skills
                             codex     $CODEX_HOME/skills (user scope)
  --scope=<scope>          user | project (default: user)
  --project-dir=<path>     Project folder for --scope=project (usually the workspace)
  --force                  Replace an existing, different copy (the old one is kept as a .bak folder)
  --print-only             Show the target folders without writing anything
  -h, --help               Show this help
`;
}

export async function runSkill(args = [], overrides = {}) {
  const ctx = {
    env: overrides.env ?? process.env,
    homeDir: overrides.homeDir ?? os.homedir(),
    now: overrides.now ?? (() => new Date()),
    source: overrides.source ?? SKILL_SOURCE,
    write: (text) => (overrides.stdout ?? process.stdout).write(text)
  };
  const [subcommand, ...rest] = args;
  if (!subcommand || subcommand === "--help" || subcommand === "-h" || subcommand === "help") {
    ctx.write(skillHelp());
    return;
  }
  if (subcommand === "path") {
    ctx.write(`${ctx.source}\n`);
    return;
  }
  if (subcommand !== "install") {
    throw usageError(`Unknown skill command "${subcommand}". Run "uvcs-mcp skill --help".`);
  }

  const flags = parseSkillArgs(rest);
  if (flags.help) {
    ctx.write(skillHelp());
    return;
  }
  const scope = flags.scope ?? "user";
  if (!["user", "project"].includes(scope)) throw usageError(`--scope must be user or project, not "${scope}"`);
  if (scope === "project" && !flags["project-dir"]) {
    throw usageError("--scope=project requires --project-dir=<folder>, usually the workspace root");
  }
  if (scope === "user" && flags["project-dir"]) {
    throw usageError("--project-dir is only used with --scope=project");
  }
  const agents = expandAgents(flags.agent);
  const projectDir = flags["project-dir"] ? path.resolve(flags["project-dir"]) : undefined;
  if (projectDir && !(await isDirectory(projectDir))) {
    throw cliError(`Project folder does not exist: ${projectDir}`);
  }

  const sourceFiles = await listFiles(ctx.source);
  const targets = [...new Set(agents.map((agent) => {
    const root = scope === "project" ? SKILL_AGENTS[agent].project(projectDir) : SKILL_AGENTS[agent].user(ctx);
    return path.join(root, SKILL_NAME);
  }))];

  for (const target of targets) {
    const state = await compareFolder(ctx.source, sourceFiles, target);
    if (flags["print-only"]) {
      ctx.write(`${state === "missing" ? "Would install" : state === "same" ? "Up to date" : "Differs (needs --force)"}: ${target}\n`);
      continue;
    }
    if (state === "same") {
      ctx.write(`Up to date: ${target}\n`);
      continue;
    }
    if (state === "different") {
      if (!flags.force) {
        throw cliError(`${target} already exists and differs from this version. Re-run with --force to replace it (a .bak copy is kept).`);
      }
      ctx.write(`Backup: ${await backupFolder(target, ctx.now())}\n`);
    }
    await copyFiles(ctx.source, sourceFiles, target);
    ctx.write(`Installed: ${target}\n`);
  }

  if (!flags["print-only"]) {
    ctx.write("\nThe skill needs the uvcs MCP server. If it is not configured yet, run:\n");
    ctx.write("  uvcs-mcp init --client=<client> --workspace=<path> --safety=guarded\n");
    ctx.write("Restart the agent so it loads the skill.\n");
  }
}

function parseSkillArgs(args) {
  try {
    return parseArgs({ args, options: SKILL_OPTIONS, strict: true, allowPositionals: false }).values;
  } catch (error) {
    throw parseArgsError(error, SKILL_OPTIONS, "uvcs-mcp skill --help");
  }
}

function expandAgents(value) {
  if (value === undefined) return DEFAULT_AGENTS;
  const requested = [...new Set(String(value).split(",").map((item) => item.trim()).filter(Boolean))];
  if (requested.includes("all")) return Object.keys(SKILL_AGENTS);
  const unknown = requested.filter((agent) => !SKILL_AGENTS[agent]);
  if (requested.length === 0 || unknown.length > 0) {
    throw usageError(`Unknown agent: ${unknown.join(", ") || "(none)"}. Valid agents: ${Object.keys(SKILL_AGENTS).join(", ")}, all`);
  }
  return requested;
}

export async function listFiles(root, relative = "") {
  const entries = await fs.readdir(path.join(root, relative), { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const child = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isDirectory()) files.push(...await listFiles(root, child));
    else if (entry.isFile()) files.push(child);
  }
  return files;
}

async function compareFolder(source, sourceFiles, target) {
  if (!(await isDirectory(target))) return "missing";
  const targetFiles = await listFiles(target);
  if (targetFiles.join("\n") !== sourceFiles.join("\n")) return "different";
  for (const file of sourceFiles) {
    const [left, right] = await Promise.all([fs.readFile(path.join(source, file)), fs.readFile(path.join(target, file))]);
    if (!left.equals(right)) return "different";
  }
  return "same";
}

async function copyFiles(source, files, target) {
  for (const file of files) {
    await fs.mkdir(path.dirname(path.join(target, file)), { recursive: true });
    await fs.copyFile(path.join(source, file), path.join(target, file));
  }
}

async function backupFolder(folder, date) {
  const pad = (value) => String(value).padStart(2, "0");
  const stamp = `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  for (let attempt = 0; ; attempt += 1) {
    // Kept beside the skills folder, not inside it, so agents do not load it as a second skill.
    const backup = path.join(path.dirname(path.dirname(folder)), `${path.basename(folder)}.${stamp}${attempt > 0 ? `-${attempt}` : ""}.bak`);
    try {
      await fs.rename(folder, backup);
      return backup;
    } catch (error) {
      if (!["EEXIST", "ENOTEMPTY", "EPERM"].includes(error?.code) || attempt >= 99) throw error;
    }
  }
}

async function isDirectory(directory) {
  try {
    return (await fs.stat(directory)).isDirectory();
  } catch {
    return false;
  }
}

function cliError(message, exitCode = 1) {
  return Object.assign(new Error(message), { exitCode });
}

function usageError(message) {
  return cliError(message, 2);
}
