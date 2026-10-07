# Rules for Agents

Use this MCP as a safe SCM assistant for Plastic SCM / Unity Version Control source-control workspaces. The backend is the `cm` CLI, not Unity Editor automation.

## Before Reading or Editing

- Start with `uvcs_setup_status` to learn the workspace, safety profile, write limits, and naming rules, then `uvcs_workspace_status`.
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
- Update, add, undo, branch create, label create, switch, merge, checkin, and style init must use their `*_prepare` tool followed by the matching `*_confirm` tool.
- Show the user the prepare result (target, paths, pending changes, warnings) and wait. Never call any `*_confirm` tool unless the user explicitly approved that exact operation in the current conversation. Approval of one operation does not cover another.
- A checkin always includes all tracked pending changes in the workspace, not only the files you edited. Review `uvcs_pending_changes` with the user before preparing it, and keep every Unity asset and its `.meta` file in the same checkin.
- Never retry a confirm after `WORKSPACE_CHANGED_SINCE_PREPARE` or `WRITE_INTERRUPTED_STATE_UNKNOWN`. Inspect `uvcs_pending_changes` and `uvcs_branch_info`, report the state to the user, and prepare again only if the user still wants the operation.
- Never attempt repository deletion, repository rename, arbitrary shell commands, or raw `cm` execution.

## Communication

- Report SCM state separately from Unity Editor project state.
- Say "Plastic SCM / Unity Version Control `cm` command" for SCM operations.
- Reserve "Unity" wording for asset workflow checks such as `.meta` diagnostics.
