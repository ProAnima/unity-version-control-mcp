# Multi-Workspace

Configure one MCP server for up to 50 named workspaces with a fleet manifest:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 init --manifest=workspaces.json --client=cursor,codex --print-config
```

Start from `templates/fleet/workspaces.example.json`. Manifest keys are listed in [Configuration](https://github.com/ProAnima/unity-version-control-mcp/blob/main/docs/configuration.md#fleet-manifest).

Every fleet tool call requires an explicit `workspace` selector. Use `--fleet-layout=isolated` when process-level isolation is preferred.

Each workspace takes its settings only from the manifest. Of the server's own `UVCS_*` environment variables, only `UVCS_CM_PATH`, `UVCS_CM_ARGS`, and `UVCS_CM_OUTPUT_ENCODING` are shared. Duplicate workspace names or paths stop the server at startup.

Use the `guarded` safety profile for shared or production workspaces. It pins the workspace and repository identity, limits checkin size, and keeps prepare/confirm tokens short-lived.

Before mass work, call `uvcs_setup_status` and `uvcs_workspace_status` for every selected workspace. Prepare every workspace, present one combined plan, and confirm each workspace independently after the user approves it. A checkin includes all tracked pending changes of its workspace. Cross-repository operations are not atomic: stop on the first failure and report completed, failed, and untouched workspaces.
