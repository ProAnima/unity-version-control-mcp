---
name: uvcs-version-control
description: Work safely with Unity Version Control (Plastic SCM) through the uvcs MCP server. Use when the user asks about Plastic SCM or Unity Version Control state, pending changes, branches, labels, changesets, file history, blame, what changed between builds, reviewing a branch, previewing or running a merge, locking (checking out) scenes and prefabs, checking in all or only some Unity assets with their .meta files, or release branching and labeling in a cm workspace.
license: MIT
compatibility: Requires the uvcs MCP server (npm package @proanima/uvcs-mcp) to be connected to the agent, the Plastic SCM / Unity Version Control cm CLI 10.0.16.6656 or newer, and an existing workspace. Works in agents that load SKILL.md skills and MCP servers, such as Claude Code, Codex, Cursor, OpenCode, and Gemini CLI.
metadata:
  author: Ian Panaev, ProAnimaStudio
  version: "1.0.0"
  homepage: https://github.com/ProAnima/unity-version-control-mcp
  mcp-server: uvcs
external_urls:
  - https://registry.npmjs.org
  - https://github.com/ProAnima/unity-version-control-mcp
---

# Unity Version Control (Plastic SCM) with the uvcs MCP server

This skill teaches you to answer source-control questions and perform source-control operations in a Plastic SCM / Unity Version Control (UVCS) workspace through the `uvcs_*` MCP tools. The tools wrap a fixed allowlist of `cm` commands. There is no shell access and no raw `cm`.

UVCS is not Git. Do not run `git` in a UVCS workspace, and do not describe UVCS concepts in Git terms without saying so: a changeset (`cs:123`) is a commit, a label (`lb:NAME`) is a tag, a branch is a path such as `/main/task-42`, a shelve (`sh:12`) is a stash kept on the server, and checkin is commit plus push in one step.

## 1. Check that the tools are available

Look for tools named `uvcs_setup_status`, `uvcs_workspace_status`, and so on (some clients prefix them, for example `mcp__uvcs__uvcs_setup_status`).

- If no `uvcs_*` tools exist, stop and tell the user that the uvcs MCP server is not connected. Point them to the setup steps in [references/setup.md](references/setup.md). Do not edit MCP client configuration files yourself.
- If a tool named in this skill is missing (for example `uvcs_merge_preview`), the server is older than this skill. Use the closest available tool and suggest upgrading the server.

## 2. Orient yourself before anything else

1. Call `uvcs_setup_status`. Note the workspace path, repository, safety profile (`readonly`, `guarded`, or `standard`), whether writes are enabled, the checkin file limit, and the naming rules.
2. Call `uvcs_branch_info` to learn the current branch and changeset.
3. In fleet mode every tool requires a `workspace` argument (a name from the fleet manifest). Pass it on every call and never mix workspaces in one operation.

If the profile is `readonly`, you can investigate and plan but not write. When the user wants a write, tell the user that writes are disabled and that enabling the `guarded` profile is their decision.

## 3. Pick the right tool

| The user wants | Call |
| --- | --- |
| What is modified in my workspace | `uvcs_pending_changes`, then `uvcs_diff_file` for a single file |
| What changed in changeset 123 / on a branch / between two builds | `uvcs_changeset_diff` (`source: "cs:123"`, `source: "/main/task"`, or `source: "lb:A", compareTo: "lb:B"`) |
| The actual line changes of a file in that change | `uvcs_revision_diff` (`changeset: "cs:123"`, or `from`/`to`) |
| Who changed a file and when | `uvcs_file_history` |
| Who wrote a specific line | `uvcs_annotate` with `startLine` / `maxLines` |
| Find a branch or label | `uvcs_branch_list`, `uvcs_label_list` |
| Recent activity by person, branch, or date | `uvcs_changeset_analytics` |
| Would this merge conflict | `uvcs_merge_preview` |
| Is it safe to switch, merge, or release | `uvcs_branch_safety_report` |
| Unity `.meta` problems | `uvcs_unity_meta_diagnostics` |
| Who holds a lock | `uvcs_locks` (pass `paths` to check specific files) |
| Lock a scene, prefab, or other binary asset before editing | `uvcs_checkout_prepare` / `_confirm` |
| Give back locks of files that were not changed | `uvcs_release_checkout_prepare` / `_confirm` |
| Check in only some files | `uvcs_checkin_prepare` with `paths` |
| Branch, checkin, or release names | `uvcs_style_rules`, `uvcs_name_preview`, `uvcs_release_plan` |

The full catalog with arguments is in [references/tools.md](references/tools.md).

Object specs: changesets are `cs:123`, labels are `lb:NAME` (names may contain spaces, for example `lb:build-264 (Dino)`), shelves are `sh:12`, and branches are full paths such as `/main/task` or `/6.0 my-project`. These names work in every read-only tool. Write tools (merge, switch, branch and label create) accept only plain names: letters, digits, `.`, `_`, `-`, and single spaces in branch names. File paths are relative to the workspace root, for example `Assets/Scripts/Player.cs`.

## 4. Writes: prepare, show, wait, confirm

Every write is two calls: `*_prepare` returns a payload and a short-lived token; `*_confirm` executes it.

1. Only start a write the user asked for.
2. Call the `*_prepare` tool and show the user what it will do: target, paths, pending changes, warnings.
3. Wait for the user to approve that exact operation in the conversation. Approval of one operation never covers another.
4. Call the matching `*_confirm` tool with the token and the exact `confirmPhrase` returned by prepare.
5. Afterwards, call `uvcs_workspace_status` and report the result.

Never retry a confirm after `WORKSPACE_CHANGED_SINCE_PREPARE` or `WRITE_INTERRUPTED_STATE_UNKNOWN`. Inspect `uvcs_pending_changes` and `uvcs_branch_info`, report the state, and prepare again only if the user still wants the operation. Tokens are single-use; an expired or consumed token means prepare again.

Rules that are easy to get wrong:

- **Without `paths`, checkin takes every tracked pending change in the workspace**, not only the files you edited. Look at `uvcs_pending_changes` first. When other work is pending, pass `paths` with the files or folders of this task. Show the user the prepared `changes`, `autoIncludedMeta` (the `.meta` files added for the selected assets), `dependencies` (new parent folders the change needs), and `otherPendingChangesLeft`.
- Edit files before preparing a checkin, not after: a later edit invalidates the token (`WORKSPACE_CHANGED_SINCE_PREPARE`), and you must prepare again.
- **Before every merge**, call `uvcs_merge_preview` and report conflicts. `uvcs_merge_prepare` refuses merges with conflicts (`MERGE_HAS_CONFLICTS`); those are done in the UVCS client. A clean merge result stays pending until a checkin.
- Switch and merge are refused while tracked changes are pending. Do not undo the user's work to get around it; ask them.
- `uvcs_undo_prepare` / `_confirm` is irreversible and never accepts the workspace root.
- Use names from `uvcs_name_preview` and `uvcs_release_plan` so branches, checkin comments, and labels follow the workspace style.

## 5. Unity rules

- Every file and folder under `Assets/` has a `.meta` file that holds its GUID. Add, move, delete, and check in an asset together with its `.meta`. `uvcs_changeset_diff` reports `unityMetaWarnings` for changes that break this; mention them.
- Never edit or add `Library/`, `Temp/`, `obj/`, `Logs/`, `UserSettings/`, or build output.
- With Unity's default Force Text asset serialization, scenes (`.unity`), prefabs, and `.asset` files are YAML text, so `uvcs_revision_diff` works on them, but a line diff says little about the visual result. Say so when you summarize such changes.
- Textures, audio, and models are binary. `uvcs_revision_diff` reports `binary: true`; describe them by path and history only.
- Binary assets cannot be merged, and merging scenes and prefabs is error-prone even though they are text. Before editing such a file that others may work on, call `uvcs_locks` with its path and, if it is free, check it out with `uvcs_checkout_prepare` / `_confirm`. If the server has a lock rule for the file, the checkout locks it. If someone else holds the lock, stop and tell the user who.
- When the work is done, a checkin releases the lock. Release checkouts of files you did not change with `uvcs_release_checkout_prepare` / `_confirm`.
- A checkin with `paths` brings the `.meta` file of every selected asset along automatically and refuses an asset whose `.meta` is not added yet (`UNITY_META_NOT_ADDED`): add the `.meta` with `uvcs_add_prepare` / `_confirm` first.

## 6. Common workflows

Step-by-step recipes for these are in [references/workflows.md](references/workflows.md):

- review a branch before merging it;
- explain what changed between two builds or labels (release notes);
- investigate when and why a line or file changed;
- merge a task branch safely;
- edit a locked scene or prefab;
- check in Unity work, all of it or only some files;
- create a release branch and label.

## 7. Reporting

- Report SCM state separately from Unity Editor state; these tools do not see the Editor.
- Quote changeset numbers, branch paths, and labels exactly as the tools return them.
- When a result is `truncated`, or when `count` equals the `maxResults` you passed (branch, label, and changeset lists), say the list may be incomplete and offer to narrow the query.
- When a tool fails, show its `error.code` and follow its `hint`.
