# Workflows

Each workflow assumes you already called `uvcs_setup_status`. Steps marked **(write)** need the user's explicit approval between prepare and confirm.

## Review a branch before merging it

1. `uvcs_branch_list` with `nameLike` if the exact branch path is unknown.
2. `uvcs_changeset_analytics` with `branch` to list the branch's changesets, authors, and comments.
3. `uvcs_changeset_diff` with `source: "<branch path>"` for everything the branch changed. Note `byStatus`, `byType`, and `unityMetaWarnings`.
4. For the important text files, `uvcs_revision_diff` with `from: "<parent branch>"` and `to: "<branch path>"`. This compares the latest revisions on both branches, so later changes on the parent branch also show up. To see only the branch's own edits, diff its changesets with `changeset: "cs:<n>"`.
5. `uvcs_merge_preview` with `source: "<branch path>"` and `destination: "<target branch>"` to learn about conflicts without touching the workspace.
6. Summarize: purpose (from comments), risky areas (scenes, prefabs, ProjectSettings, Packages/manifest.json), `.meta` warnings, conflicts, and anything binary you could not inspect.

## Explain what changed between two builds or labels

1. `uvcs_label_list` with `nameLike` (for example `build` or `RELEASE`) to find both labels.
2. `uvcs_changeset_diff` with `source: "lb:<older>"` and `compareTo: "lb:<newer>"`.
3. `uvcs_changeset_analytics` with `since` / `until` around the label dates for the changeset comments.
4. Group the result by area (code, scenes, art, settings, packages) and write release notes from the comments, not from file names alone.

## Find when and why something changed

1. `uvcs_annotate` on the file, with `startLine` near the line in question and a small `maxLines`.
2. Take the changeset of the line and call `uvcs_changeset_diff` with `source: "cs:<n>"` to see what else changed with it.
3. `uvcs_revision_diff` with `changeset: "cs:<n>"` to read the change itself.
4. `uvcs_file_history` for the earlier and later revisions of the file.

## Merge a task branch safely

1. `uvcs_pending_changes`. If tracked changes are pending, stop and ask the user what to do with them.
2. `uvcs_branch_info`. The workspace must be on the destination branch; otherwise propose `uvcs_switch_workspace_prepare` **(write)**.
3. `uvcs_merge_preview` with `source`. If `alreadyMerged` is true, stop. If there are conflicts, list them and tell the user to do this merge in the UVCS client (`uvcs_merge_prepare` would refuse it).
4. Without conflicts: `uvcs_merge_prepare` → show → wait → `uvcs_merge_confirm` **(write)**.
5. `uvcs_pending_changes` to show the merge result, then `uvcs_name_preview` for the comment and `uvcs_checkin_prepare` → show → wait → `uvcs_checkin_confirm` **(write)**.

## Edit a locked scene or prefab

1. `uvcs_locks` with `paths: ["Assets/Scenes/Main.unity"]`. If a lock is listed, stop and tell the user who holds it.
2. `uvcs_checkout_prepare` with the same `paths` → show → wait → `uvcs_checkout_confirm` **(write)**. When the server's `lock.conf` covers the file, the file is now locked for everybody else.
3. Edit the file.
4. Check it in with `uvcs_checkin_prepare` and `paths` (next workflow); the checkin releases the lock.
5. If you ended up not changing a checked-out file, give the lock back with `uvcs_release_checkout_prepare` / `_confirm` **(write)**.

## Check in Unity work

1. `uvcs_pending_changes`. Decide with the user what belongs to this piece of work.
2. `uvcs_unity_meta_diagnostics`. A `missing-meta` finding means the file does not exist on disk: ask the user to open the project in Unity so the Editor generates it. Report `orphan-meta` findings to the user. Add `.meta` files that exist but are still private with `uvcs_add_prepare` / `uvcs_add_confirm` **(write)**.
3. Private files that should be versioned need `uvcs_add_prepare` / `_confirm` first **(write)**. Never add `Library/`, `Temp/`, `obj/`, `Logs/`, or `UserSettings/`.
4. `uvcs_name_preview` with `kind: "checkin"` for the comment.
5. `uvcs_checkin_prepare`: without `paths` when everything pending belongs to this work; otherwise with `paths` listing the files or folders. Show the user the prepared result: for a full checkin, `changedFiles` and `pendingChanges`; with `paths`, `changes`, `autoIncludedMeta`, `dependencies`, `unityMetaWarnings`, and `otherPendingChangesLeft` → wait → `uvcs_checkin_confirm` **(write)**. Do not edit the selected files between prepare and confirm.

## Create a release branch and label

1. `uvcs_style_setup_check`; if no style exists, ask the user before `uvcs_style_init_prepare`.
2. `uvcs_release_plan` with `releaseType` (`major`, `minor`, `patch`) or `releaseVersion`.
3. `uvcs_branch_safety_report` for the base branch.
4. `uvcs_branch_create_prepare` with the planned branch and `fromChangeset` set to the head changeset of the base branch (from `uvcs_branch_safety_report`) **(write)**.
5. Switch to the new branch with `uvcs_switch_workspace_prepare` **(write)**, update the version file, and check it in with the planned checkin message **(write)**.
6. After the release checkin, `uvcs_label_create_prepare` with the planned label and the changeset **(write)**.

## Several workspaces (fleet mode)

1. Inspect every target first (`uvcs_setup_status`, `uvcs_pending_changes` with each `workspace`).
2. Prepare the write in every workspace, then present one combined plan. Tokens expire quickly (2 minutes in the `guarded` profile); if a token expires before approval, prepare that workspace again.
3. Confirm workspace by workspace. Stop at the first failure and report which workspaces are done, failed, and untouched. Cross-repository operations are not atomic.
