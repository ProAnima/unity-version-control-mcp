# Compatibility

UVCS MCP targets the `cm` CLI shared by Plastic SCM, Unity Version Control, and the current Unity DevOps Version Control branding. These are SCM commands, not Unity Editor commands.

The MCP server is server-location agnostic: it works with a workspace that is already configured for Unity Cloud, Unity Version Control Cloud, an on-premises server, or a local Plastic/UVCS server. Authentication, cloud organization selection, and server URL handling stay in the official `cm` client configuration.

## Current Backend

- Transport: MCP over stdio JSON-RPC.
- Backend: local `cm` process, spawned without a shell, with stdin closed and `LC_ALL=C.UTF-8` in its environment. A command that waits for interactive input fails immediately.
- Output decoding: strict UTF-8 first. On Windows, `cm` writes redirected output in the console code page (for example cp866 or cp1251 on Russian Windows); output that is not valid UTF-8 is decoded with the system OEM and ANSI code pages and the most readable result is used. `UVCS_CM_OUTPUT_ENCODING` forces one encoding; see [Configuration](configuration.md).
- Discovery: `cm showcommands`, `cm version`, and `cm api --help`.
- Node.js: 22 or newer.
- Optional local REST: `cm api` starts Plastic SCM API on port `9090`; this project only detects availability for now and does not start a long-running REST server.

## Command Surface

| Feature | Command | Notes |
| --- | --- | --- |
| command discovery | `cm showcommands` | Used by `doctor`. |
| version discovery | `cm version` | Best-effort; older clients may print different text. |
| API discovery | `cm api --help` | Detects API support without starting `cm api`. |
| concise status | `cm status --short` | Used by `uvcs_workspace_status`. |
| pending changes | `cm status --machinereadable` | Preferred structured form. |
| pending changes with rev id | `cm status --includeRevId --machinereadable` | Best-effort for newer UVCS clients; falls back when unsupported. |
| current branch | `cm status` | The first status line contains current branch/workspace context; `cm branch` without a subcommand is not portable across Plastic versions. |
| workspace identity | `cm wi --machinereadable` | Reads the loaded branch/changeset and `repository@server` from local metadata, so it works offline. Used for repository allowlists and guarded setup when `.plastic/plastic.workspace` has no repository metadata; `cm status --header --nochanges` is the fallback. |
| locks | `cm lock list --machinereadable` | Falls back to `cm lock list`. |
| file diff | `cm diff <file>` | Path is constrained to `UVCS_WORKSPACE`. |
| update | `cm update --noinput --machinereadable` | Requires prepare/confirm and `standard` mode; `--noinput` prevents interactive hangs. |
| checkin | `cm checkin -c=<message> --applychanged --machinereadable` | Requires prepare/confirm and `standard` mode. Always includes all tracked pending changes in the workspace; `--applychanged` adds changed items that are not checked out. Private and ignored files are not included. |
| add | `cm add -R <path>` | Requires prepare/confirm and `standard` mode. |
| undo | `cm undo <path> [--recursive] --machinereadable` | Requires prepare/confirm and `standard` mode; one path, never the workspace root. |
| branch create | `cm branch create <branch> --changeset=<cs> [-c=<comment>]` | Requires prepare/confirm and `standard` mode. Uses `--label=<label>` instead of `--changeset` when created from a label. |
| label create | `cm label create <label> <cs:N> [-c=<comment>]` | Requires prepare/confirm and `standard` mode. |
| switch | `cm switch <target>` | Requires prepare/confirm and `standard` mode; refused while tracked pending changes exist. |
| merge | `cm merge <source> --merge --nointeractiveresolution --machinereadable [-c=<comment>]` | Requires prepare/confirm and `standard` mode; refused while tracked pending changes exist. No preview; the result stays pending until a checkin. |
| analytics and cleanup helpers | `cm find changeset` / `cm find branch` with `--format` and `--nototal` | Read-only queries built from validated inputs. |

The server does not expose arbitrary `cm` commands.

## Compatibility Strategy

- Prefer documented `--machinereadable` output where available.
- Probe newer flags such as `status --includeRevId` with `allowFailure` and fall back cleanly.
- Keep command construction in `src/backend/commands.js` so version-specific changes stay isolated.
- Keep parsing separate from process execution in `src/backend/machine-readable.js`.
- Keep Unity-specific checks in `src/services/unity-meta.js`, not in the `cm` backend.

## Supported `cm` Versions

UVCS MCP targets the shared Plastic SCM / Unity Version Control `cm` CLI. The supported baseline is:

- **minimum tested baseline:** `10.0.16.6656`
- **supported range:** `10.0.16.6656` and newer, including Unity Version Control / Unity DevOps Version Control `11.x`

Older `cm` builds may work when they expose the same command surface, but they are not part of the current support statement.

Gluon / partial workspaces are not supported: the server uses full-workspace commands such as `cm update`, `cm switch`, and `cm checkin`, not the `cm partial` command set.

## Tested Matrix

| Product | Version | Status | Notes |
| --- | --- | --- | --- |
| Plastic SCM | `10.0.16.6656` | Tested pass | Full MCP E2E smoke passed against a live repository on a self-hosted server. |
| Plastic SCM | `10.x` (newer than baseline) | Tested pass | Same `cm` CLI surface; validated in live workspaces. |
| Unity Version Control / Unity DevOps Version Control | `11.x` | Tested pass | Validated across multiple `11.x` client versions in live workspaces. |

Report additional tested combinations through a [compatibility issue](https://github.com/ProAnima/unity-version-control-mcp/issues/new?template=compatibility_report.yml).

## Cloud and On-Prem

Unity documents UVCS On-Prem as the option for running your own server instead of Unity Cloud, and points On-Prem users to the same GUI and CLI workflow documentation. UVCS MCP relies on that shared CLI layer:

- Cloud workspace: `cm` uses the user's configured Unity Cloud/UVCS authentication.
- On-premises workspace: `cm` uses the configured server, port, and authentication from the local client config.
- Local server workspace: `cm` uses the local Plastic/UVCS server configuration.

No repository delete, repository rename, or server administration commands are exposed.

## Real Smoke Coverage

The Plastic SCM smoke test has validated these operations through MCP tools:

- doctor
- workspace status
- branch create from changeset
- switch workspace
- add
- checkin with `--applychanged`
- label create
- branch create from label
- merge with `--nointeractiveresolution`
- merge checkin
- switch back to `/main`
