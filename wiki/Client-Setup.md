# Client Setup

Supported clients:

- Cursor
- Codex
- Claude Desktop
- Claude Code
- OpenCode
- Antigravity
- Kiro
- Windsurf
- Zed template

Preview generated configs:

```bash
node src/cli.js init-local --client=all --workspace="D:/Repositories/YourWorkspace" --print-config
```

If `cm` is not in `PATH`, pass:

```bash
node src/cli.js init-local --client=cursor --workspace="D:/Repositories/YourWorkspace" --cm="/path/to/cm"
```

For multiple workspaces:

```bash
npx -y @proanima/uvcs-mcp@1.2.0 init --manifest=workspaces.json --client=cursor,codex --print-config
```
