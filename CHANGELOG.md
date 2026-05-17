# Changelog

## 0.1.0-alpha.1 - 2026-05-17

Initial alpha release.

### Added

- MCP stdio server for Plastic SCM / Unity Version Control `cm`.
- Read tools for doctor, workspace status, pending changes, branch info, locks, file diff, and Unity `.meta` diagnostics.
- Style tools for branch names, checkin messages, and release planning from `.uvcs-mcp/style.json`.
- Changeset analytics tool for date, branch, owner, and comment review windows.
- Prepare/confirm write tools for add, branch create, label create, workspace switch, merge, update, and checkin.
- Local git checkout installer via `uvcs-mcp init-local`.
- Client config generation for Cursor, Codex, Claude Desktop, Claude Code, OpenCode, Antigravity, Kiro, and Windsurf.
- Cross-platform client config paths for Windows, macOS, and Linux.
- Plastic SCM end-to-end smoke script.
- Built-in Node test suite and syntax checks.

### Tested

- Plastic SCM `10.0.16.6656` on `pas-Kodeks@SRV-IAN-N:8087`.
- Full MCP E2E flow: branch create, switch, add, checkin, label create, branch from label, merge, merge checkin, switch back to `/main`.
