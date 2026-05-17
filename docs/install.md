# Install

## AI IDE assisted install

Ask your AI IDE to install this MCP server from the Git repository URL:

```text
Install this MCP server from https://github.com/ProAnima/unity-version-control-mcp, configure it for my Plastic SCM / Unity Version Control workspace, and run uvcs_doctor.
```

The server has no runtime npm dependencies, so a git checkout can run directly with Node.js.

## From Git Clone

This repo has no runtime npm dependencies. After cloning it, clients can run the MCP server directly with Node.

```bash
git clone https://github.com/ProAnima/unity-version-control-mcp.git uvcs-mcp
cd uvcs-mcp
node src/cli.js init-local --client=cursor,codex,claude-code,opencode,antigravity,kiro --workspace="D:/Repositories/YourUnityProject" --mode=readonly
```

Convenience npm scripts are also available:

```bash
npm run setup:cursor -- --workspace="D:/Repositories/YourUnityProject"
npm run setup:codex -- --workspace="D:/Repositories/YourUnityProject"
npm run setup:all -- --workspace="D:/Repositories/YourUnityProject"
```

`init-local` writes client configs that run this checkout directly:

```json
{
  "command": "C:/Program Files/nodejs/node.exe",
  "args": ["C:/path/to/uvcs-mcp/src/cli.js"],
  "env": {
    "UVCS_WORKSPACE": "D:/Repositories/YourUnityProject",
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
node src/cli.js init-local --client=all --workspace="D:\Repositories\YourUnityProject"
```

macOS:

```bash
node src/cli.js init-local --client=all --workspace="$HOME/Repositories/YourUnityProject"
```

Linux:

```bash
node src/cli.js init-local --client=all --workspace="$HOME/Repositories/YourUnityProject"
```

If `cm` is not in `PATH`, pass an explicit CLI path:

```bash
node src/cli.js init-local --client=cursor --workspace="$HOME/Repositories/YourUnityProject" --cm="/path/to/cm"
```

## From npm

```bash
npx -y @proanima/uvcs-mcp init
```

The initializer merges an `uvcs` MCP server block into supported client configs and keeps existing `mcpServers` entries.

## Manual npm config

```json
{
  "command": "npx",
  "args": ["-y", "@proanima/uvcs-mcp"],
  "env": {
    "UVCS_WORKSPACE": "D:/Repositories/YourUnityProject",
    "UVCS_MCP_MODE": "readonly"
  }
}
```

## Troubleshooting

```bash
node src/cli.js doctor --workspace="D:/Repositories/YourUnityProject"
```

On Windows, if Cyrillic paths or output look broken in a terminal, run:

```bat
chcp 65001
```
