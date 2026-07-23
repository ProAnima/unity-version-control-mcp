# Production Readiness

UVCS MCP is currently on the stable `1.x` release line. The architecture is intentionally conservative, and production trust is maintained through CI, fake MCP smoke coverage, strict tool policies, security review notes, and compatibility reports.

## Current status

Already in place:

- official MCP TypeScript SDK for protocol lifecycle and stdio transport;
- strict server-side tool input validation;
- fixed allowlist of `cm` commands;
- default `readonly` mode;
- prepare/confirm for mutating workspace and repository operations;
- per-workspace serialization for write confirmations;
- cross-process workspace write locking;
- state revalidation between prepare and confirm;
- separate read/write timeouts and bounded process output;
- manifest-driven one-process routing for up to 50 named workspaces, with explicit per-call workspace selection;
- optional one-process-per-workspace isolation layout;
- workspace-bound confirmation tokens, audit logs, and write locks;
- path-scoped irreversible undo with whole-workspace undo forbidden;
- workspace path confinement;
- workspace and repository allowlists;
- optional JSONL audit logging with `UVCS_AUDIT_LOG`;
- fake `cm` MCP smoke test for CI without Plastic SCM credentials;
- read-only cleanup and branch safety helpers instead of destructive delete tools;
- unit tests, ESLint, syntax checks, release metadata checks, fake smoke, and CI on Node.js 20, 22, and 24;
- production dependency audit in CI and the publish gate;
- npm publishing workflow using trusted publishing/OIDC and provenance;
- documented security review for path escape, token replay, env handling, command construction, and destructive-operation policy;
- one full Plastic SCM E2E smoke pass on `pas-Kodeks@SRV-IAN-N:8087`;
- live validation on Plastic SCM `10.0.16.6656+` and Unity Version Control / Unity DevOps Version Control `11.x`;
- public install, security, compatibility, troubleshooting, support, and contribution docs.

## Beta criteria

Before calling the project beta:

- test Plastic SCM 10.x on Windows;
- test Unity Version Control / Unity DevOps Version Control 11.x; done for current `1.0.0` validation set;
- test at least one cloud workspace and one on-premises or local server workspace;
- keep the fake `cm` smoke test in CI for server/tool flows without requiring credentials;
- document command fallbacks, especially `status --includeRevId`;
- keep `UVCS_ALLOWED_REPOS` and `UVCS_ALLOWED_WORKSPACES` behavior covered by tests;
- keep all mutating tools behind prepare/confirm.

## 1.x maintenance criteria

For the `1.x` line:

- publish stable npm releases from signed tags or GitHub Releases;
- keep supported Node.js and `cm` version ranges documented;
- keep breaking changes for major versions only;
- maintain compatibility reports for real-world `cm` configurations;
- document a recommended runbook for team workspaces;
- collect field feedback from real Cursor, Codex, Claude, OpenCode, Kiro, or Windsurf users;
- keep the security review current when command construction, auth, path handling, or write tools change.

## Recommended team runbook

- Use `readonly` mode by default in important workspaces.
- Use `standard` mode only in a disposable workspace, dev workspace, or release-manager checkout.
- Run `uvcs_doctor` after installing the MCP server or updating the Plastic SCM / Unity Version Control client.
- Run `npm run smoke:fake` before opening release pull requests.
- Run `npm run smoke:fleet` when changing client setup, policy, locking, or prepare/confirm behavior.
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
