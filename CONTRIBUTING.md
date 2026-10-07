# Contributing

Thanks for helping improve UVCS MCP.

This project focuses on Plastic SCM / Unity Version Control source-control workflows through the official `cm` CLI. It is not a Unity Editor automation server.

## Development Setup

Requirements:

- Node.js 22 or newer;
- Plastic SCM / Unity Version Control `cm` CLI for live compatibility testing;
- an existing source-control workspace for smoke tests.

Run checks:

```bash
npm ci
npm test
npm run lint
npm run check
npm run release:check
npm run smoke:fake
npm run smoke:fleet
npm run smoke:pack
```

`npm run check` syntax-checks every JavaScript file in `src/` and `scripts/`, so new files need no registration. `smoke:fake` and `smoke:fleet` run against a stateful fake `cm` (`scripts/fake-cm.js`) and need no server. `smoke:pack` installs the packed tarball into a clean project and starts the installed server. Environment variables are documented in [docs/configuration.md](docs/configuration.md).

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

Any user-supplied value passed to `cm` as a positional argument (paths, branch names, label names, specs) must be validated so that it cannot start with `-`; otherwise `cm` parses it as an option. Use `assertRelativeWorkspacePath` for item paths.

Write tools must use prepare/confirm when they can mutate repository or workspace state, and every tool needs MCP annotations: read and prepare tools are read-only; confirm tools are not, and are destructive when they can discard or overwrite work.

New environment variables must be added to `src/config/env.js` and documented in [docs/configuration.md](docs/configuration.md). Decide whether fleet mode shares them (`src/config/fleet.js`) or takes them from the manifest only.

## Compatibility

If you add support for a new Plastic SCM / Unity Version Control version, update [docs/compatibility.md](docs/compatibility.md) with:

- product branding;
- `cm version`;
- operating system;
- cloud, on-premises, or local server;
- commands tested;
- known limitations.
