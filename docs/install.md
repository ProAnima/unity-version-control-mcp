# Install

## AI IDE assisted install

Ask your AI IDE to install this MCP server from the GitHub repository URL:

```text
Install this MCP server from https://github.com/ProAnima/unity-version-control-mcp, configure it for my Plastic SCM / Unity Version Control source-control workspace, and run uvcs_doctor.
```

Install dependencies with `npm ci` when running a git checkout. npm installations resolve the pinned MCP SDK and validation dependencies automatically.

## From Git Clone

After cloning, install dependencies before configuring clients:

```bash
git clone https://github.com/ProAnima/unity-version-control-mcp.git uvcs-mcp
cd uvcs-mcp
npm ci
node src/cli.js init-local --client=cursor,codex,claude-code,opencode,antigravity,kiro --workspace="D:/Repositories/YourWorkspace" --mode=readonly
```

Convenience npm scripts are also available:

```bash
npm run setup:cursor -- --workspace="D:/Repositories/YourWorkspace"
npm run setup:codex -- --workspace="D:/Repositories/YourWorkspace"
npm run setup:all -- --workspace="D:/Repositories/YourWorkspace"
```

`init-local` writes client configs that run this checkout directly:

```json
{
  "command": "C:/Program Files/nodejs/node.exe",
  "args": ["C:/path/to/uvcs-mcp/src/cli.js"],
  "env": {
    "UVCS_WORKSPACE": "D:/Repositories/YourWorkspace",
    "UVCS_MCP_MODE": "readonly"
  }
}
```

Use `--dry-run` or `--print-config` to preview config changes.

Supported `--client` values:

```text
cursor,cursor-global,codex,claude-desktop,claude-code,opencode,opencode-global,antigravity,kiro,kiro-global,windsurf,all
```

Existing config files are backed up as `.bak` before writing. Use `--no-backup` only when you intentionally want to overwrite without a backup.

## Manual setup by OS

Windows:

```powershell
node src/cli.js init-local --client=all --workspace="D:\Repositories\YourWorkspace"
```

macOS:

```bash
node src/cli.js init-local --client=all --workspace="$HOME/Repositories/YourWorkspace"
```

Linux:

```bash
node src/cli.js init-local --client=all --workspace="$HOME/Repositories/YourWorkspace"
```

If `cm` is not in `PATH`, pass an explicit CLI path:

```bash
node src/cli.js init-local --client=cursor --workspace="$HOME/Repositories/YourWorkspace" --cm="/path/to/cm"
```

## From npm

```bash
npx -y @proanima/uvcs-mcp@1.2.0 init
```

The initializer merges an `uvcs` MCP server block into supported client configs and keeps existing `mcpServers` entries.

Choose a safety profile explicitly for shared workspaces:

```bash
npx -y @proanima/uvcs-mcp@1.2.0 init --workspace="D:/Repositories/YourWorkspace" --safety=guarded --allowed-repos="repository@server:8087"
```

Use `--manifest=workspaces.json` for one MCP server that routes every call to an explicit named workspace. Add `--fleet-layout=isolated` for one MCP process per workspace. See [Multi-Workspace and Fleet Work](multi-workspace.md).

The initializer warns when a configured path does not currently contain `.plastic/plastic.workspace`. Validate one workspace with `uvcs-mcp doctor --workspace=<path>` or an entire fleet with `uvcs-mcp doctor --manifest=workspaces.json`.

After restarting the MCP client, call `uvcs_setup_status`. If project naming rules are missing, create them with `uvcs_style_init_prepare` and `uvcs_style_init_confirm` in `guarded` or `standard` mode.

## Manual npm config

```json
{
  "command": "npx",
  "args": ["-y", "@proanima/uvcs-mcp@1.2.0"],
  "env": {
    "UVCS_WORKSPACE": "D:/Repositories/YourWorkspace",
    "UVCS_MCP_MODE": "readonly"
  }
}
```

## Troubleshooting

```bash
node src/cli.js doctor --workspace="D:/Repositories/YourWorkspace"
```

On Windows, if Cyrillic paths or output look broken in a terminal, run:

```bat
chcp 65001
```
