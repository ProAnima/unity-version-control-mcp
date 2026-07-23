# Multi-Workspace and Fleet Work

UVCS MCP supports coordinated work across up to 50 workspaces through one MCP process. A fleet manifest gives each project a stable name, and every tool schema requires an explicit `workspace` selector. Each workspace keeps an independent `cm` working directory, safety policy, repository allowlist, audit log, confirmation context, and write lock.

The server never changes a global current directory. It creates a fixed backend for every manifest entry and dispatches each call directly to the selected backend. Confirmation tokens are bound to the workspace that prepared them, so a token cannot be confirmed against another project.

## Quick Setup

Copy `templates/fleet/workspaces.example.json`, then edit the paths and repository identities. The adjacent JSON Schema provides editor completion and typo detection:

```json
{
  "$schema": "./workspaces.schema.json",
  "version": 1,
  "defaults": {
    "safety": "guarded",
    "installSource": "npm",
    "checkinMaxFiles": 20,
    "tokenTtlSec": 120
  },
  "workspaces": [
    {
      "name": "game-client",
      "path": "D:/Repositories/GameClient",
      "allowedRepos": ["game-client@cloud"]
    },
    {
      "name": "game-server",
      "path": "D:/Repositories/GameServer",
      "allowedRepos": ["game-server@cloud"]
    }
  ]
}
```

Preview all client changes:

```bash
npx -y @proanima/uvcs-mcp init --manifest=workspaces.json --client=cursor,codex --print-config
```

Apply them after review:

```bash
npx -y @proanima/uvcs-mcp init --manifest=workspaces.json --client=cursor,codex
```

By default the example creates one MCP server named `uvcs`. Calls look like:

```json
{
  "name": "uvcs_workspace_status",
  "arguments": {
    "workspace": "game-client"
  }
}
```

For process-level isolation, add `--fleet-layout=isolated`. That creates MCP servers named `uvcs-game-client` and `uvcs-game-server`; tools in that layout do not need a workspace selector.

## Safety Profiles

- `readonly`: inspection and planning only. This is the default.
- `guarded`: enables writes, pins both workspace and repository identity, defaults checkins to 20 files, and uses a 120-second confirmation TTL. Repository identity is detected from `.plastic/plastic.workspace` when possible; otherwise `allowedRepos` is required.
- `standard`: enables guarded prepare/confirm writes and pins the workspace path, but does not require a repository allowlist. Use it only for trusted or disposable workspaces.

Generated configuration always sets `UVCS_ALLOWED_WORKSPACES` to the exact workspace path. Safety settings live in the MCP client configuration or fleet manifest rather than a versioned workspace file, so repository content cannot grant itself additional privileges.

Use `uvcs_setup_status` for every named workspace to see:

- workspace identity;
- effective safety profile and mode;
- workspace and repository allowlists;
- checkin, token, timeout, and output limits;
- audit configuration;
- branch, checkin, and release naming rules.

Naming conventions remain in `.uvcs-mcp/style.json`. Use `uvcs_style_setup_check` and `uvcs_style_init_prepare` / `uvcs_style_init_confirm` per workspace. A workspace style file may extend a shared central `.uvcs-mcp/style.json`.

## Recommended Mass-Work Flow

For a request such as “apply the same package change to the client and server workspaces”:

1. Call `uvcs_setup_status`, `uvcs_workspace_status`, and `uvcs_branch_info` with every target workspace selector.
2. Verify that every workspace has the expected identity, branch, repository, and naming rules.
3. Apply file edits to every target workspace.
4. Run diagnostics and prepare operations in every workspace.
5. Present one summary containing every workspace, intended files, branch/checkin names, and prepare result.
6. After explicit approval, confirm each workspace independently.
7. Stop on the first failure unless the user explicitly asks to continue, then report completed, failed, and untouched workspaces.

There is no atomic commit across independent UVCS repositories or workspaces. Prepare/confirm tokens cannot be shared between workspace selectors or isolated server processes.

## Operational Limits

- Maximum workspaces per manifest: 50.
- Write operations are serialized both in-process and through `.plastic/uvcs-mcp.write.lock`.
- Every confirmation token is bound to the workspace used during prepare.
- `uvcs_undo_prepare` / `uvcs_undo_confirm` can undo one path; whole-workspace undo is forbidden.
- Read timeout defaults to 30 seconds.
- Write timeout defaults to 300 seconds.
- Combined stdout/stderr is limited to 10 MiB by default.
- A workspace state change after prepare invalidates switch, merge, update, and checkin confirmation.
