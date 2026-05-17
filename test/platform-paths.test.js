import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  claudeDesktopConfigPath,
  codexConfigPath,
  cursorGlobalConfigPath,
  kiroGlobalConfigPath,
  opencodeGlobalConfigPath,
  windsurfConfigPath
} from "../src/platform/paths.js";

test("client config paths are platform-aware", () => {
  const home = path.join("Users", "dev");

  assert.equal(
    claudeDesktopConfigPath({ platform: "darwin", homeDir: home, env: {} }),
    path.join(home, "Library", "Application Support", "Claude", "claude_desktop_config.json")
  );
  assert.equal(
    claudeDesktopConfigPath({ platform: "linux", homeDir: home, env: { XDG_CONFIG_HOME: "/xdg" } }),
    path.join("/xdg", "Claude", "claude_desktop_config.json")
  );
  assert.equal(
    claudeDesktopConfigPath({ platform: "win32", homeDir: home, env: { APPDATA: "C:\\Users\\dev\\AppData\\Roaming" } }),
    path.join("C:\\Users\\dev\\AppData\\Roaming", "Claude", "claude_desktop_config.json")
  );

  assert.equal(codexConfigPath({ homeDir: home }), path.join(home, ".codex", "config.toml"));
  assert.equal(cursorGlobalConfigPath({ homeDir: home }), path.join(home, ".cursor", "mcp.json"));
  assert.equal(kiroGlobalConfigPath({ homeDir: home }), path.join(home, ".kiro", "settings", "mcp.json"));
  assert.equal(opencodeGlobalConfigPath({ homeDir: home, env: {} }), path.join(home, ".config", "opencode", "opencode.json"));
  assert.equal(windsurfConfigPath({ homeDir: home }), path.join(home, ".codeium", "windsurf", "mcp_config.json"));
});
