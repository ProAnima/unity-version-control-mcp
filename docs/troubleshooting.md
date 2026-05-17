# Troubleshooting

Use `uvcs_doctor` first. It checks Node.js, the `cm` CLI, the configured workspace, current branch context, server access, and whether optional API discovery is available.

```bash
node src/cli.js doctor --workspace="D:/Repositories/YourWorkspace"
```

For MCP clients, ask the agent to run:

```text
uvcs_doctor
```

## `cm` is not found

UVCS MCP uses the official Plastic SCM / Unity Version Control `cm` CLI. It does not ship its own SCM client.

Fix:

```bash
node src/cli.js init-local --client=cursor --workspace="D:/Repositories/YourWorkspace" --cm="/path/to/cm"
```

Or set:

```text
UVCS_CM_PATH=/path/to/cm
```

On Windows, common locations include Plastic SCM or Unity Version Control install folders under `Program Files`.

## Workspace is not set

Set `UVCS_WORKSPACE` to an existing Plastic SCM / Unity Version Control source-control workspace.

```json
{
  "env": {
    "UVCS_WORKSPACE": "D:/Repositories/YourWorkspace"
  }
}
```

The path must point to a workspace checkout, not merely to a repository name, Unity Editor installation, or empty folder.

## Workspace cannot reach the server

Run the official CLI directly:

```bash
cm status
```

If this fails outside MCP, fix the local Plastic SCM / Unity Version Control client first:

- log in with the official client;
- verify the server URL and port;
- verify VPN or network access;
- verify that the workspace still exists and is bound to the expected repository.

## Write tools are blocked

Write tools require:

```text
UVCS_MCP_MODE=standard
```

Critical write tools also require their matching prepare/confirm flow:

```text
uvcs_checkin_prepare
uvcs_checkin_confirm
```

This is intentional. `readonly` is the default mode for safer first-time installs.

## MCP client does not see `uvcs_*` tools

Check the generated client config:

```bash
node src/cli.js init-local --client=all --workspace="D:/Repositories/YourWorkspace" --print-config
```

Then:

- restart the MCP client;
- confirm the config file path for that client in [Clients](clients.md);
- verify that Node.js 20 or newer is available to the client process;
- run `node src/cli.js doctor` manually from the checkout.

## Windows path or Cyrillic output issues

If terminal output looks broken, use UTF-8 in the terminal session:

```bat
chcp 65001
```

Prefer quoted paths in examples and configs:

```powershell
node src/cli.js init-local --client=all --workspace="D:\Repositories\YourWorkspace"
```

## Branch, label, or merge command fails

UVCS MCP wraps documented `cm` commands, but server permissions and branch policies are still enforced by Plastic SCM / Unity Version Control.

Check:

- the target branch, label, or changeset exists;
- the user has permission to create branches, create labels, merge, or check in;
- the workspace has no unexpected pending changes before switching or merging;
- the branch naming policy, if your organization has one, is satisfied.

## Compatibility report

If a command behaves differently on a new Plastic SCM / Unity Version Control version, open a compatibility issue and include:

- operating system;
- MCP client;
- `cm version`;
- product branding, if visible;
- cloud, on-premises, or local server;
- sanitized `uvcs_doctor` output;
- the failing `uvcs_*` tool name;
- expected result and actual result.

