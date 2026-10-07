# Production Readiness

UVCS MCP `1.3.0` is production-ready for constrained source-control automation in fixed Plastic SCM / Unity Version Control workspaces.

Production-ready means the MCP server provides a bounded command surface, explicit workspace identity, fail-closed write controls, repeatable setup, release-gated dependencies, and tested single- and multi-workspace workflows. It does not make unrelated repositories atomic and does not replace repository backups, branch protection, or human release ownership.

## Supported deployment modes

### One workspace

Use one fixed `UVCS_WORKSPACE`. The initializer pins `UVCS_ALLOWED_WORKSPACES` to that exact path. The recommended production profile is `guarded`, which also pins the detected `repository@server` identity.

### Fleet

Use one manifest-driven MCP process for up to 50 named workspaces. Every tool call requires an explicit `workspace` selector. Backends, policies, audit logs, confirmation contexts, and write locks remain independent, and process-wide `UVCS_*` settings other than the `cm` path, arguments, and output encoding do not apply to manifest workspaces.

Use `--fleet-layout=isolated` when process-level isolation is preferred over a single fleet process.

All settings are listed in [Configuration](configuration.md).

## Runtime requirements

- Node.js 22 or newer. Node.js 20 reached end of life in April 2026 and is no longer supported.
- Plastic SCM / Unity Version Control `cm` `10.0.16.6656` or newer, including Unity Version Control `11.x`. See [Compatibility](compatibility.md).

## Safety guarantees

- Default profile is `readonly`; an unrecognized `UVCS_MCP_MODE` also means `readonly` and produces a warning.
- Every command comes from a fixed argv allowlist and runs with `shell: false` and a closed stdin, so interactive prompts fail instead of hanging.
- MCP arguments are validated with strict schemas; numeric inputs are bounded integers.
- Item paths are canonicalized and confined to the selected workspace. Paths, branch names, and label names that `cm` would parse as options (leading `-`) are rejected.
- Generated client configuration pins the workspace path and the absolute `cm` path. Setup validates every target config before writing anything, never touches other servers' entries, and keeps timestamped backups.
- `guarded` pins both workspace and repository/server identity.
- Every write requires a short-lived, single-use prepare/confirm token. Tokens are action-scoped and workspace-bound, and expired tokens are pruned.
- Tools carry MCP annotations: read and prepare tools are read-only; undo, update, switch, and merge confirms are destructive. The server sends instructions that require explicit user approval before every confirm.
- Switch, merge, update, undo, and checkin revalidate relevant workspace state before execution.
- Checkin includes all tracked pending changes, bounded by `UVCS_CHECKIN_MAX_FILES`; private and ignored files are excluded from the count and do not block switch or merge.
- Writes are serialized in-process and across MCP processes; the lock file has a heartbeat, and locks of dead processes are reclaimed.
- Whole-workspace undo, branch deletion, changeset deletion, repository deletion, repository rename, arbitrary `cm`, and arbitrary shell execution are not exposed.
- Read/write timeouts and a combined process-output limit are enforced. On a limit the process is terminated (the whole process tree on Windows) before the error is reported, and interrupted writes return `WRITE_INTERRUPTED_STATE_UNKNOWN`.
- Error results use specific codes with remediation hints, and truncate `cm` output.
- Audit logs omit tool arguments and confirmation tokens.

## Operational preflight

For one workspace:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 doctor --workspace="D:/Repositories/YourWorkspace"
```

For a fleet:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 doctor --manifest=workspaces.json
```

After the MCP client restarts, call `uvcs_setup_status` for every target. Confirm the workspace path, repository identity, safety profile, write limits, audit destination, configuration warnings, and naming/release rules before edits.

## Recommended production policy

- Use `readonly` for investigation, reporting, and unfamiliar repositories.
- Use `guarded` for normal agent-assisted writes.
- Use `standard` only in trusted or disposable workspaces.
- Let the MCP client auto-approve only read-only tools; keep human approval for every `*_confirm` tool.
- Configure a per-workspace JSONL audit path for shared or release-manager checkouts.
- Keep checkins small and preserve the default 20-file guard unless the repository has a reviewed reason to raise it.
- Prepare every target in a mass operation before confirming any target.
- Stop on the first failure and report completed, failed, and untouched workspaces.
- Keep `.uvcs-mcp/style.json` under review so branch, checkin, label, and release naming remains deterministic.

## Validation evidence for 1.3.0

- 135 automated tests (`npm test`) at the time of writing, one of them POSIX-only and skipped on Windows; the count changes as tests are added.
- ESLint and a syntax check of every JavaScript file in `src/` and `scripts/` (`npm run check`).
- `npm audit` and `npm audit --omit=dev` report 0 vulnerabilities.
- Release metadata check, including a check for stale `@proanima/uvcs-mcp@<version>` pins in README, docs, wiki, and templates.
- Packed-tarball smoke test (`npm run smoke:pack`): the package is installed into a clean project and the installed server lists its tools.
- Single-workspace fake MCP workflow covering branch, switch, add, checkin, label, merge, and final status, against a stateful fake `cm` that reports real pending changes and fails empty checkins.
- Parallel two-workspace fleet smoke covering explicit routing, independent style rules, branch previews, state, locks, and mutations.
- CI on Ubuntu, Windows, and macOS with Node.js 22, 24, and 26.
- Earlier live validation on Plastic SCM `10.0.16.6656` and Unity Version Control `11.x` workspaces; see [Compatibility](compatibility.md).

## Known boundaries

- Checkin always includes all tracked pending changes in the workspace. Selecting individual files for a checkin is not supported; keep unrelated work out of the workspace or check it in separately in the UVCS client.
- There are no checkout or lock tools. `uvcs_locks` lists locks but cannot acquire or release them, so exclusive-checkout workflows for binary assets need the UVCS client.
- Merge has no preview. `uvcs_merge` merges directly into the workspace with `--nointeractiveresolution`; the result stays pending until a checkin, and conflicts must be resolved in the UVCS client.
- Gluon / partial workspaces are not supported. The server uses full-workspace commands (`cm update`, `cm switch`, `cm checkin`).
- Cross-repository operations are not atomic.
- A `cm` process interrupted by a timeout, the output limit, the operating system, or the network can leave the workspace in an intermediate state. The server reports `WRITE_INTERRUPTED_STATE_UNKNOWN` for timeouts and output limits; inspect status before doing anything else.
- `cm` authentication, server availability, DNS, permissions, and repository-side policies remain external dependencies.
- Real-server destructive tests are intentionally not part of public CI.
- Unity Editor automation, server administration, and long-running `cm api` hosting are outside scope.

## Release acceptance checklist

- Version markers agree across package metadata, server metadata, setup command, README, wiki, lockfile, and changelog, and no user-facing document pins an older package version.
- CI and the local release gate pass.
- `npm audit` and `npm audit --omit=dev` report zero known vulnerabilities.
- Single, fleet, and packed-tarball smoke tests pass.
- The release commit is on `main`.
- Tag `v1.3.0` points to the release commit and matches the package version (the publish workflow refuses a mismatch).
- The GitHub Release uses the reviewed release notes.
- The npm trusted-publishing workflow completes successfully with provenance.
