# Clients

## Cursor

Project config:

```text
.cursor/mcp.json
```

Global config:

```text
~/.cursor/mcp.json
```

Use `--client=cursor-global` for the global config.

## Claude Desktop

Windows:

```text
%APPDATA%\Claude\claude_desktop_config.json
```

macOS:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

Linux:

```text
~/.config/Claude/claude_desktop_config.json
```

## Claude Code

Project config:

```text
.mcp.json
```

Run:

```bash
node src/cli.js init-local --client=claude-code --workspace="D:/Repositories/YourWorkspace"
```

## OpenCode

Project config:

```text
opencode.json
```

Global config:

```text
~/.config/opencode/opencode.json
```

Use `--client=opencode-global` for the global config.

The generated server uses `type: "local"`, `command`, `enabled: true`, and `environment`.

## Antigravity

Project config:

```text
mcp_config.json
```

Run:

```bash
node src/cli.js init-local --client=antigravity --workspace="D:/Repositories/YourWorkspace"
```

## Kiro

Workspace config:

```text
.kiro/settings/mcp.json
```

Global config:

```text
%USERPROFILE%\.kiro\settings\mcp.json
```

Run:

```bash
node src/cli.js init-local --client=kiro --workspace="D:/Repositories/YourWorkspace"
node src/cli.js init-local --client=kiro-global --workspace="D:/Repositories/YourWorkspace"
```

## Windsurf

Global config:

```text
~/.codeium/windsurf/mcp_config.json
```

Other clients can use the same `command`, `args`, and `env` block from `templates/mcp`.

## Codex CLI

`init-local --client=codex` writes:

```text
%USERPROFILE%\.codex\config.toml
```

The generated section is `[mcp_servers.uvcs]` with a nested `[mcp_servers.uvcs.env]`.

## Zed

Use the `context_servers.uvcs` snippet from:

```text
templates/mcp/zed.json
```
