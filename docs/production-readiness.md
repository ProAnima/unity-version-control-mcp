# Production Readiness

UVCS MCP `1.2.0` is production-ready for constrained source-control automation in fixed Plastic SCM / Unity Version Control workspaces.

Production-ready means the MCP server provides a bounded command surface, explicit workspace identity, fail-closed write controls, repeatable setup, release-gated dependencies, and tested single- and multi-workspace workflows. It does not make unrelated repositories atomic and does not replace repository backups, branch protection, or human release ownership.

## Supported deployment modes

### One workspace

Use one fixed `UVCS_WORKSPACE`. The initializer pins `UVCS_ALLOWED_WORKSPACES` to that exact path. The recommended production profile is `guarded`, which also pins the detected `repository@server` identity.

### Fleet

Use one manifest-driven MCP process for up to 50 named workspaces. Every tool call requires an explicit `workspace` selector. Backends, policies, audit logs, confirmation contexts, and write locks remain independent.

Use `--fleet-layout=isolated` when process-level isolation is preferred over a single fleet process.

## Safety guarantees

- Default profile is `readonly`.
- Every command comes from a fixed argv allowlist and runs with `shell: false`.
- MCP arguments are validated with strict schemas.
- Generated client configuration pins the workspace path.
- `guarded` pins both workspace and repository/server identity.
- Critical writes require short-lived, single-use prepare/confirm tokens.
- Tokens are action-scoped and workspace-bound.
- Switch, merge, update, undo, and checkin revalidate relevant workspace state before execution.
- Writes are serialized in-process and across MCP processes.
- Paths are canonicalized and confined to the selected workspace.
- Whole-workspace undo, branch deletion, changeset deletion, repository deletion, repository rename, arbitrary `cm`, and arbitrary shell execution are not exposed.
- Read/write timeouts and a combined process-output limit are enforced.
- Audit logs omit tool arguments and confirmation tokens.

## Operational preflight

For one workspace:

```bash
npx -y @proanima/uvcs-mcp@1.2.0 doctor --workspace="D:/Repositories/YourWorkspace"
```

For a fleet:

```bash
npx -y @proanima/uvcs-mcp@1.2.0 doctor --manifest=workspaces.json
```

After the MCP client restarts, call `uvcs_setup_status` for every target. Confirm the workspace path, repository identity, safety profile, write limits, audit destination, and naming/release rules before edits.

## Recommended production policy

- Use `readonly` for investigation, reporting, and unfamiliar repositories.
- Use `guarded` for normal agent-assisted writes.
- Use `standard` only in trusted or disposable workspaces.
- Configure a per-workspace JSONL audit path for shared or release-manager checkouts.
- Keep checkins small and preserve the default 20-file guard unless the repository has a reviewed reason to raise it.
- Prepare every target in a mass operation before confirming any target.
- Stop on the first failure and report completed, failed, and untouched workspaces.
- Keep `.uvcs-mcp/style.json` under review so branch, checkin, label, and release naming remains deterministic.

## Validation evidence for 1.2.0

- 70 automated tests.
- ESLint and Node syntax validation.
- Dependency and production dependency audits with zero known vulnerabilities.
- Release metadata and npm package dry-run checks.
- Full single-workspace fake MCP workflow covering branch, switch, add, checkin, label, merge, and final status.
- Parallel two-workspace fleet smoke covering explicit routing, independent style rules, branch previews, state, locks, and mutations.
- Read-only live validation on Plastic SCM `10.0.16.6656`, including guarded repository/server detection.
- Compatibility retained for Unity Version Control / Unity DevOps Version Control `11.x`.

## Known boundaries

- Cross-repository operations are not atomic.
- A confirmed `cm` process interrupted by the operating system or network can leave normal UVCS pending state; inspect status before retrying.
- `cm` authentication, server availability, DNS, permissions, and repository-side policies remain external dependencies.
- Real-server destructive tests are intentionally not part of public CI.
- Unity Editor automation, server administration, and long-running `cm api` hosting are outside scope.

## Release acceptance checklist

- Version markers agree across package metadata, server metadata, README, wiki, lockfile, and changelog.
- CI and the local release gate pass.
- `npm audit` and `npm audit --omit=dev` report zero known vulnerabilities.
- Single and fleet smoke tests pass.
- The release commit is on `main`.
- Tag `v1.2.0` points to the release commit.
- The GitHub Release uses the reviewed release notes.
- The npm trusted-publishing workflow completes successfully with provenance.
