# Production Readiness

UVCS MCP is currently a stable `0.3.x` release line. The architecture is intentionally conservative, but broader production trust still requires evidence across teams, operating systems, and deployment topologies beyond the versions already validated in the field.

## Current status

Already in place:

- official MCP TypeScript SDK for protocol lifecycle and stdio transport;
- strict server-side tool input validation;
- fixed allowlist of `cm` commands;
- default `readonly` mode;
- prepare/confirm for mutating workspace and repository operations;
- per-workspace serialization for write confirmations;
- workspace path confinement;
- workspace and repository allowlists;
- optional JSONL audit logging with `UVCS_AUDIT_LOG`;
- fake `cm` MCP smoke test for CI without Plastic SCM credentials;
- read-only cleanup and branch safety helpers instead of destructive delete tools;
- unit tests, syntax checks, and CI on Node.js 20, 22, and 24;
- one full Plastic SCM E2E smoke pass on `pas-Kodeks@SRV-IAN-N:8087`;
- live validation on Plastic SCM `10.0.16.6656+` and Unity Version Control / Unity DevOps Version Control `11.x`;
- public install, security, compatibility, troubleshooting, support, and contribution docs.

## Beta criteria

Before calling the project beta:

- test Plastic SCM 10.x on Windows;
- test Unity Version Control / Unity DevOps Version Control 11.x; done for current `0.3.0` validation set;
- test at least one cloud workspace and one on-premises or local server workspace;
- keep the fake `cm` smoke test in CI for server/tool flows without requiring credentials;
- document command fallbacks, especially `status --includeRevId`;
- keep `UVCS_ALLOWED_REPOS` and `UVCS_ALLOWED_WORKSPACES` behavior covered by tests;
- keep all mutating tools behind prepare/confirm.

## 1.0 criteria

Before calling the project production-ready:

- publish a stable `1.0.0` npm release;
- define supported Node.js and `cm` version ranges for 1.x;
- keep breaking changes for major versions only;
- maintain a compatibility matrix with at least three tested configurations;
- run a real smoke test against a disposable workspace before releases;
- document a recommended runbook for team workspaces;
- collect field feedback from real Cursor, Codex, Claude, OpenCode, Kiro, or Windsurf users;
- complete a security review focused on path escape, token replay, env injection, and command construction.

## Recommended team runbook

- Use `readonly` mode by default in important workspaces.
- Use `standard` mode only in a disposable workspace, dev workspace, or release-manager checkout.
- Run `uvcs_doctor` after installing the MCP server or updating the Plastic SCM / Unity Version Control client.
- Run `npm run smoke:fake` before opening release pull requests.
- Set `UVCS_ALLOWED_WORKSPACES` for fixed team checkouts.
- Set `UVCS_ALLOWED_REPOS` when the workspace should never point to another repository/server.
- Set `UVCS_AUDIT_LOG` for release-manager or shared-agent checkouts.
- Require explicit user approval before any `*_confirm` tool call.
- Use `uvcs_cleanup_candidates` and `uvcs_branch_safety_report` for manual cleanup review instead of exposing branch or changeset deletion to agents.

## Not in scope for 1.0

- Unity Editor automation;
- server administration;
- repository deletion or rename;
- arbitrary shell execution;
- arbitrary `cm` execution;
- long-running `cm api` management.
