# Security Review

This review records the security posture for the `1.x` release line.

## Path confinement

- Workspace-relative file tools resolve paths against `UVCS_WORKSPACE`.
- Paths that escape the workspace are rejected.
- Workspace paths are canonicalized through the filesystem, including symlink and junction targets, with platform-correct case handling.
- Style configuration paths such as `versionFile` must be relative and cannot include `..`.
- Branch and cleanup helper inputs reject unsafe branch path segments such as `.` and `..`.

## Command construction

- The server exposes a fixed allowlist of `cm` commands.
- Commands are built as argv arrays and executed with `shell: false`.
- Arguments reject null bytes and line separators before process execution.
- `UVCS_CM_ARGS` exists for controlled wrapper/test scenarios and still flows through argv construction.

## Write safety

- Default mode is `readonly`.
- Mutating tools require `UVCS_MCP_MODE=standard`.
- Critical writes use prepare/confirm with short-lived single-use tokens.
- Confirm steps are serialized per workspace.
- Fleet calls require an explicit workspace selector, and confirmation tokens are workspace-bound.
- Confirm steps use an on-disk workspace lock to coordinate multiple MCP processes.
- Switch, merge, update, undo, and checkin revalidate workspace state after prepare.
- Undo is limited to a specific relative path; whole-workspace undo is not exposed.
- Read and write commands have separate timeouts and bounded output.
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

## Dependency posture

- Runtime dependency versions are pinned for reproducible releases.
- `@hono/node-server` and `fast-uri` use patched transitive overrides while UVCS MCP remains stdio-only.
- `npm run audit:prod` runs in CI and before publishing.
- Any future HTTP transport work must remove or revalidate the Hono override against the MCP SDK before release.

## Remaining operational controls

- Use `readonly` mode for normal team workspaces.
- Use `standard` mode only in trusted release-manager or disposable/dev checkouts.
- Configure `UVCS_ALLOWED_WORKSPACES` and `UVCS_ALLOWED_REPOS` for shared environments.
- Use `uvcs_cleanup_candidates` and `uvcs_branch_safety_report` for manual cleanup review rather than exposing delete operations to agents.
