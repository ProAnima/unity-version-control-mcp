# Contributing

Thanks for helping improve UVCS MCP.

This project focuses on Plastic SCM / Unity Version Control source-control workflows through the official `cm` CLI. It is not a Unity Editor automation server.

## Development Setup

Requirements:

- Node.js 20 or newer;
- Plastic SCM / Unity Version Control `cm` CLI for live compatibility testing;
- an existing source-control workspace for smoke tests.

Run checks:

```bash
npm test
npm run check
npm pack --dry-run
```

Run a live smoke test only against a disposable or safe workspace:

```bash
npm run smoke:plastic -- "D:/Repositories/YourWorkspace"
```

The smoke test creates temporary branches, labels, checkins, and a merge through MCP tools.

## Pull Requests

Before opening a pull request:

- keep command construction in `src/backend/commands.js`;
- keep parsing separate from process execution;
- keep policy and safety gates in `src/policy`;
- return MCP tool failures as structured `isError` results with actionable hints;
- add or update tests for command shape, policy behavior, parser behavior, or client config output;
- update docs when behavior or setup changes.

## Command Safety

New tools must use allowlisted commands and argument arrays. Do not add generic shell access, arbitrary `cm` execution, repository delete, repository rename, or background `cm api` startup.

Write tools must use prepare/confirm when they can mutate repository or workspace state.

## Compatibility

If you add support for a new Plastic SCM / Unity Version Control version, update [docs/compatibility.md](docs/compatibility.md) with:

- product branding;
- `cm version`;
- operating system;
- cloud, on-premises, or local server;
- commands tested;
- known limitations.
