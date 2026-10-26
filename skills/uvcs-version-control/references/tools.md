# uvcs MCP tool catalog

All tools return JSON. Read-only tools never change the workspace or the server. Write tools exist as `*_prepare` / `*_confirm` pairs and need the `standard` or `guarded` profile.

In fleet mode every tool also requires `workspace` (one of the names from the manifest).

## Setup and status

| Tool | Arguments | Returns |
| --- | --- | --- |
| `uvcs_setup_status` | none | Safety profile, workspace and repository identity, write limits, naming conventions, readiness for read, write, and mass work. Call first. |
| `uvcs_policy_status` | none | The effective safety policy only. |
| `uvcs_doctor` | none | `cm` version, workspace checks, configuration warnings. Use when tools fail. |
| `uvcs_workspace_status` | none | Short `cm status`: the paths of pending changes. |
| `uvcs_branch_info` | none | Current branch, workspace selector (`BR`, `CS`, or `LB`), repository. |
| `uvcs_pending_changes` | none | Every pending change with its status code, for example `AD` added, `CH` changed, `CO` checked out, `LD` deleted locally, `LM` moved locally, `DE` deleted, `MV` moved. `PR` (private) and `IG` (ignored) items are not checked in. |
| `uvcs_diff_file` | `filePath`, optional `context` | Unified line diff of one pending file: the revision loaded in the workspace against the file on disk. Also reports `status`, `change`, and `movedFrom` for moves. |
| `uvcs_locks` | optional `paths`, `scope` (`all`, `user`, `workspace`) | Exclusive locks as `locks` (`itemId`, `owner`, `workspace`, `path`). Without `paths`, the list covers every repository on the server. |
| `uvcs_unity_meta_diagnostics` | none | Files and folders on disk without a `.meta` file (`missing-meta`) and `.meta` files without an asset (`orphan-meta`). |

## History and review (read-only)

| Tool | Arguments | Use it to |
| --- | --- | --- |
| `uvcs_changeset_diff` | `source` (`cs:N`, `lb:NAME`, `sh:N`, or a branch path), optional `compareTo` (`cs:N`, `lb:NAME`, `sh:N`), `maxItems` | List added, changed, moved, and deleted items, with counts by status and type and `unityMetaWarnings`. A branch source lists everything changed on that branch. With `compareTo`, `source` is the older side; `compareTo` cannot be combined with a branch source. |
| `uvcs_revision_diff` | `filePath`, then either `changeset` (`cs:N`) or `from` (+ optional `to`), optional `context` | Unified line diff of one file. `changeset` compares it with its parent changeset. `from` without `to` compares with the workspace copy. Reports `change` (`added`, `changed`, `deleted`) and `binary`. |
| `uvcs_file_history` | `filePath` (file or folder), optional `maxResults` (default 50) | Revisions newest first: changeset, branch, date (in the cm client locale format), owner, comment. |
| `uvcs_annotate` | `filePath`, optional `revision`, `startLine`, `maxLines` | Per-line changeset, owner, date, and branch, plus line counts per owner. |
| `uvcs_branch_list` | optional `nameLike`, `owner`, `since` (YYYY-MM-DD), `parent`, `maxResults` | Branches newest first with parent and head changeset. |
| `uvcs_label_list` | optional `nameLike`, `owner`, `since`, `branch`, `maxResults` | Labels newest first with labeled changeset and branch. `spec` is ready to pass to the read-only tools. |
| `uvcs_changeset_analytics` | optional `since`, `until`, `branch`, `owner`, `commentLike`, `maxResults` | Changesets with counts by owner and branch. |
| `uvcs_merge_preview` | `source`, optional `destination` (branch), `maxItems` | What a merge would do without doing it: `conflicts`, `changes`, `alreadyMerged`, and a recommendation. Without `destination` the target is the workspace; with it the preview is computed on the server. |
| `uvcs_branch_safety_report` | optional `branch`, `recentChangesets` | Current branch, pending changes, recent changesets, and recommendations before risky work. |
| `uvcs_cleanup_candidates` | optional `patterns`, `maxResults` | Temporary or agent branches to review by hand. Never deletes anything. |

## Naming and release planning (read-only)

| Tool | Arguments | Use it to |
| --- | --- | --- |
| `uvcs_style_setup_check` | none | Find out whether `.uvcs-mcp/style.json` exists. If not, ask the user before creating it. |
| `uvcs_style_rules` | none | Read branch, checkin, and release conventions. |
| `uvcs_name_preview` | `kind` (`branch` or `checkin`), `type`, `title` (branch) or `summary` (checkin), optional `baseBranch` | Generate a compliant branch name or checkin comment. |
| `uvcs_release_plan` | `releaseType` or `releaseVersion`, optional `currentVersion`, `projectName` | Plan the release branch, label, and comments. |

## Writes (prepare, then confirm after user approval)

| Pair | Prepare arguments | Notes |
| --- | --- | --- |
| `uvcs_style_init_*` | optional `preset` (`unity` by default, `conventional`, `minimal`), `baseBranch`, `branchPrefix`, `versionFile`, `overwrite` | Writes `.uvcs-mcp/style.json`. |
| `uvcs_update_workspace_*` | none | Updates to the branch head. Warns about pending changes. |
| `uvcs_add_*` | `itemPath` | Recursive add. Add the matching `.meta` too. |
| `uvcs_undo_*` | `itemPath`, optional `recursive` | Irreversible. Workspace root is refused. |
| `uvcs_checkout_*` | `paths` (files) | Checks the files out and takes the exclusive lock when the server's `lock.conf` covers them. Refuses locked, private, added, missing, and directory items. |
| `uvcs_release_checkout_*` | `paths` (checked-out files) | Releases checkouts of unchanged files (`cm undo --unchanged`). The result lists `released` and `stillCheckedOut` (modified files keep their checkout and edits). |
| `uvcs_branch_create_*` | `branch`, `fromChangeset` or `fromLabel`, optional `comment` | |
| `uvcs_label_create_*` | `label`, `target` (`cs:N`), optional `comment` | |
| `uvcs_switch_workspace_*` | `target` (branch, `cs:N`, or `lb:NAME`) | Refused with pending changes. |
| `uvcs_merge_*` | `source`, optional `comment` | Refused with pending changes, with conflicts (`MERGE_HAS_CONFLICTS`), or when already merged. Result stays pending until checkin. |
| `uvcs_checkin_*` | `message` (one line), optional `paths` | Without `paths`: **all** tracked pending changes. With `paths`: only those files and folders, plus `autoIncludedMeta` and `dependencies`; also returns `changes`, `unityMetaWarnings`, and `otherPendingChangesLeft`. Without `paths` the prepare returns `changedFiles` and the raw `pendingChanges`. Limited by `UVCS_CHECKIN_MAX_FILES` (selected items plus dependencies). |

Every confirm takes `token` and `confirmPhrase` exactly as returned by its prepare.

## Error codes worth knowing

| Code | What to do |
| --- | --- |
| `STANDARD_MODE_REQUIRED` | Writes are disabled. Tell the user; do not try to work around it. |
| `WORKSPACE_CHANGED_SINCE_PREPARE` | Something changed between prepare and confirm. Inspect, then prepare again. |
| `WRITE_INTERRUPTED_STATE_UNKNOWN` | Do not retry. Inspect status and report. |
| `PENDING_CHANGES_BLOCK_SWITCH` / `PENDING_CHANGES_BLOCK_MERGE` | Ask the user how to handle their pending work. |
| `MERGE_HAS_CONFLICTS` | List the conflicts; the user does this merge in the UVCS client. |
| `NOTHING_TO_MERGE` | The source is already merged; nothing to do. |
| `UNITY_META_NOT_ADDED` | Add the listed `.meta` files with `uvcs_add_prepare` / `_confirm`, then prepare the checkin again. |
| `ITEM_LOCKED` | Another user or workspace holds the lock (see `details.locks`); tell the user who. Do not try to work around it. |
| `ITEM_NOT_CONTROLLED` | The file is new (private or added) and not in the repository yet, so there is nothing to lock. |
| `CHECKOUT_FILES_ONLY` | A folder was passed; check out individual files. |
| `ALREADY_CHECKED_OUT` / `NOT_CHECKED_OUT` | The files are already checked out, or are not checked out, in this workspace. |
| `LOCK_CHECK_FAILED` | Locks could not be read; do not check out until `uvcs_locks` works. |
| `INVALID_PATH` | Use a plain relative path: no leading `-`, no `*` or `?`. |
| `CHECKIN_TOO_LARGE` | Too many files. The limit is `UVCS_CHECKIN_MAX_FILES` in the server configuration; with `paths`, select fewer files. |
| `INVALID_OBJECT_SPEC` | Use `cs:N`, `lb:NAME`, `sh:N`, or a branch path. |
| `PROCESS_OUTPUT_TOO_LARGE` | Narrow the query (`maxResults`, a smaller range, one file). |
