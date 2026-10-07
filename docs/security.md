# Security Model

UVCS MCP exposes a fixed allowlist of Plastic SCM / Unity Version Control `cm` commands. It does not expose arbitrary shell execution, `run_cm`, repository deletion, repository rename, branch or changeset deletion, or raw `cm api` server startup.

The MCP transport and request lifecycle are handled by the official MCP TypeScript SDK. Tool arguments are validated server-side with strict schemas before UVCS command handlers run: unknown arguments are rejected, and numeric inputs are integers with explicit minimum and maximum values.

All settings are listed in [Configuration](configuration.md).

## Modes

- `readonly` (default): status, pending changes, branch, locks, diff, analytics, planning, diagnostics, and doctor tools.
- `standard`: also enables the prepare/confirm write tools: update, add, path-scoped undo, branch create, label create, switch, merge, checkin, and style init.

The `guarded` and `standard` safety profiles both run in `standard` mode; `guarded` additionally pins the repository identity. An unrecognized `UVCS_MCP_MODE` value falls back to `readonly` and produces a warning.

## Prepare/confirm

Every write uses two calls:

1. A `*_prepare` tool validates inputs, checks workspace state when needed, and returns the planned operation with a short-lived token.
2. A `*_confirm` tool requires that token and the exact confirm phrase, and executes the operation.

Tokens are random, single-use, bound to one action and one workspace, and expire after `UVCS_TOKEN_TTL_SEC` (default 300 seconds; 120 in the `guarded` profile). Expired tokens are pruned from memory. Refusals use distinct codes: `CONFIRM_TOKEN_INVALID`, `CONFIRM_TOKEN_EXPIRED`, `CONFIRM_TOKEN_ACTION_MISMATCH`, and `CONFIRM_TOKEN_CONTEXT_MISMATCH`.

Switch, merge, undo, and checkin confirmations recompute a fingerprint of the workspace status header (the current changeset) and the tracked pending changes after consuming the token. Update confirmation rechecks the current branch line. If the state changed after prepare, confirmation is refused with `WORKSPACE_CHANGED_SINCE_PREPARE` and a new prepare is required. Private and ignored items are not part of the fingerprint.

The server cannot verify that a person approved a confirm call. It enforces the two-step flow and tells the agent, through tool descriptions, annotations, and server instructions, to show the prepare payload and wait for explicit approval. Configure MCP clients to auto-approve only tools marked `readOnlyHint` and to keep human approval for every `*_confirm` tool.

### Write scope

- **Checkin** runs `cm checkin --applychanged` and always includes all tracked pending changes in the workspace. It cannot check in a subset. Private and ignored files are not included. `UVCS_CHECKIN_MAX_FILES` (default 20) limits the number of tracked pending changes, and prepare refuses with `NOTHING_TO_CHECKIN` when there are none.
- **Undo** is limited to one relative file or directory; the workspace root is refused with `UNDO_WORKSPACE_ROOT_FORBIDDEN`. UVCS undo is irreversible.
- **Switch** and **merge** are refused while tracked pending changes exist. Private and ignored files do not block them. A merge result stays pending until a checkin; there is no merge preview.
- **Update** prepare reports `pendingChangesCount` and a warning when tracked pending changes exist, because updating over local edits can produce conflicts.

## MCP tool annotations

Every tool declares MCP annotations so clients can tell reads from writes:

| Tools | `readOnlyHint` | `destructiveHint` | `idempotentHint` |
| --- | --- | --- | --- |
| Read tools and every `*_prepare` tool | `true` | `false` | `true` |
| `uvcs_add_confirm`, `uvcs_branch_create_confirm`, `uvcs_label_create_confirm`, `uvcs_style_init_confirm`, `uvcs_checkin_confirm` | `false` | `false` | `false` |
| `uvcs_undo_confirm`, `uvcs_update_workspace_confirm`, `uvcs_switch_workspace_confirm`, `uvcs_merge_confirm` | `false` | `true` | `false` |

The server also sends MCP `instructions`: start with `uvcs_setup_status`; prepare, show the payload, and confirm only after explicit user approval; never retry a confirm after `WORKSPACE_CHANGED_SINCE_PREPARE` or `WRITE_INTERRUPTED_STATE_UNKNOWN`; checkin includes all tracked pending changes, so keep Unity assets and their `.meta` files together.

## Input validation

- Item paths (`filePath`, `itemPath`) are relative to `UVCS_WORKSPACE`. They are resolved and canonicalized through the filesystem, including symlink and junction targets.
- A path that resolves outside the workspace is rejected with `PATH_OUTSIDE_WORKSPACE`. Names that only begin with dots, such as `..foo`, are allowed.
- A path whose workspace-relative form starts with `-` is rejected with `INVALID_PATH`, because `cm` would parse it as an option (for example `cm undo -r`). Paths containing NUL, CR, or LF are rejected with `INVALID_PATH`.
- Branch and label names use a restricted character set and cannot start with `-`. Changeset specs must be `cs:<number>` and label specs `lb:<name>`.
- Checkin messages and comments must be single-line.

## Workspace and repository allowlists

`UVCS_ALLOWED_WORKSPACES` restricts the server to specific local workspace paths.

`UVCS_ALLOWED_REPOS` restricts the server to specific repository/server identities. The identity is read from `.plastic/plastic.workspace`; when that file has no repository metadata, from the read-only `cm wi --machinereadable`, which uses local workspace metadata and works offline; and only then from `cm status --header --nochanges`.

Example:

```text
UVCS_ALLOWED_REPOS=MyGame@uvcs.example.com:8087
```

Use semicolons for multiple entries.

Client setup always pins `UVCS_ALLOWED_WORKSPACES` to the configured workspace. The `guarded` safety profile detects the repository identity during setup; if it cannot be detected, an explicit repository allowlist is required. Run `uvcs_setup_status` to inspect the effective policy and workspace identity.

## Process execution

- Commands are argv arrays spawned with `shell: false`. Arguments containing NUL, CR, or LF are rejected before execution.
- stdin is closed, so a `cm` prompt for input fails immediately instead of waiting for the timeout.
- Limits: `UVCS_READ_TIMEOUT_MS` (default 30 seconds), `UVCS_WRITE_TIMEOUT_MS` (default 300 seconds), and `UVCS_MAX_OUTPUT_BYTES` for combined stdout/stderr (default 10 MiB).
- When a limit is exceeded, the process is terminated: on Windows the whole process tree with `taskkill /T /F`; on macOS and Linux the `cm` process receives `SIGTERM`, then `SIGKILL` after 2 seconds. The error is reported only after the process has exited (or after a 10-second grace period), so the write lock is not released while `cm` is still running.
- A mutating command interrupted by a timeout or the output limit returns `WRITE_INTERRUPTED_STATE_UNKNOWN`: the operation may have been partly applied. Do not retry; inspect `uvcs_pending_changes` and `uvcs_branch_info` first.
- Output is collected as bytes and decoded once, so multi-byte characters are never split. See `UVCS_CM_OUTPUT_ENCODING` in [Configuration](configuration.md).
- `cm` output in error results is truncated (2,000 characters in the message, 16,384 characters each for stdout and stderr in the details). `uvcs_diff_file` output is truncated at 200,000 characters and marked `truncated: true`.

## Cross-process write lock

Confirm steps are serialized per workspace inside one server process and, when the workspace has a `.plastic` folder, across processes through `.plastic/uvcs-mcp.write.lock`. This matters when several AI clients are configured for the same checkout.

- The lock records PID, hostname, and a random token; its timestamp is refreshed every 15 seconds while the write runs.
- A lock without a refresh for 2 minutes is stale and is replaced.
- A lock created on the same host by a process that no longer exists is reclaimed immediately. Locks from other hosts rely on the timestamp only.
- An abandoned `.cleanup` marker older than 30 seconds is removed.
- A writer waits up to 10 seconds for the lock, then fails with `WORKSPACE_WRITE_LOCKED`.

## Fleet isolation

Fleet mode requires a named `workspace` on every tool call. Confirmation tokens include that workspace context and cannot be replayed against another project. Each workspace has its own backend, policy, audit log, and write lock. Duplicate workspace paths in a manifest are rejected, and process-wide `UVCS_*` variables do not leak into workspaces: only `UVCS_CM_PATH`, `UVCS_CM_ARGS`, and `UVCS_CM_OUTPUT_ENCODING` are shared.

## Errors

Tool failures are returned as `isError` tool results with a stable error code, details, and a short remediation hint. See [error codes](troubleshooting.md#error-codes).

Cleanup helpers such as `uvcs_cleanup_candidates` and `uvcs_branch_safety_report` are read-only. They provide manual review guidance and do not delete branches, changesets, labels, or files.

## Audit logging

Set `UVCS_AUDIT_LOG` to a local JSONL file path to record tool call audit events:

```text
UVCS_AUDIT_LOG=/var/log/uvcs-mcp-audit.jsonl
```

Audit entries include timestamp, tool name, success status, duration, and error code when available. Tool arguments and confirmation tokens are not written to the audit log.
