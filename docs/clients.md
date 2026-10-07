# Clients

`uvcs-mcp init --client=<name>` writes the `uvcs` entry for each client below. Combine clients with commas; `--client=all` configures every client. Project files go into `--project-dir`, or the workspace folder when it is omitted; see [Install](install.md#where-configs-are-written).

| `--client` | Scope | File |
| --- | --- | --- |
| `cursor` | project | `.cursor/mcp.json` |
| `cursor-global` | user | `~/.cursor/mcp.json` |
| `claude-code` | project | `.mcp.json` |
| `claude-desktop` | user | see [Claude Desktop](#claude-desktop) |
| `codex` | user | `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`) |
| `opencode` | project | `opencode.json` |
| `opencode-global` | user | `$XDG_CONFIG_HOME/opencode/opencode.json` (default `~/.config/opencode/opencode.json`) |
| `antigravity` | project | `.agents/mcp_config.json` |
| `antigravity-global` | user | `~/.gemini/config/mcp_config.json` |
| `kiro` | project | `.kiro/settings/mcp.json` |
| `kiro-global` | user | `~/.kiro/settings/mcp.json` |
| `windsurf` | user | `~/.codeium/windsurf/mcp_config.json` |

Zed has no `init` client; use the template described below.

## Launch command on Windows

On native Windows `npx` is the `npx.cmd` shim, which a process cannot be spawned from without resolving `.cmd` files. With the npm install source, `init` therefore writes a client-specific command:

| Client | Windows command | Why |
|---|---|---|
| Claude Code | `npx` | Spawns through the MCP SDK (`cross-spawn`), which resolves `npx.cmd`. Use a current version. |
| Claude Desktop | `npx` | Resolves `.cmd` files on `PATH` and starts them through `cmd.exe`. |
| Cursor, `cursor-global` | `npx` | Spawns through `cross-spawn`. |
| Codex | `npx` | Resolves `.cmd` files through `PATHEXT` since Codex 0.59.0. |
| Kiro, `kiro-global` | `npx` | Starts commands found on `PATH`, including `.cmd` files. |
| OpenCode, `opencode-global` | `npx` | Spawns through the MCP SDK (`cross-spawn`). |
| Antigravity, `antigravity-global` | `cmd /c npx` | Not confirmed to resolve `npx.cmd`. |
| Windsurf / Devin Desktop | `cmd /c npx` | Not confirmed to resolve `npx.cmd`. |

The plain form is `"command": "npx"` with `["-y", "@proanima/uvcs-mcp@1.3.0"]`; the wrapped form is `"command": "cmd"` with `["/c", "npx", "-y", "@proanima/uvcs-mcp@1.3.0"]`. macOS and Linux always use the plain form. If an older client version reports `spawn npx ENOENT`, switch its entry to the wrapped form. Neither form helps when the client cannot see Node.js on its `PATH` (for example with nvm-windows, fnm, or Volta set up only in a shell profile); then put the absolute path to `npx.cmd` in `command` or set `PATH` in `env`.

Use the same forms when you write a config by hand or copy a template from `templates/mcp`; the templates use the unversioned package name, so pin the version.

## Tool approval

Every tool carries MCP annotations. Read tools and all `*_prepare` tools are marked `readOnlyHint: true`; `*_confirm` tools are writes, and undo, update, switch, and merge confirms are also marked `destructiveHint: true`.

Auto-approve only read-only tools, which here means every tool except those ending in `_confirm`. Keep manual approval for every `*_confirm` tool so a person sees each write before it runs. Kiro entries are generated with an empty `autoApprove` list.

## Cursor

Project config `.cursor/mcp.json`; global config `~/.cursor/mcp.json` (`--client=cursor-global`).

## Claude Desktop

Windows:

```text
%APPDATA%\Claude\claude_desktop_config.json
```

macOS:

```text
~/Library/Application Support/Claude/claude_desktop_config.json
```

Linux:

```text
$XDG_CONFIG_HOME/Claude/claude_desktop_config.json (default ~/.config/Claude/claude_desktop_config.json)
```

## Claude Code

`--client=claude-code` writes the project config `.mcp.json` with `"type": "stdio"`.

`init` also prints an equivalent command for user scope, to use instead of the project file:

```bash
claude mcp add --env UVCS_WORKSPACE=... --env UVCS_MCP_MODE=readonly ... --scope user --transport stdio uvcs -- npx -y @proanima/uvcs-mcp@1.3.0
```

Copy the printed command rather than this shortened example; it contains every environment variable of the generated entry.

## Codex

`--client=codex` writes `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`) with a `[mcp_servers.uvcs]` table and a nested `[mcp_servers.uvcs.env]` table. The npm source adds `startup_timeout_sec = 60`.

The merge replaces only `[mcp_servers.uvcs]` and its subtables, including quoted spellings such as `[mcp_servers."uvcs"]`, and leaves everything else in place: other tables and servers, array tables, and comments. Keys that `init` does not manage, such as `enabled_tools` or an existing `startup_timeout_sec`, are kept inside `[mcp_servers.uvcs]`; `startup_timeout_sec` is only added when it is missing. A `uvcs` server defined as an inline table or with dotted keys is refused instead of duplicated; fix it by hand or use `--skip-invalid`.

## OpenCode

Project config `opencode.json`; global config `$XDG_CONFIG_HOME/opencode/opencode.json` (`--client=opencode-global`).

The generated server is under `mcp.uvcs` and uses `type: "local"`, a `command` array, `enabled: true`, and `environment`. If an `opencode.jsonc` file exists next to the target, `init` refuses to change it because comments would be lost.

## Antigravity

Project config `.agents/mcp_config.json` (`--client=antigravity`); global config `~/.gemini/config/mcp_config.json` (`--client=antigravity-global`). Source: [Antigravity MCP documentation](https://antigravity.google/docs/mcp).

Older Antigravity builds read `~/.gemini/antigravity/mcp_config.json`. If the server does not show up, copy the generated entry there; `init` prints the same note.

## Kiro

Workspace config `.kiro/settings/mcp.json`; global config `~/.kiro/settings/mcp.json` (`--client=kiro-global`). Entries include `"disabled": false` and `"autoApprove": []`.

## Windsurf / Devin Desktop

Global config `~/.codeium/windsurf/mcp_config.json`. Windsurf was renamed Devin Desktop; if your build reads `~/.config/devin/mcp_config.json` (Windows: `%APPDATA%\devin\mcp_config.json`), copy the entry there. `init` prints the same note.

## Zed

Zed is not an `init` client. Copy the `context_servers.uvcs` entry from `templates/mcp/zed.json` into Zed's settings. It uses the flat `command`, `args`, and `env` format. Pin the version. On Windows, if Zed cannot start the server, use the wrapped `cmd /c npx` form shown above.

## Other clients

Other MCP clients can use the same `command`, `args`, and `env` block. Every variable is described in [Configuration](configuration.md).
