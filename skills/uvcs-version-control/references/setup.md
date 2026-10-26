# Connecting the uvcs MCP server

This skill only works when the uvcs MCP server is connected to the agent. The user installs it; the agent should not edit MCP configuration files on its own.

## Requirements

- Node.js 22 or newer.
- The Plastic SCM / Unity Version Control `cm` CLI, version 10.0.16.6656 or newer (11.x included), logged in to the server.
- An existing workspace folder.

## Recommended: the setup command

The user runs this in a terminal. It writes the server entry for the chosen client with the workspace pinned. With `--print-config` it only prints the entry and writes nothing:

```bash
npx -y @proanima/uvcs-mcp init --client=claude-code --workspace="D:/Repositories/MyGame" --safety=guarded --print-config
```

Run it again without `--print-config` to write the configuration. Supported `--client` values: `cursor`, `cursor-global`, `codex`, `claude-desktop`, `claude-code`, `opencode`, `opencode-global`, `antigravity`, `antigravity-global`, `kiro`, `kiro-global`, `windsurf`, or `all`. Then:

```bash
npx -y @proanima/uvcs-mcp doctor --workspace="D:/Repositories/MyGame"
```

Restart the agent and call `uvcs_setup_status`.

## Manual entry

Most clients accept this MCP server block (stdio):

```json
{
  "command": "npx",
  "args": ["-y", "@proanima/uvcs-mcp"],
  "env": {
    "UVCS_WORKSPACE": "D:/Repositories/MyGame",
    "UVCS_MCP_MODE": "readonly"
  }
}
```

On Windows, clients that cannot start `npx` directly (`spawn npx ENOENT`) need `"command": "cmd"` with `"args": ["/c", "npx", "-y", "@proanima/uvcs-mcp"]`.

## Safety profiles

- `readonly` (default): inspection, history, review, merge preview, planning.
- `guarded`: writes allowed, workspace and repository identity pinned. Recommended for agent work.
- `standard`: writes allowed with only the workspace pinned. Trusted or disposable workspaces only.

Configure the client to auto-approve read-only tools and to ask before every `*_confirm` tool.

## More

Full documentation: https://github.com/ProAnima/unity-version-control-mcp
