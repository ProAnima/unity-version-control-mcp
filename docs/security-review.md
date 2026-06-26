# Security Review

This review records the security posture for the `1.0.x` release line.

## Path confinement

- Workspace-relative file tools resolve paths against `UVCS_WORKSPACE`.
- Paths that escape the workspace are rejected.
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
- Repository deletion, repository rename, arbitrary shell execution, arbitrary `cm`, branch deletion, and changeset deletion are not exposed.

## Token replay

- Confirm tokens are random, short-lived, action-scoped, and removed on first consume.
- Tokens live in process memory only.
- Confirmation phrases are exact-match strings returned by prepare tools.

## Environment and audit

- Workspace and repository allowlists can restrict where the server operates.
- `UVCS_AUDIT_LOG` records tool name, status, duration, timestamp, and error code when available.
- Audit entries intentionally avoid tool arguments and confirmation tokens.

## Remaining operational controls

- Use `readonly` mode for normal team workspaces.
- Use `standard` mode only in trusted release-manager or disposable/dev checkouts.
- Configure `UVCS_ALLOWED_WORKSPACES` and `UVCS_ALLOWED_REPOS` for shared environments.
- Use `uvcs_cleanup_candidates` and `uvcs_branch_safety_report` for manual cleanup review rather than exposing delete operations to agents.
