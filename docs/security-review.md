# Security Review

This review records the security posture for the `1.x` release line, updated for `1.3.0`. The operational model is described in [Security Model](security.md).

## Findings fixed in 1.3.0

### Option injection through item paths (fixed)

- **Affected:** `1.2.x` and earlier. `uvcs_undo` and `uvcs_add` in write-enabled workspaces (`UVCS_MCP_MODE=standard`, which both the `guarded` and `standard` profiles use); `uvcs_diff_file` in every mode.
- **Issue:** item paths were checked only for escaping the workspace. A relative path starting with `-` stayed inside the workspace, was passed to `cm` unchanged, and `cm` parsed it as an option. For example, `uvcs_undo_prepare` with `itemPath: "-r"` produced `cm undo -r`, a recursive undo from the workspace root. This bypassed the rule that whole-workspace undo is forbidden.
- **Mitigating factors in 1.2.x:** the `readonly` default; the prepare/confirm flow with an exact confirm phrase; and a prepare payload that showed `itemPath: "-r"`, although a reviewer could easily miss what that meant.
- **Fix:** a path whose workspace-relative form starts with `-` is rejected with `INVALID_PATH`, as are paths containing NUL, CR, or LF. Escapes through `..` are reported as `PATH_OUTSIDE_WORKSPACE`, and names that only begin with dots, such as `..foo`, are no longer falsely rejected.

### Option-like branch and label names (fixed)

- **Affected:** `1.2.x` and earlier, write-enabled workspaces.
- **Issue:** branch paths and label names could start with `-`, so `cm branch create` or `cm label create` could receive an option instead of a name.
- **Fix:** branch path segments and label names (including `lb:` specs) cannot start with `-` (`INVALID_BRANCH_SPEC`, `INVALID_LABEL_NAME`, `INVALID_LABEL_SPEC`).

### Interrupted processes outliving the write lock (fixed)

- **Affected:** `1.2.x` and earlier.
- **Issue:** on a timeout or output overflow the error was returned immediately, before `cm` had exited, and only the direct child was signalled. A `cm` process that did not exit at once, or on Windows a process it had started, could keep running after the confirm step had released its write lock. An interrupted write was reported as `PROCESS_TIMEOUT`, like a read. stdin stayed open, so an interactive `cm` prompt waited for the full timeout while holding the lock.
- **Fix:** stdin is closed; on Windows the whole process tree is terminated with `taskkill /T /F` (macOS and Linux: `SIGTERM`, then `SIGKILL` to the `cm` process); the error is reported only after the process has exited or a 10-second grace period has passed; interrupted mutating commands return `WRITE_INTERRUPTED_STATE_UNKNOWN`.

### Stale write locks (fixed)

- **Affected:** `1.2.x` and earlier.
- **Issue:** a lock left by a crashed process blocked writes to that workspace for 15 minutes, and a running write had no heartbeat.
- **Fix:** the lock is refreshed every 15 seconds while a write runs and becomes stale after 2 minutes without a refresh; a same-host lock whose owner process is gone is reclaimed immediately; an abandoned `.cleanup` marker older than 30 seconds is removed.

### Process-wide settings leaking into fleet workspaces (fixed)

- **Affected:** `1.2.x` fleet mode.
- **Issue:** `UVCS_*` variables in the server's own environment, such as `UVCS_ALLOWED_REPOS`, `UVCS_CHECKIN_MAX_FILES`, or `UVCS_AUDIT_LOG`, applied to every manifest workspace that did not set its own value. Duplicate workspace paths were accepted.
- **Fix:** only `UVCS_CM_PATH`, `UVCS_CM_ARGS`, and `UVCS_CM_OUTPUT_ENCODING` are shared; every other per-workspace setting comes from the manifest. Duplicate paths are rejected.

### Silent configuration fallbacks (fixed)

- **Affected:** `1.2.x` and earlier.
- **Issue:** an unrecognized `UVCS_MCP_MODE` silently became `readonly` (fail-closed, but invisible), and numeric settings were parsed leniently (`15abc` became `15`).
- **Fix:** the mode must be exactly `readonly` or `standard`; anything else still falls back to `readonly` but produces a warning on stderr and in `uvcs_policy_status` / `uvcs_setup_status`. Numeric settings must be positive integers; invalid values produce a warning and the default is used.

## Path confinement

- Workspace-relative file tools resolve paths against `UVCS_WORKSPACE`.
- Paths that escape the workspace are rejected with `PATH_OUTSIDE_WORKSPACE`.
- Workspace paths are canonicalized through the filesystem, including symlink and junction targets, with platform-correct case handling.
- Paths that would be parsed as `cm` options (leading `-`) or contain control characters are rejected with `INVALID_PATH`.
- Style configuration paths such as `versionFile` must be relative and cannot include `..`.
- `uvcs_branch_safety_report` and `uvcs_cleanup_candidates` reject branch path segments such as `.` and `..`.

## Command construction

- The server exposes a fixed allowlist of `cm` commands.
- Commands are built as argv arrays and executed with `shell: false` and a closed stdin.
- Arguments reject null bytes and line separators before process execution.
- Branch names, label names, and item paths cannot start with `-`.
- `UVCS_CM_ARGS` exists for controlled wrapper/test scenarios and still flows through argv construction.

## Write safety

- Default mode is `readonly`; an unrecognized mode value also means `readonly`.
- Mutating tools require `UVCS_MCP_MODE=standard`.
- Every write uses prepare/confirm with short-lived, single-use, action-bound tokens. Expired tokens are pruned.
- MCP tool annotations mark read and prepare tools as read-only and undo, update, switch, and merge confirms as destructive. Clients should keep human approval for every `*_confirm` tool.
- Confirm steps are serialized per workspace, in-process and through an on-disk lock with a heartbeat.
- Fleet calls require an explicit workspace selector, and confirmation tokens are workspace-bound.
- Switch, merge, update, undo, and checkin revalidate workspace state after prepare.
- Checkin always includes all tracked pending changes in the workspace; `UVCS_CHECKIN_MAX_FILES` bounds that set. Private and ignored items are excluded from the count and from the state fingerprint.
- Undo is limited to a specific relative path; whole-workspace undo is not exposed.
- Read and write commands have separate timeouts and bounded output. Interrupted writes are reported as `WRITE_INTERRUPTED_STATE_UNKNOWN`.
- Repository deletion, repository rename, arbitrary shell execution, arbitrary `cm`, branch deletion, and changeset deletion are not exposed.

## Token replay

- Confirm tokens are random, short-lived, action-scoped, workspace-bound, and removed on first consume.
- Tokens live in process memory only.
- Confirmation phrases are exact-match strings returned by prepare tools.

## Environment and audit

- Workspace and repository allowlists can restrict where the server operates.
- `uvcs_doctor`, setup, read, and write tools all enforce configured allowlists.
- `UVCS_AUDIT_LOG` records tool name, status, duration, timestamp, and error code when available.
- Audit entries intentionally avoid tool arguments and confirmation tokens.
- Error results truncate `cm` output, and `uvcs_diff_file` output is capped at 200,000 characters.

## Dependency posture

- Runtime dependencies are pinned to exact versions: `@modelcontextprotocol/sdk` `1.32.1` and `zod` `4.6.5`. No transitive overrides are needed.
- At the `1.3.0` release, `npm audit` and `npm audit --omit=dev` report 0 vulnerabilities.
- `npm run audit:prod` runs in CI and before publishing.
- UVCS MCP is stdio-only. The MCP SDK's HTTP server dependencies are installed but not used; any future HTTP transport work requires a separate review.
- The npm package ships only runtime code, scripts, templates, and documentation; `npm run smoke:pack` installs the packed tarball into a clean project and starts the installed server before every release.

## Remaining operational controls

- Use `readonly` mode for normal team workspaces.
- Use `guarded` for agent-assisted writes, and `standard` only in trusted release-manager or disposable/dev checkouts.
- Configure `UVCS_ALLOWED_WORKSPACES` and `UVCS_ALLOWED_REPOS` for shared environments.
- Auto-approve only read-only tools in MCP clients; keep human approval for `*_confirm` tools.
- Use `uvcs_cleanup_candidates` and `uvcs_branch_safety_report` for manual cleanup review rather than exposing delete operations to agents.
