# Multi-Workspace and Fleet Work

UVCS MCP supports coordinated work across up to 50 workspaces through one MCP process. A fleet manifest gives each project a stable name, and every tool schema requires an explicit `workspace` selector. Each workspace keeps an independent `cm` working directory, safety policy, repository allowlist, audit log, confirmation context, and write lock.

The server never changes a global current directory. It creates a fixed backend for every manifest entry and dispatches each call directly to the selected backend. Confirmation tokens are bound to the workspace that prepared them, so a token cannot be confirmed against another project.

## Quick Setup

Copy `templates/fleet/workspaces.example.json`, then edit the paths and repository identities. The adjacent JSON Schema provides editor completion and typo detection. Every manifest key is described in [Configuration](configuration.md#fleet-manifest):

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
npx -y @proanima/uvcs-mcp@1.3.0 init --manifest=workspaces.json --client=cursor,codex --print-config
```

Apply them after review:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 init --manifest=workspaces.json --client=cursor,codex
```

Validate all entries before restarting the MCP client:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 doctor --manifest=workspaces.json
```

Fleet doctor reports `cm`, login, workspace status, and CLI capability results separately for every named workspace.

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

The one-process server validates the manifest strictly at startup. Unknown keys, invalid values, duplicate names, and two entries that resolve to the same path stop the server with an error. Per-workspace settings come only from the manifest: of the server's own `UVCS_*` environment variables, only `UVCS_CM_PATH`, `UVCS_CM_ARGS`, and `UVCS_CM_OUTPUT_ENCODING` apply to every workspace.

## Safety Profiles

- `readonly`: inspection and planning only. This is the default.
- `guarded`: enables writes, pins both workspace and repository identity, defaults checkins to 20 files, and uses a 120-second confirmation TTL. Repository identity is detected from workspace metadata (`.plastic/plastic.workspace` or `cm wi`, which works offline) or a read-only `cm status` header when possible; otherwise `allowedRepos` is required. If detection fails, the error names the workspace and suggests pinning `"allowedRepos": ["repo@server:port"]` in its manifest entry.
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

For a request such as "apply the same package change to the client and server workspaces":

1. Call `uvcs_setup_status`, `uvcs_workspace_status`, and `uvcs_branch_info` with every target workspace selector.
2. Verify that every workspace has the expected identity, branch, repository, and naming rules.
3. Apply file edits to every target workspace.
4. Run diagnostics and prepare operations in every workspace. A checkin includes all tracked pending changes of that workspace, so check `uvcs_pending_changes` for unrelated work first.
5. Present one summary containing every workspace, intended files, branch/checkin names, and prepare result.
6. After explicit approval, confirm each workspace independently.
7. Stop on the first failure unless the user explicitly asks to continue, then report completed, failed, and untouched workspaces.

There is no atomic commit across independent UVCS repositories or workspaces. Prepare/confirm tokens cannot be shared between workspace selectors or isolated server processes.

## Operational Limits

- Maximum workspaces per manifest: 50.
- Write operations are serialized both in-process and through `.plastic/uvcs-mcp.write.lock`, which is refreshed while a write runs and reclaimed when its owner process is gone.
- Every confirmation token is bound to the workspace used during prepare.
- `uvcs_undo_prepare` / `uvcs_undo_confirm` can undo one path; whole-workspace undo is forbidden.
- Read timeout defaults to 30 seconds.
- Write timeout defaults to 300 seconds.
- Combined stdout/stderr is limited to 10 MiB by default.
- A workspace state change after prepare invalidates switch, merge, update, undo, and checkin confirmation.
- A write interrupted by a timeout or the output limit returns `WRITE_INTERRUPTED_STATE_UNKNOWN`. Treat it as a failure for that workspace: stop, inspect its status, and report it.
