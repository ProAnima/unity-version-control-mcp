# Rules for Agents

Use this MCP as a safe SCM assistant for Plastic SCM / Unity Version Control source-control workspaces. The backend is the `cm` CLI, not Unity Editor automation.

## Before Reading or Editing

- Start with `uvcs_workspace_status`.
- Use `uvcs_pending_changes` before summarizing user work.
- Use `uvcs_locks` before editing files that may be locked by other users.
- Use `uvcs_unity_meta_diagnostics` for Unity asset workspaces before checkin, especially when assets were created, moved, or deleted.

## During Edits

- Do not edit `Library/`, `Temp/`, `Obj/`, `Logs/`, or generated build output.
- Treat `Assets/**/*.meta` as paired SCM metadata for Unity assets.
- If an asset is added, moved, or deleted, check the matching `.meta` file.
- Do not assume binary scene, prefab, texture, audio, or model diffs are semantically safe from text output alone.

## Write Operations

- Do not run write tools unless the user asked for the operation.
- `uvcs_update_workspace` requires `UVCS_MCP_MODE=standard`.
- Add, branch create, label create, switch, merge, and checkin must use their `*_prepare` tool followed by the matching `*_confirm` tool.
- Never attempt repository deletion, repository rename, arbitrary shell commands, or raw `cm` execution.

## Communication

- Report SCM state separately from Unity Editor project state.
- Say "Plastic SCM / Unity Version Control `cm` command" for SCM operations.
- Reserve "Unity" wording for asset workflow checks such as `.meta` diagnostics.
