import fs from "node:fs/promises";
import path from "node:path";

export function claudeDesktopConfigPath({ platform = process.platform, homeDir, env = process.env }) {
  if (platform === "win32") {
    return path.join(env.APPDATA || path.join(homeDir, "AppData", "Roaming"), "Claude", "claude_desktop_config.json");
  }

  if (platform === "darwin") {
    return path.join(homeDir, "Library", "Application Support", "Claude", "claude_desktop_config.json");
  }

  return path.join(env.XDG_CONFIG_HOME || path.join(homeDir, ".config"), "Claude", "claude_desktop_config.json");
}

export function codexConfigPath({ homeDir, env = process.env }) {
  return path.join(env.CODEX_HOME || path.join(homeDir, ".codex"), "config.toml");
}

export function antigravityGlobalConfigPath({ homeDir }) {
  return path.join(homeDir, ".gemini", "config", "mcp_config.json");
}

export function kiroGlobalConfigPath({ homeDir }) {
  return path.join(homeDir, ".kiro", "settings", "mcp.json");
}

export function opencodeGlobalConfigPath({ homeDir, env = process.env }) {
  return path.join(env.XDG_CONFIG_HOME || path.join(homeDir, ".config"), "opencode", "opencode.json");
}

export function windsurfConfigPath({ homeDir }) {
  return path.join(homeDir, ".codeium", "windsurf", "mcp_config.json");
}

export function cursorGlobalConfigPath({ homeDir }) {
  return path.join(homeDir, ".cursor", "mcp.json");
}

export function cmInstallCandidates({ platform = process.platform, env = process.env } = {}) {
  if (platform === "win32") {
    const programFiles = [...new Set([
      envValue(env, "ProgramFiles"),
      envValue(env, "ProgramW6432"),
      "C:\\Program Files"
    ].filter(Boolean))];
    return programFiles.map((dir) => path.win32.join(dir, "PlasticSCM5", "client", "cm.exe"));
  }

  if (platform === "darwin") {
    return [
      "/usr/local/bin/cm",
      "/Applications/PlasticSCM.app/Contents/Applications/cm.app/Contents/MacOS/cm"
    ];
  }

  return [
    "/usr/bin/cm",
    "/opt/plasticscm5/client/cm"
  ];
}

// Resolves cm to an absolute path like `where`/`which`, then falls back to the
// standard install locations: GUI MCP clients often start without the shell PATH.
export async function findCmExecutable({ platform = process.platform, env = process.env, candidates } = {}) {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const names = platform === "win32"
    ? windowsExecutableExtensions(env).map((extension) => `cm${extension}`)
    : ["cm"];
  const directories = String(envValue(env, "PATH") ?? "")
    .split(platform === "win32" ? ";" : ":")
    .map((item) => item.trim().replace(/^"(.*)"$/, "$1"))
    .filter((item) => item && pathApi.isAbsolute(item));

  for (const directory of directories) {
    for (const name of names) {
      const candidate = pathApi.join(directory, name);
      if (await isExecutableFile(candidate, platform)) return candidate;
    }
  }

  for (const candidate of candidates ?? cmInstallCandidates({ platform, env })) {
    if (await isExecutableFile(candidate, platform)) return candidate;
  }
  return null;
}

function windowsExecutableExtensions(env) {
  // Only .exe/.com can be spawned without a shell, so .cmd/.bat shims are skipped.
  const extensions = String(envValue(env, "PATHEXT") || ".COM;.EXE")
    .split(";")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item === ".exe" || item === ".com");
  return extensions.length > 0 ? [...new Set(extensions)] : [".exe"];
}

async function isExecutableFile(file, platform) {
  try {
    const stat = await fs.stat(file);
    if (!stat.isFile()) return false;
    if (platform !== "win32") await fs.access(file, fs.constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

function envValue(env, name) {
  const key = Object.keys(env).find((item) => item.toUpperCase() === name.toUpperCase());
  return key ? env[key] : undefined;
}
