# UVCS MCP - Unity Version Control / Plastic SCM MCP Server

![UVCS MCP header](https://raw.githubusercontent.com/ProAnima/unity-version-control-mcp/main/assets/uvcs-mcp-header.png)

Safe MCP server for Plastic SCM, Unity Version Control, and Unity DevOps Version Control source-control workspaces (`cm` **10.0.16.6656+**, including **11.x**).

UVCS MCP connects AI IDEs and coding agents to the local `cm` CLI through a fixed allowlist of documented SCM commands. It helps agents inspect source-control workspace state, prepare changes, create branches and labels, run guarded checkins, and perform merges without arbitrary shell access.

Current release: `1.3.0`. Supported `cm` clients: **10.0.16.6656 and newer**, including Unity Version Control / Unity DevOps Version Control **11.x**.

## Requirements

- Node.js 22 or newer (tested on 22, 24, and 26);
- an existing Plastic SCM / Unity Version Control workspace;
- the `cm` CLI. `init` finds it on `PATH` or in the standard install folders and writes its absolute path; otherwise pass `--cm=<path>`;
- a logged-in `cm` client with access to the workspace server.

## Not a Unity Editor MCP

UVCS MCP is not a Unity Editor automation server. It does not control scenes, GameObjects, Play Mode, Unity packages, editor windows, builds, or runtime objects.

It works with the Plastic SCM / Unity Version Control `cm` CLI and focuses on source-control workflows: status, pending changes, branches, labels, checkins, locks, diffs, and merges.

## Production Quick Start

For one workspace, start with the `guarded` profile:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 init \
  --client=cursor,codex \
  --workspace="D:/Repositories/YourWorkspace" \
  --safety=guarded \
  --print-config
```

The preview shows only the `uvcs` entries, the target files, and whether each file would be created, merged, or left unchanged. Project files such as `.cursor/mcp.json` go into the workspace folder; pass `--project-dir=<folder>` to put them elsewhere. Remove `--print-config` to apply it, then validate the result:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 doctor \
  --workspace="D:/Repositories/YourWorkspace"
```

Restart the MCP client, then call:

```text
uvcs_setup_status
uvcs_workspace_status
uvcs_style_setup_check
```

Use `readonly` when inspection is sufficient. Use `standard` only for trusted or disposable workspaces where repository identity pinning is intentionally not required.

Configure the MCP client to auto-approve only read-only tools and to ask you before every `*_confirm` tool. See [Clients](docs/clients.md).

## AI-Assisted Install

Ask your AI IDE to install this MCP server from the GitHub repository URL.

For example:

```text
Install this MCP server from https://github.com/ProAnima/unity-version-control-mcp, configure it for my Plastic SCM / Unity Version Control source-control workspace, and run uvcs_doctor.
```

## Install From a Clone

Use a clone only when client configuration should run that checkout instead of the npm package:

```bash
git clone https://github.com/ProAnima/unity-version-control-mcp.git uvcs-mcp
cd uvcs-mcp
npm ci
node src/cli.js init-local --client=cursor --workspace="D:/Repositories/YourWorkspace"
```

Always pass `--workspace` (or `--project-dir`): project files are written into the workspace folder, and `init` refuses to write them into the uvcs-mcp folder itself. Preview first with `--print-config`.

Restart your MCP client, then ask it to run:

```text
uvcs_doctor
uvcs_workspace_status
```

## Manual Setup By OS

Windows:

```powershell
npx -y @proanima/uvcs-mcp@1.3.0 init --client=cursor --workspace="D:\Repositories\YourWorkspace"
```

macOS:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 init --client=cursor --workspace="$HOME/Repositories/YourWorkspace"
```

Linux:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 init --client=cursor --workspace="$HOME/Repositories/YourWorkspace"
```

Replace `cursor` with your client, or list several separated by commas. If `cm` is not found, add `--cm=/path/to/cm`. On macOS this matters for GUI clients, which do not inherit the shell `PATH`; `init` writes the absolute `cm` path as `UVCS_CM_PATH` for that reason.

`init` validates every target before writing. A malformed or JSONC config aborts the run with nothing written, unless `--skip-invalid` is passed, which skips that client and prints the entry to add by hand. Changed files are backed up as `<file>.<YYYYMMDDHHmmss>.bak`; unchanged files are not rewritten. Run `uvcs-mcp init --help` for every option.

## Manual MCP Block

```json
{
  "command": "npx",
  "args": ["-y", "@proanima/uvcs-mcp@1.3.0"],
  "env": {
    "UVCS_WORKSPACE": "D:/Repositories/YourWorkspace",
    "UVCS_MCP_MODE": "readonly"
  }
}
```

On native Windows `npx` is the `npx.cmd` shim. Claude Code, Claude Desktop, Cursor, Codex 0.59+, Kiro, and OpenCode resolve it themselves. For Antigravity and Windsurf / Devin Desktop, or if a client reports `spawn npx ENOENT`, use `"command": "cmd"` with `"args": ["/c", "npx", "-y", "@proanima/uvcs-mcp@1.3.0"]`. See [Clients](docs/clients.md#launch-command-on-windows).

Every environment variable is described in [Configuration](docs/configuration.md).

## Supported Clients

- Cursor (project and global)
- Codex
- Claude Desktop
- Claude Code (project `.mcp.json`; `init` also prints the equivalent `claude mcp add --scope user` command)
- OpenCode (project and global)
- Antigravity (project and global)
- Kiro (project and global)
- Windsurf / Devin Desktop
- Zed (template only)

See [Clients](docs/clients.md) for file locations.

## Safety Model

- Default mode is `readonly`; an unrecognized `UVCS_MCP_MODE` also means `readonly`.
- Protocol handling is provided by the official MCP TypeScript SDK.
- Tool input is validated server-side with strict schemas.
- Write tools require `UVCS_MCP_MODE=standard`.
- Every write uses `*_prepare` followed by the matching `*_confirm`, and tools carry MCP annotations so clients can auto-approve reads and require approval for writes.
- Checkin always includes all tracked pending changes in the workspace; keep Unity assets and their `.meta` files together.
- Item paths, branch names, and label names that `cm` would read as options (leading `-`) are rejected.
- Write confirmations are serialized per workspace and across MCP processes, and switch, merge, update, undo, and checkin revalidate workspace state after prepare.
- `cm` runs without a shell and with stdin closed, under separate read and write timeouts and an output limit.
- Repository delete, repository rename, arbitrary `cm`, arbitrary shell execution, and raw `cm api` startup are not exposed.
- Optional JSONL audit logging is available with `UVCS_AUDIT_LOG=/path/to/uvcs-mcp-audit.jsonl`.

## Tools

- `uvcs_doctor`
- `uvcs_policy_status`
- `uvcs_setup_status`
- `uvcs_workspace_status`
- `uvcs_pending_changes`
- `uvcs_branch_info`
- `uvcs_locks`
- `uvcs_unity_meta_diagnostics`
- `uvcs_style_rules`
- `uvcs_style_setup_check`
- `uvcs_style_init_prepare` / `uvcs_style_init_confirm`
- `uvcs_name_preview`
- `uvcs_release_plan`
- `uvcs_diff_file`
- `uvcs_cleanup_candidates`
- `uvcs_branch_safety_report`
- `uvcs_update_workspace_prepare` / `uvcs_update_workspace_confirm`
- `uvcs_changeset_analytics`
- `uvcs_add_prepare` / `uvcs_add_confirm`
- `uvcs_undo_prepare` / `uvcs_undo_confirm`
- `uvcs_branch_create_prepare` / `uvcs_branch_create_confirm`
- `uvcs_label_create_prepare` / `uvcs_label_create_confirm`
- `uvcs_switch_workspace_prepare` / `uvcs_switch_workspace_confirm`
- `uvcs_merge_prepare` / `uvcs_merge_confirm`
- `uvcs_checkin_prepare` / `uvcs_checkin_confirm`

## Multiple Workspaces

Use a fleet manifest to configure one MCP server for up to 50 named workspaces:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 init --manifest=workspaces.json --client=cursor,codex --print-config
```

Start from `templates/fleet/workspaces.example.json`. See [Multi-Workspace and Fleet Work](docs/multi-workspace.md) for safety profiles and the recommended prepare-all/confirm-each workflow.

In fleet mode every tool call requires an explicit `workspace` selector. Use `--fleet-layout=isolated` only when you prefer one MCP process per workspace.

Validate every configured workspace before restarting the client:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 doctor --manifest=workspaces.json
```

For mass work, inspect every target first, prepare all writes, present one combined plan, and confirm each workspace independently. Cross-repository operations are not atomic.

## Development

```bash
npm ci
npm test
npm run lint
npm run check
npm run audit:prod
npm run release:check
npm run smoke:fake
npm run smoke:fleet
npm run smoke:pack
```

Run the real Plastic SCM smoke test against a disposable or safe workspace:

```bash
npm run smoke:plastic -- "D:/Repositories/YourWorkspace"
```

The smoke test creates temporary branches, labels, checkins, and a merge through MCP tools.

## Project Support

- Use GitHub Issues for reproducible bugs, client setup problems, and compatibility reports.
- Use feature requests for new SCM workflows or MCP tools.
- Do not include secrets, access tokens, private server credentials, or full proprietary logs in public issues.
- For security reports, see [Security Policy](SECURITY.md).

## Documentation

- [Install](docs/install.md)
- [Clients](docs/clients.md)
- [Configuration](docs/configuration.md)
- [Multi-Workspace and Fleet Work](docs/multi-workspace.md)
- [Security](docs/security.md)
- [Security Review](docs/security-review.md)
- [Compatibility](docs/compatibility.md)
- [Publishing](docs/publishing.md)
- [Release notes: 1.3.0](docs/releases/v1.3.0.md)
- [Automation Style](docs/automation-style.md)
- [Production Readiness](docs/production-readiness.md)
- [Troubleshooting](docs/troubleshooting.md)
- [Rules for Agents](docs/rules-for-agents.md)
- [Contributing](CONTRIBUTING.md)
- [Support](SUPPORT.md)
- [Wiki Source](wiki/Home.md)
- [Changelog](CHANGELOG.md)

## Maintainer

Ian Panaev, ProAnimaStudio, 2026. Contact: proanimastudio@gmail.com.
