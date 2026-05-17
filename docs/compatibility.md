# Compatibility

UVCS MCP targets the `cm` CLI shared by Plastic SCM, Unity Version Control, and the current Unity DevOps Version Control branding. These are SCM commands, not Unity Editor commands.

The MCP server is server-location agnostic: it works with a workspace that is already configured for Unity Cloud, Unity Version Control Cloud, an on-premises server, or a local Plastic/UVCS server. Authentication, cloud organization selection, and server URL handling stay in the official `cm` client configuration.

## Current Backend

- Transport: MCP over stdio JSON-RPC.
- Backend: local `cm` process, spawned without a shell.
- Discovery: `cm showcommands`, `cm version`, and `cm api --help`.
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
| locks | `cm lock list --machinereadable` | Falls back to `cm lock list`. |
| file diff | `cm diff <file>` | Path is constrained to `UVCS_WORKSPACE`. |
| update | `cm update --noinput --machinereadable` | Requires `UVCS_MCP_MODE=standard`; `--noinput` prevents interactive hangs. |
| checkin | `cm checkin -c=<message> --applychanged --machinereadable` | Requires prepare/confirm and `standard` mode; `--applychanged` includes detected modified items. |

The server does not expose arbitrary `cm` commands.

## Compatibility Strategy

- Prefer documented `--machinereadable` output where available.
- Probe newer flags such as `status --includeRevId` with `allowFailure` and fall back cleanly.
- Keep command construction in `src/backend/commands.js` so version-specific changes stay isolated.
- Keep parsing separate from process execution in `src/backend/machine-readable.js`.
- Keep Unity-specific checks in `src/services/unity-meta.js`, not in the `cm` backend.

## Tested Matrix

| Product | Version | Status | Notes |
| --- | --- | --- | --- |
| Plastic SCM | `10.0.16.6656` | Tested pass | Full MCP E2E smoke passed on `pas-Kodeks@SRV-IAN-N:8087`. |
| Unity Version Control / Unity DevOps Version Control | `11.x` | Expected | Uses the same `cm` CLI surface for cloud and on-prem workspaces; needs live smoke before marking tested. |

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
