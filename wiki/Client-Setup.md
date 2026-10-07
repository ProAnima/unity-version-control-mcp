# Client Setup

Supported `--client` values:

- `cursor`, `cursor-global`
- `codex`
- `claude-desktop`
- `claude-code` (`init` also prints an equivalent `claude mcp add --scope user` command)
- `opencode`, `opencode-global`
- `antigravity` (`.agents/mcp_config.json`), `antigravity-global` (`~/.gemini/config/mcp_config.json`)
- `kiro`, `kiro-global`
- `windsurf` (Windsurf / Devin Desktop)
- Zed: copy `templates/mcp/zed.json`; there is no `init` client

Preview generated configs. Only the `uvcs` entries are printed, with each target path and whether it would be created, merged, or left unchanged:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 init --client=cursor,codex --workspace="D:/Repositories/YourWorkspace" --print-config
```

Project files go into the workspace folder unless `--project-dir=<folder>` is passed. Existing files are backed up as `<file>.<YYYYMMDDHHmmss>.bak`. If any target config is malformed, nothing is written; `--skip-invalid` skips that client and prints the entry to add by hand.

On Windows the generated command is plain `npx -y @proanima/uvcs-mcp@1.3.0` for Claude Code, Claude Desktop, Cursor, Codex, Kiro, and OpenCode, which resolve the `npx.cmd` shim themselves. Antigravity and Windsurf / Devin Desktop get `cmd /c npx -y @proanima/uvcs-mcp@1.3.0`. See [Clients](https://github.com/ProAnima/unity-version-control-mcp/blob/main/docs/clients.md#launch-command-on-windows).

`init` writes the absolute `cm` path as `UVCS_CM_PATH`. If `cm` is not found, pass:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 init --client=cursor --workspace="D:/Repositories/YourWorkspace" --cm="/path/to/cm"
```

For multiple workspaces:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 init --manifest=workspaces.json --client=cursor,codex --print-config
```

Auto-approve only read-only tools (every tool except `*_confirm`) and keep manual approval for `*_confirm` tools.

Details: [Clients](https://github.com/ProAnima/unity-version-control-mcp/blob/main/docs/clients.md), [Install](https://github.com/ProAnima/unity-version-control-mcp/blob/main/docs/install.md).
