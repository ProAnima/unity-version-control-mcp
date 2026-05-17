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

export function codexConfigPath({ homeDir }) {
  return path.join(homeDir, ".codex", "config.toml");
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
