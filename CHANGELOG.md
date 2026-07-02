# Changelog

## 1.1.0 - 2026-07-02

Style-policy release focused on shared automation rules and project release branch naming.

### Added

- `.uvcs-mcp/style.json` can extend a central JSON style policy through `extends`.
- `uvcs_release_plan` accepts explicit `releaseVersion` values such as `2.1`.
- Release style patterns can use `{releaseVersion}` and `{projectName}`.
- Branch create validation now allows safe release branch paths with a project name segment, such as `/2.1 hp-kidalki`.

### Changed

- `uvcs_release_plan` no longer requires `releaseType` when `releaseVersion` is provided.
- Automation style documentation now covers shared policy files and project-name release branch patterns.

### Tested

- `npm test`: 48 tests passing.
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

- Plastic SCM `10.0.16.6656` on `pas-Kodeks@SRV-IAN-N:8087`.
- Full MCP E2E flow: branch create, switch, add, checkin, label create, branch from label, merge, merge checkin, switch back to `/main`.
