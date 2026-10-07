# Quick Start

Requirements: Node.js 22 or newer and a logged-in Plastic SCM / Unity Version Control `cm` client with an existing workspace.

Ask your AI IDE:

```text
Install this MCP server from https://github.com/ProAnima/unity-version-control-mcp, configure it for my Plastic SCM / Unity Version Control source-control workspace, and run uvcs_doctor.
```

Or configure one client from npm. Preview first, then run again without `--print-config`:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 init --client=cursor --workspace="D:/Repositories/YourWorkspace" --print-config
```

Replace `cursor` with the client you use (`codex`, `claude-code`, `claude-desktop`, `kiro`, `opencode`, `antigravity`, `windsurf`, ...). Project files such as `.cursor/mcp.json` are written into the workspace folder.

To run a git checkout instead of the npm package:

```bash
git clone https://github.com/ProAnima/unity-version-control-mcp.git uvcs-mcp
cd uvcs-mcp
npm ci
node src/cli.js init-local --client=cursor --workspace="D:/Repositories/YourWorkspace"
```

Keep `--workspace` (or `--project-dir`): `init` refuses to write project files into the clone itself.

Check the setup, restart the MCP client, and run:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 doctor --workspace="D:/Repositories/YourWorkspace"
```

```text
uvcs_setup_status
uvcs_workspace_status
```

Let the client auto-approve only read-only tools and keep manual approval for every `*_confirm` tool.
