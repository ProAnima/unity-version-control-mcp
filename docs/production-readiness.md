# Production Readiness

UVCS MCP is currently an alpha release. The current release line is `0.2.x-alpha`. The architecture is intentionally conservative, but production trust requires evidence across teams, versions, operating systems, and real Plastic SCM / Unity Version Control deployments.

## Current status

Already in place:

- fixed allowlist of `cm` commands;
- default `readonly` mode;
- prepare/confirm for mutating workspace and repository operations;
- workspace path confinement;
- workspace and repository allowlists;
- unit tests, syntax checks, and CI on Node.js 20, 22, and 24;
- one full Plastic SCM E2E smoke pass on `pas-Kodeks@SRV-IAN-N:8087`;
- public install, security, compatibility, troubleshooting, support, and contribution docs.

## Beta criteria

Before calling the project beta:

- test Plastic SCM 10.x on Windows;
- test Unity Version Control / Unity DevOps Version Control 11.x;
- test at least one cloud workspace and one on-premises or local server workspace;
- add a fake `cm` smoke test in CI for server/tool flows without requiring credentials;
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
- Set `UVCS_ALLOWED_WORKSPACES` for fixed team checkouts.
- Set `UVCS_ALLOWED_REPOS` when the workspace should never point to another repository/server.
- Require explicit user approval before any `*_confirm` tool call.

## Not in scope for 1.0

- Unity Editor automation;
- server administration;
- repository deletion or rename;
- arbitrary shell execution;
- arbitrary `cm` execution;
- long-running `cm api` management.
