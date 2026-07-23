# UVCS MCP - Unity Version Control / Plastic SCM MCP Server

![UVCS MCP header](assets/uvcs-mcp-header.png)

Safe MCP server for Plastic SCM, Unity Version Control, and Unity DevOps Version Control source-control workspaces (`cm` **10.0.16.6656+**, including **11.x**).

UVCS MCP connects AI IDEs and coding agents to the local `cm` CLI through a fixed allowlist of documented SCM commands. It helps agents inspect source-control workspace state, prepare changes, create branches and labels, run guarded checkins, and perform merges without arbitrary shell access.

Current release: `1.2.0`. Supported `cm` clients: **10.0.16.6656 and newer**, including Unity Version Control / Unity DevOps Version Control **11.x**.

## Requirements

- Node.js 20, 22, or 24;
- an existing Plastic SCM / Unity Version Control workspace;
- `cm` available in `PATH`, or an explicit `--cm=<path>`;
- a logged-in `cm` client with access to the workspace server.

## Not a Unity Editor MCP

UVCS MCP is not a Unity Editor automation server. It does not control scenes, GameObjects, Play Mode, Unity packages, editor windows, builds, or runtime objects.

It works with the Plastic SCM / Unity Version Control `cm` CLI and focuses on source-control workflows: status, pending changes, branches, labels, checkins, locks, diffs, and merges.

## Production Quick Start

For one workspace, start with the `guarded` profile:

```bash
npx -y @proanima/uvcs-mcp@1.2.0 init \
  --client=cursor,codex \
  --workspace="D:/Repositories/YourWorkspace" \
  --safety=guarded \
  --print-config
```

Review the preview, remove `--print-config` to apply it, and validate the result:

```bash
npx -y @proanima/uvcs-mcp@1.2.0 doctor \
  --workspace="D:/Repositories/YourWorkspace"
```

Restart the MCP client, then call:

```text
uvcs_setup_status
uvcs_workspace_status
uvcs_style_setup_check
```

Use `readonly` when inspection is sufficient. Use `standard` only for trusted or disposable workspaces where repository identity pinning is intentionally not required.

## AI-Assisted Install

Ask your AI IDE to install this MCP server from the GitHub repository URL.

For example:

```text
Install this MCP server from https://github.com/ProAnima/unity-version-control-mcp, configure it for my Plastic SCM / Unity Version Control source-control workspace, and run uvcs_doctor.
```

Or install manually:

```bash
git clone https://github.com/ProAnima/unity-version-control-mcp.git uvcs-mcp
cd uvcs-mcp
npm ci
node src/cli.js init-local --client=cursor,codex,claude-code,opencode,antigravity,kiro --workspace="D:/Repositories/YourWorkspace"
```

Restart your MCP client, then ask it to run:

```text
uvcs_doctor
uvcs_workspace_status
```

Preview config changes without writing:

```bash
node src/cli.js init-local --client=all --workspace="D:/Repositories/YourWorkspace" --print-config
```

## Manual Setup By OS

Windows:

```powershell
node src/cli.js init-local --client=cursor,codex,claude-code,opencode,antigravity,kiro,windsurf --workspace="D:\Repositories\YourWorkspace"
```

macOS:

```bash
node src/cli.js init-local --client=cursor,codex,claude-code,opencode,antigravity,kiro,windsurf --workspace="$HOME/Repositories/YourWorkspace"
```

Linux:

```bash
node src/cli.js init-local --client=cursor,codex,claude-code,opencode,antigravity,kiro,windsurf --workspace="$HOME/Repositories/YourWorkspace"
```

If `cm` is not in `PATH`, add `--cm=/path/to/cm` or set `UVCS_CM_PATH`.

## npm Install

```bash
npx -y @proanima/uvcs-mcp@1.2.0 init --client=cursor,codex --workspace="D:/Repositories/YourWorkspace" --safety=guarded
```

`init` uses the npm package as its install source. Use `init-local` only when client configuration should run the current git checkout.

Manual MCP block:

```json
{
  "command": "npx",
  "args": ["-y", "@proanima/uvcs-mcp@1.2.0"],
  "env": {
    "UVCS_WORKSPACE": "D:/Repositories/YourWorkspace",
    "UVCS_MCP_MODE": "readonly"
  }
}
```

## Supported Clients

- Cursor
- Cursor global
- Codex
- Claude Desktop
- Claude Code
- OpenCode
- OpenCode global
- Antigravity
- Kiro
- Kiro global
- Windsurf

## Safety Model

- Default mode is `readonly`.
- Protocol handling is provided by the official MCP TypeScript SDK.
- Tool input is validated server-side with strict schemas.
- Write tools require `UVCS_MCP_MODE=standard`.
- Critical write operations use `*_prepare` followed by matching `*_confirm`.
- Write confirmations are serialized per workspace.
- Confirmed switch, merge, update, and checkin operations revalidate workspace state after prepare.
- Multiple MCP processes coordinate writes through a workspace lock file.
- Read and write commands have separate timeouts and bounded output.
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
npx -y @proanima/uvcs-mcp@1.2.0 init --manifest=workspaces.json --client=cursor,codex --print-config
```

Start from `templates/fleet/workspaces.example.json`. See [Multi-Workspace and Fleet Work](docs/multi-workspace.md) for safety profiles and the recommended prepare-all/confirm-each workflow.

In fleet mode every tool call requires an explicit `workspace` selector. Use `--fleet-layout=isolated` only when you prefer one MCP process per workspace.

Validate every configured workspace before restarting the client:

```bash
npx -y @proanima/uvcs-mcp@1.2.0 doctor --manifest=workspaces.json
```

For mass work, inspect every target first, prepare all writes, present one combined plan, and confirm each workspace independently. Cross-repository operations are not atomic.

## Development

```bash
npm test
npm run check
npm run audit:prod
npm run smoke:fake
npm run smoke:fleet
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
- [Multi-Workspace and Fleet Work](docs/multi-workspace.md)
- [Security](docs/security.md)
- [Security Review](docs/security-review.md)
- [Compatibility](docs/compatibility.md)
- [Publishing](docs/publishing.md)
- [Release notes: 1.2.0](docs/releases/v1.2.0.md)
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
