# Quick Start

Ask your AI IDE:

```text
Install this MCP server from https://github.com/ProAnima/unity-version-control-mcp, configure it for my Plastic SCM / Unity Version Control source-control workspace, and run uvcs_doctor.
```

Manual setup:

```bash
git clone https://github.com/ProAnima/unity-version-control-mcp.git uvcs-mcp
cd uvcs-mcp
node src/cli.js init-local --client=all --workspace="D:/Repositories/YourWorkspace"
```

Restart the MCP client and run:

```text
uvcs_doctor
uvcs_workspace_status
```

