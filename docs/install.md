# Install

Requirements: Node.js 22 or newer, an existing Plastic SCM / Unity Version Control workspace, and a logged-in `cm` CLI (`10.0.16.6656` or newer).

## AI IDE assisted install

Ask your AI IDE to install this MCP server from the GitHub repository URL:

```text
Install this MCP server from https://github.com/ProAnima/unity-version-control-mcp, configure it for my Plastic SCM / Unity Version Control source-control workspace, and run uvcs_doctor.
```

## From npm (recommended)

```bash
npx -y @proanima/uvcs-mcp@1.3.0 init --client=cursor --workspace="D:/Repositories/YourWorkspace"
```

Choose a safety profile explicitly for shared workspaces:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 init --client=cursor --workspace="D:/Repositories/YourWorkspace" --safety=guarded
```

`guarded` detects the repository identity from local workspace metadata (`.plastic/plastic.workspace` or `cm wi`), so it works while the server is unreachable. If detection fails, `init` prints the `cm` error and an example such as `--allowed-repos=repo@server:8087`; pass the identity explicitly with that flag.

In an interactive terminal without `--yes`, `init` asks for missing values (install source, clients, workspace). With `--yes`, or without a terminal, it uses the defaults: the npm source, the `cursor` client, and `$UVCS_WORKSPACE` or the current folder as the workspace.

Run `npx -y @proanima/uvcs-mcp@1.3.0 init --help` for every option. Options accept both `--key=value` and `--key value`. An unknown option or client stops with exit code 2 and points to the valid choices.

## Where configs are written

Project-scoped clients write into a project folder:

| Client | File |
| --- | --- |
| `cursor` | `.cursor/mcp.json` |
| `claude-code` | `.mcp.json` |
| `kiro` | `.kiro/settings/mcp.json` |
| `opencode` | `opencode.json` |
| `antigravity` | `.agents/mcp_config.json` |

The project folder is `--project-dir` when given; otherwise the workspace folder when it exists; otherwise the current folder. `init` refuses to write project files into the uvcs-mcp package folder itself unless `--project-dir` is passed explicitly.

User-scoped clients (`cursor-global`, `codex`, `claude-desktop`, `kiro-global`, `opencode-global`, `windsurf`, `antigravity-global`) write into their user config files. See [Clients](clients.md) for every path.

## How existing configs are changed

- Every target is read and validated before anything is written. If any file is malformed, is accompanied by a JSONC variant (`opencode.jsonc`), or defines the Codex server in a form that cannot be merged safely, nothing is written. `--skip-invalid` skips those clients and prints the entry to add by hand.
- Only the `uvcs` entry is added or replaced; other servers and settings are kept.
- A changed file is backed up first as `<file>.<YYYYMMDDHHmmss>.bak`. Existing backups are never overwritten. `--no-backup` disables backups.
- A file whose content would not change is not rewritten and is reported as `Unchanged`.
- `--print-config` (or `--dry-run`) writes nothing. It prints each target path with its action (`would create`, `would merge`, or `unchanged`) and only the `uvcs` entries, never other servers' settings or tokens.

## Generated launch command

With the npm install source, most clients get plain `npx` on every platform. On native Windows, Antigravity and Windsurf / Devin Desktop are not confirmed to resolve the `npx.cmd` shim themselves, so their entries are wrapped:

```json
{
  "command": "cmd",
  "args": ["/c", "npx", "-y", "@proanima/uvcs-mcp@1.3.0"]
}
```

The per-client table is in [Clients](clients.md#launch-command-on-windows).

Plain form, used by all other clients and on macOS and Linux:

```json
{
  "command": "npx",
  "args": ["-y", "@proanima/uvcs-mcp@1.3.0"]
}
```

For Codex, the npm source also gets `startup_timeout_sec = 60` to allow time for the first `npx` download.

## `cm` discovery

`init` resolves `cm` to an absolute path and writes it as `UVCS_CM_PATH`: first `--cm`, then `$UVCS_CM_PATH`, then `PATH`, then the standard install folders (for example `C:\Program Files\PlasticSCM5\client\cm.exe` or `/usr/local/bin/cm`). This matters for GUI clients on macOS, which do not inherit the shell `PATH`. If `cm` is not found, `init` warns and the config relies on the client's `PATH`; pass `--cm=<path>` to pin it.

## Generated environment

Every generated entry pins `UVCS_WORKSPACE` and `UVCS_ALLOWED_WORKSPACES` to the workspace and sets `UVCS_WORKSPACE_NAME`, `UVCS_SAFETY_PROFILE`, and `UVCS_MCP_MODE`. `guarded` adds `UVCS_ALLOWED_REPOS`, `UVCS_CHECKIN_MAX_FILES=20`, and `UVCS_TOKEN_TTL_SEC=120`. See [Configuration](configuration.md) for every variable.

## From Git Clone

Use a clone only when client configuration should run that checkout. Install dependencies first:

```bash
git clone https://github.com/ProAnima/unity-version-control-mcp.git uvcs-mcp
cd uvcs-mcp
npm ci
node src/cli.js init-local --client=cursor --workspace="D:/Repositories/YourWorkspace"
```

Always pass `--workspace` or `--project-dir`: project files belong in your project, not in the clone. `init-local` writes configs that run this checkout with the current Node.js:

```json
{
  "command": "C:/Program Files/nodejs/node.exe",
  "args": ["C:/path/to/uvcs-mcp/src/cli.js"],
  "env": {
    "UVCS_WORKSPACE": "D:/Repositories/YourWorkspace",
    "UVCS_MCP_MODE": "readonly"
  }
}
```

`init-local` refuses to run from the temporary `npx` cache, which npm may delete.

Convenience npm scripts are also available:

```bash
npm run setup:cursor -- --workspace="D:/Repositories/YourWorkspace"
npm run setup:codex -- --workspace="D:/Repositories/YourWorkspace"
```

`npm run setup:all` configures every supported client; prefer the clients you actually use.

## Fleets

Use `--manifest=workspaces.json` for one MCP server that routes every call to an explicit named workspace. Add `--fleet-layout=isolated` for one MCP process per workspace. See [Multi-Workspace and Fleet Work](multi-workspace.md).

## Validate

The initializer warns when a configured path does not contain `.plastic/plastic.workspace`. Validate before restarting the client:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 doctor --workspace="D:/Repositories/YourWorkspace"
npx -y @proanima/uvcs-mcp@1.3.0 doctor --manifest=workspaces.json
```

`doctor` exits with code 1 when a check fails. A missing path or a folder without `.plastic/plastic.workspace` is reported as such, not as a missing `cm`. Without a workspace it checks only `cm`, prints a warning, and exits with code 1 unless `--allow-no-workspace` is passed. Invalid options exit with code 2.

After restarting the MCP client, call `uvcs_setup_status`. If project naming rules are missing, create them with `uvcs_style_init_prepare` and `uvcs_style_init_confirm` in `guarded` or `standard` mode.

## Troubleshooting

See [Troubleshooting](troubleshooting.md).
