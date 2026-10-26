# Changelog

## Unreleased

## 1.4.1 - 2026-10-26

Distribution release: UVCS MCP is published to the official MCP Registry as `io.github.ProAnima/uvcs-mcp`. The server and its tools are unchanged from 1.4.0.

### Added

- `server.json` for the MCP Registry: the npm package, stdio transport, the environment variables clients should ask for (`UVCS_WORKSPACE` required; `UVCS_MCP_MODE`, `UVCS_ALLOWED_WORKSPACES`, `UVCS_ALLOWED_REPOS`, `UVCS_CM_PATH` optional), and a 512px icon. `package.json` declares the matching `mcpName`.
- The `Publish` workflow publishes `server.json` to the MCP Registry through GitHub OIDC after the npm package is available, using a pinned `mcp-publisher` verified with Sigstore.
- `npm run release:check` and a test keep `server.json` consistent with `package.json`.

### Changed

- The npm job of the `Publish` workflow skips `npm publish` when the version is already on npm, so the workflow can be re-run for a failed registry step.

### Fixed

- `docs/configuration.md` still described `UVCS_CHECKIN_MAX_FILES` as limiting every pending change, and listed write timeouts without checkout and release checkout.

## 1.4.0 - 2026-10-26

Feature release: history, review, and merge preview tools; checkin of selected paths with Unity `.meta` pairing; exclusive checkout; and an agent skill for Claude Code, Codex, Cursor, OpenCode, and other SKILL.md agents. It also fixes `uvcs_diff_file`, which opened the GUI diff tool, and refuses merges that would stop with conflicts.

### Added

- `uvcs_changeset_diff`: items added, changed, moved, and deleted in a changeset, label, shelve, or branch, or between two changesets or labels, with counts and Unity `.meta` pairing warnings.
- `uvcs_revision_diff`: unified line diff of one file for a changeset (against its parent), between two revisions, or against the workspace copy, computed from `cm cat` because `cm` shows revision diffs only in its GUI.
- `uvcs_file_history` (`cm history`, newest first, multi-line comments kept) and `uvcs_annotate` (`cm annotate` with a line window and per-owner counts).
- `uvcs_branch_list` and `uvcs_label_list` with name, owner, date, parent, and branch filters. Branch and label names with spaces and parentheses are supported by the read-only tools.
- `uvcs_merge_preview`: what a merge would do and which items conflict, into the workspace or, with `destination`, into a branch on the server (`cm merge --to` without `--merge`).
- Path-scoped checkin: `uvcs_checkin_prepare` accepts `paths`. The `.meta` partner of every selected Unity asset is added (and an asset whose `.meta` is still private is refused with `UNITY_META_NOT_ADDED`), pending parent folders a change needs are listed and checked in with `--dependencies`, and the result reports what stays pending.
- `uvcs_checkout` (prepare/confirm) checks files out, which takes the exclusive lock when the server's `lock.conf` covers them; locked, private, added, and directory items are refused. `uvcs_release_checkout` releases checkouts of unchanged files with `cm undo --unchanged` and reports files that stay checked out because they were modified.
- `uvcs_locks` accepts `paths` and `scope` (`all`, `user`, `workspace`) and returns parsed `locks`.
- Agent skill `uvcs-version-control` (`skills/`) for Claude Code, Codex, Cursor, OpenCode, and other SKILL.md agents; `uvcs-mcp skill install` copies it into each agent's skills folder, and `npm run pack:skill` validates it and builds the marketplace ZIP.

### Changed

- `zod` 4.6.7 and transitive updates (`body-parser`, `fast-uri`, `ip-address`); `npm audit` reports zero known vulnerabilities.
- `uvcs_merge_prepare` runs the merge preview and refuses merges with conflicts (`MERGE_HAS_CONFLICTS`) or nothing to merge (`NOTHING_TO_MERGE`). Previously a conflicting merge ran with `--nointeractiveresolution`, reported success, and left the merge in progress, so every later checkin failed.
- Item paths containing `*` or `?` are rejected; `cm` expands wildcards itself, so a wildcard could widen add, undo, checkout, or checkin.

### Fixed

- Checkin confirmation tokens also bind the size and modification time of the pending files. Editing an already changed file again after prepare leaves its status row unchanged, so the edit was previously checked in without review.
- `uvcs_diff_file` no longer runs `cm diff <path>`, which opens the GUI diff tool and waits until it is closed: the tool hung until the read timeout and could open a window on the user's desktop. It now returns a unified diff of the loaded revision (`cm cat`) against the file on disk, with `status` and `movedFrom`, and accepts `context`. The result has a `diff` field instead of the raw `cm` `stdout`, and a file without a tracked pending change returns `NO_PENDING_CHANGE`.
- `uvcs_changeset_analytics` date filters are sent to `cm find` as ISO `yyyy-MM-dd`. The previous `yyyy/MM/dd` form was parsed by locale and rejected, for example `2026/09/30` on systems with `dd.MM.yyyy` dates.

## 1.3.0 - 2026-10-07

Hardening release: closes an option-injection gap in path-scoped writes, makes `cm` execution reliable on Windows and with Cyrillic paths, and makes setup safer and easier.

### Security

- Item paths, branch names, and labels that start with `-` are rejected. In 1.2.x a path such as `-r` reached `cm undo` as an option, so `uvcs_undo` could widen to a recursive undo of the workspace root in the `standard` and `guarded` profiles.
- Dependencies updated to `@modelcontextprotocol/sdk` 1.32.1 and `zod` 4.6.5; transitive advisories (`fast-uri`, `hono`, `ip-address`) resolved. `npm audit` reports zero known vulnerabilities. The ineffective `overrides` block was removed.

### Fixed

- `cm` output is decoded once from bytes. On Windows, non-UTF-8 output is decoded with the system OEM/ANSI code page, so Cyrillic and other non-ASCII paths and comments are no longer corrupted. `UVCS_CM_OUTPUT_ENCODING` can force a specific encoding.
- `cm` runs with a closed stdin, so interactive prompts fail fast instead of hanging until the timeout.
- Timeouts and output limits terminate the whole `cm` process tree and report only after it exits, so write locks are never released while `cm` is still running. Interrupted writes return `WRITE_INTERRUPTED_STATE_UNKNOWN`.
- Private and ignored items no longer count as pending changes: they do not block switch or merge, do not count toward `UVCS_CHECKIN_MAX_FILES`, and do not invalidate prepare/confirm fingerprints.
- The current branch is read from `cm wi`, including changeset-loaded workspaces; the branch safety report no longer reports the repository name as the branch.
- Repository identity for the guarded profile is detected from local workspace metadata (`cm wi`), so guarded workspaces start while the server is unreachable.
- Write locks refresh a heartbeat during long operations, reclaim locks left by dead processes immediately, and remove abandoned cleanup markers.
- Unity `.meta` diagnostics follow Unity import rules (hidden items, `Samples~`, `*.tmp`) and no longer flag `Packages/manifest.json`.
- A missing workspace directory reports `WORKSPACE_NOT_FOUND` instead of looking like a missing `cm`.

### Added

- MCP tool annotations (`readOnlyHint`, `destructiveHint`, `idempotentHint`) so clients can auto-approve reads and require approval for writes.
- Server instructions that describe the prepare → user approval → confirm workflow.
- Specific error codes with targeted hints for path, mode, allowlist, and confirmation-token failures.
- `uvcs_update_workspace_prepare` reports pending changes and warns before updating over them.
- `uvcs_checkin_prepare` refuses an empty checkin (`NOTHING_TO_CHECKIN`) and states that checkin covers all tracked pending changes.
- Integer schemas with bounds for numeric tool inputs; diff output is capped at 200,000 characters.
- Configuration warnings for unrecognised `UVCS_MCP_MODE` values and invalid numbers.
- `npm run smoke:pack` installs the packed tarball into a clean project and starts the installed server.

### Setup

- `init` writes project-scoped client files (`.mcp.json`, `.cursor/mcp.json`, `.kiro/settings/mcp.json`, `opencode.json`, `.agents/mcp_config.json`) into the workspace folder by default, or into `--project-dir`, and refuses to write them into the uvcs-mcp package folder.
- On Windows, clients confirmed to resolve the `npx.cmd` shim (Claude Code, Claude Desktop, Cursor, Codex 0.59+, Kiro, OpenCode) get plain `npx`; Antigravity and Windsurf / Devin Desktop get `cmd /c npx`.
- The absolute `cm` path is detected and written as `UVCS_CM_PATH`, so GUI clients that do not inherit the shell `PATH` (macOS) still find `cm`.
- Every target config is validated before anything is written; malformed or JSONC configs abort the run (or are skipped with `--skip-invalid` and a manual snippet).
- Backups are timestamped and never overwritten; unchanged files are not rewritten.
- `--print-config` / `--dry-run` show only the uvcs entries, never other servers' settings or tokens.
- Codex `config.toml` merging preserves array tables, quoted headers, comments, and user keys in the uvcs table, honours `CODEX_HOME`, and sets `startup_timeout_sec = 60` for the npm source.
- Flags are parsed strictly (`--key=value` and `--key value`); unknown flags and clients fail with a suggestion. `init --help` and `doctor --help` document every option.
- `doctor` reports a missing path or a folder that is not a UVCS workspace instead of blaming `cm`, and exits non-zero without a workspace unless `--allow-no-workspace` is passed.
- Antigravity uses `.agents/mcp_config.json` (project) and the new `antigravity-global` client (`~/.gemini/config/mcp_config.json`). The Zed template uses the current flat `context_servers` format.
- `init` prints an equivalent `claude mcp add --scope user` command for Claude Code.
- The server no longer switches into doctor mode when its install path happens to contain "doctor".

### Changed

- Node.js 22 or newer is required (Node.js 20 reached end of life in April 2026).
- Fleet manifests reject duplicate workspace paths, and process-wide `UVCS_*` settings no longer leak into every fleet workspace (only `UVCS_CM_PATH`, `UVCS_CM_ARGS`, and `UVCS_CM_OUTPUT_ENCODING` are shared).
- The npm package no longer ships the README header image (1.6 MB → under 100 kB).
- `UVCS_LOCALE` was removed; it was never used.
- CI covers Ubuntu, Windows, and macOS on Node.js 22, 24, and 26. Release checks fail on any stale version pin in user-facing docs, and the publish workflow verifies that the tag matches the package version.

## 1.2.1 - 2026-07-24

Patch release for reliable guarded fleet operation on real Plastic SCM workspaces.

### Fixed

- Guarded repository identity parsing now removes both clean-workspace and pending-change Plastic status suffixes, preventing false allowlist denials for valid workspaces with local changes.
- JSONL audit logging now creates missing parent directories automatically, so fleet manifests can use separate audit log paths without manual directory setup.
- Cursor MCP configuration directories are excluded from source control to keep machine-specific fleet settings local.

### Validated

- 70 automated tests, lint, and syntax validation.
- Live guarded fleet doctor across four Plastic SCM workspaces.
- Live MCP prepare/confirm branch creation in four independently pinned repositories.

## 1.2.0 - 2026-07-23

Production multi-workspace release focused on safe fleet automation, reliable setup, and operational hardening.

### Added

- Fleet manifests configure one MCP server for up to 50 explicitly selected named workspaces.
- Optional `--fleet-layout=isolated` configuration keeps one MCP process per workspace.
- One-process two-workspace MCP smoke coverage for coordinated fleet workflows.
- `uvcs_undo_prepare` / `uvcs_undo_confirm` safely expose path-scoped UVCS undo while forbidding whole-workspace undo.
- `readonly`, `guarded`, and `standard` safety profiles.
- `uvcs_policy_status` and `uvcs_setup_status` for effective policy, identity, and naming readiness.
- Cross-process workspace write locking.
- Separate read/write timeouts and bounded `cm` process output.
- Fleet-aware `uvcs-mcp doctor --manifest=...` preflight checks.

### Changed

- Switch, merge, update, and checkin confirmation now revalidate workspace state after prepare.
- Workspace path checks use real filesystem canonicalization and platform-correct case handling.
- `uvcs_doctor` now respects workspace and repository allowlists.
- npm initialization defaults to the npm install source; `init-local` remains explicit.
- Runtime dependencies are pinned to audited versions with patched transitive overrides.
- Confirmation tokens are bound to the workspace that prepared them.
- Client initialization warns about paths that are not recognized as UVCS workspaces and prints clear safety/naming next steps.
- Codex TOML setup replaces existing MCP server descendant tables without leaving duplicate environment blocks.
- Guarded setup can derive real repository/server identity from a read-only Plastic status header when `plastic.workspace` contains only a workspace name and GUID.

### Security

- Production dependency audit is now part of CI and the publish gate.
- Current production dependency audit reports zero known vulnerabilities.

### Tested

- 70 automated tests.
- Full lint and syntax validation.
- Dependency and production dependency audits with zero known vulnerabilities.
- Single-workspace MCP smoke workflow.
- Parallel two-workspace fleet smoke with independent naming rules and branches.
- Read-only live validation on Plastic SCM `10.0.16.6656`.
- npm package dry run.

## 1.1.0 - 2026-07-02

Style-policy release focused on shared automation rules and project release branch naming.

### Added

- `.uvcs-mcp/style.json` can extend a central `.uvcs-mcp/style.json` policy through a relative `extends` path.
- `uvcs_release_plan` accepts explicit `releaseVersion` values.
- Release style patterns can use `{releaseVersion}` and `{projectName}`.
- Branch create validation now allows safe release branch paths with a version and project-name segment.

### Changed

- `uvcs_release_plan` no longer requires `releaseType` when `releaseVersion` is provided.
- Automation style documentation now covers shared policy files and project-name release branch patterns.

### Tested

- `npm test`: 49 tests passing.
- `npm run lint`.
- `npm run check`.
- `npm run release:check`.
- `npm run smoke:fake`.
- `npm pack --dry-run`.

## 1.0.0 - 2026-06-26

First production release line. This release keeps the safe MCP surface from `0.3.0`, adds static analysis and publish automation, and formalizes the 1.x support and security posture.

### Added

- ESLint static analysis with `npm run lint`.
- Release metadata validation with `npm run release:check`.
- GitHub Actions npm publish workflow using trusted publishing/OIDC and provenance.
- Security review notes covering path confinement, confirm-token replay, environment handling, command construction, and destructive-operation policy.
- 1.x production readiness documentation and npm publishing runbook.

### Changed

- CI now runs tests, lint, syntax checks, release metadata checks, fake MCP smoke, and npm pack dry-run across Ubuntu and Windows on Node.js 20, 22, and 24.
- The project is now documented as the stable `1.0.x` release line.

### Tested

- `npm test`: 43 tests passing.
- `npm run lint`.
- `npm run check`.
- `npm run release:check`.
- `npm run smoke:fake`.
- `npm pack --dry-run`.

## 0.3.0 - 2026-06-26

Production-hardening release focused on official MCP protocol handling, CI reliability, guided project conventions, and safer branch review workflows.

### Added

- Official MCP TypeScript SDK transport and lifecycle handling.
- Strict server-side tool input validation with Zod schemas.
- Optional JSONL audit logging through `UVCS_AUDIT_LOG`.
- Per-workspace serialization for confirm/write operations.
- CI-safe fake `cm` MCP smoke test covering the full prepare/confirm workflow.
- GitHub Actions matrix across Ubuntu and Windows on Node.js 20, 22, and 24.
- Guided style setup tools:
  - `uvcs_style_setup_check`
  - `uvcs_style_init_prepare`
  - `uvcs_style_init_confirm`
- Read-only branch safety helpers:
  - `uvcs_cleanup_candidates`
  - `uvcs_branch_safety_report`
- `UVCS_CM_ARGS` for safe wrapper-style command prefixes in tests and controlled environments.

### Changed

- Replaced the hand-written MCP JSON-RPC server layer with the official SDK.
- Updated MCP tests to use the full initialize/initialized lifecycle.
- Expanded test coverage for schema validation, audit logging, write serialization, style setup, cleanup candidates, and branch safety reports.
- Documented the safer cleanup policy: agents get read-only review helpers, not branch or changeset deletion tools.

### Tested

- `npm test`: 43 tests passing.
- `npm run check`.
- `npm run smoke:fake`.
- `npm pack --dry-run`.

## 0.2.0 - 2026-05-22

First stable `0.2.x` release. No functional changes from `0.2.0-alpha.1`; compatibility documentation and version metadata were updated after live validation.

### Changed

- Documented supported `cm` range as `10.0.16.6656` and newer.
- Marked Unity Version Control / Unity DevOps Version Control `11.x` as tested pass in the compatibility matrix.
- Promoted release line from `0.2.x-alpha` to stable `0.2.x`.

### Tested

- Plastic SCM `10.0.16.6656` and newer `10.x` builds.
- Unity Version Control / Unity DevOps Version Control `11.x` across multiple client versions.

## 0.2.0-alpha.1 - 2026-05-17

Second alpha release focused on automation style, changeset analytics, and stronger policy enforcement.

### Added

- Style tools for branch names, checkin messages, and release planning from `.uvcs-mcp/style.json`.
- Changeset analytics tool for date, branch, owner, and comment review windows.
- Repository allowlist enforcement through `UVCS_ALLOWED_REPOS`.
- Production readiness checklist and release criteria documentation.
- Wiki source pages for quick start, client setup, safety, automation style, analytics, and troubleshooting.

### Changed

- `uvcs_update_workspace` now uses `uvcs_update_workspace_prepare` / `uvcs_update_workspace_confirm`.
- Confirm steps now re-check workspace and repository policy.
- Removed unused `UVCS_ENABLE_TIER2` config parsing.
- Updated package, MCP server, and issue template versions to `0.2.0-alpha.1`.

## 0.1.0-alpha.1 - 2026-05-17

Initial alpha release.

### Added

- MCP stdio server for Plastic SCM / Unity Version Control `cm`.
- Read tools for doctor, workspace status, pending changes, branch info, locks, file diff, and Unity `.meta` diagnostics.
- Prepare/confirm write tools for add, branch create, label create, workspace switch, merge, and checkin.
- Standard-mode workspace update tool.
- Local git checkout installer via `uvcs-mcp init-local`.
- Client config generation for Cursor, Codex, Claude Desktop, Claude Code, OpenCode, Antigravity, Kiro, and Windsurf.
- Cross-platform client config paths for Windows, macOS, and Linux.
- Plastic SCM end-to-end smoke script.
- Built-in Node test suite and syntax checks.

### Tested

- Plastic SCM `10.0.16.6656` on a self-hosted server.
- Full MCP E2E flow: branch create, switch, add, checkin, label create, branch from label, merge, merge checkin, switch back to `/main`.
