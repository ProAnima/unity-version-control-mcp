# Rules for Agents

Use this MCP as a safe SCM assistant for Plastic SCM / Unity Version Control source-control workspaces. The backend is the `cm` CLI, not Unity Editor automation.

## Before Reading or Editing

- Start with `uvcs_setup_status` to learn the workspace, safety profile, write limits, and naming rules, then `uvcs_workspace_status`.
- Use `uvcs_pending_changes` before summarizing user work.
- Use `uvcs_locks` (with `paths`) before editing files that may be locked by other users, and `uvcs_checkout_prepare` / `uvcs_checkout_confirm` to take the lock on scenes, prefabs, and other binary assets before editing them.
- Use `uvcs_unity_meta_diagnostics` for Unity asset workspaces before checkin, especially when assets were created, moved, or deleted.
- Answer history questions with `uvcs_changeset_diff` (what changed in a changeset, label range, or branch), `uvcs_revision_diff` (line changes of one file), `uvcs_file_history`, `uvcs_annotate`, `uvcs_branch_list`, and `uvcs_label_list`.
- Run `uvcs_merge_preview` before every merge and report its conflicts to the user.

## During Edits

- Do not edit `Library/`, `Temp/`, `obj/`, `Logs/`, or generated build output.
- Treat `Assets/**/*.meta` as paired SCM metadata for Unity assets.
- If an asset is added, moved, or deleted, check the matching `.meta` file.
- Do not assume binary scene, prefab, texture, audio, or model diffs are semantically safe from text output alone.

## Write Operations

- Do not run write tools unless the user asked for the operation.
- Update, add, undo, checkout, release checkout, branch create, label create, switch, merge, checkin, and style init must use their `*_prepare` tool followed by the matching `*_confirm` tool.
- Show the user the prepare result (target, paths, pending changes, warnings) and wait. Never call any `*_confirm` tool unless the user explicitly approved that exact operation in the current conversation. Approval of one operation does not cover another.
- Without `paths`, a checkin includes all tracked pending changes in the workspace, not only the files you edited. When other work is pending, pass `paths` with the files of this task. Review the prepared `changes`, `autoIncludedMeta`, and `dependencies` with the user, and keep every Unity asset and its `.meta` file in the same checkin.
- Release locks you no longer need with `uvcs_release_checkout_prepare` / `uvcs_release_checkout_confirm`; modified files stay checked out until they are checked in.
- Never retry a confirm after `WORKSPACE_CHANGED_SINCE_PREPARE` or `WRITE_INTERRUPTED_STATE_UNKNOWN`. Inspect `uvcs_pending_changes` and `uvcs_branch_info`, report the state to the user, and prepare again only if the user still wants the operation.
- Never attempt repository deletion, repository rename, arbitrary shell commands, or raw `cm` execution.

## Communication

- Report SCM state separately from Unity Editor project state.
- Say "Plastic SCM / Unity Version Control `cm` command" for SCM operations.
- Reserve "Unity" wording for asset workflow checks such as `.meta` diagnostics.
