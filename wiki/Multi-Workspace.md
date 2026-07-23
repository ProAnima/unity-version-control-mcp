# Multi-Workspace

Configure one MCP server for up to 50 named workspaces with a fleet manifest:

```bash
npx -y @proanima/uvcs-mcp@1.2.0 init --manifest=workspaces.json --client=cursor,codex --print-config
```

Start from `templates/fleet/workspaces.example.json`.

Every fleet tool call requires an explicit `workspace` selector. Use `--fleet-layout=isolated` when process-level isolation is preferred.

Use the `guarded` safety profile for shared or production workspaces. It pins the workspace and repository identity, limits checkin size, and keeps prepare/confirm tokens short-lived.

Before mass work, call `uvcs_setup_status` and `uvcs_workspace_status` for every selected workspace. Prepare every workspace, present one combined plan, and confirm each workspace independently. Cross-repository operations are not atomic.
