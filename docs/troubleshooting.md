# Troubleshooting

Use `uvcs_doctor` first. It checks Node.js, the `cm` CLI, the configured workspace, current branch context, server access, and whether optional API discovery is available.

```bash
npx -y @proanima/uvcs-mcp@1.3.0 doctor --workspace="D:/Repositories/YourWorkspace"
```

From a git checkout, run `node src/cli.js doctor` with the same options. `doctor` reports a missing path (`Workspace path not found`) or a folder without `.plastic/plastic.workspace` (`Not a UVCS workspace`) directly instead of a `cm` error, and exits with code 1 when any check fails.

For MCP clients, ask the agent to run:

```text
uvcs_doctor
```

Then call `uvcs_setup_status` and read its `policy.warnings`: configuration mistakes, such as an unrecognized `UVCS_MCP_MODE` or a non-numeric limit, are reported there and on the server's stderr. All variables are described in [Configuration](configuration.md).

## `cm` is not found

UVCS MCP uses the official Plastic SCM / Unity Version Control `cm` CLI. It does not ship its own SCM client. The error code is `PROCESS_SPAWN_FAILED`.

`init` looks for `cm` on `PATH` and in the standard install folders and writes the absolute path as `UVCS_CM_PATH`. GUI clients, especially on macOS, often start without the shell `PATH`, so a config without `UVCS_CM_PATH` can fail even though `cm` works in a terminal. When `doctor` cannot start `cm` but finds it elsewhere, it prints the path to use.

Fix:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 init --client=cursor --workspace="D:/Repositories/YourWorkspace" --cm="/path/to/cm"
```

Or set:

```text
UVCS_CM_PATH=/path/to/cm
```

On Windows, the standard location is `C:\Program Files\PlasticSCM5\client\cm.exe`.

## The client cannot start the server on Windows

On Windows `npx` is a `.cmd` shim. Clients that start MCP servers without a shell, such as Claude Code on native Windows and Codex, cannot launch it, and the server never appears. `init` therefore writes:

```json
{
  "command": "cmd",
  "args": ["/c", "npx", "-y", "@proanima/uvcs-mcp@1.3.0"]
}
```

If you wrote the entry by hand with `"command": "npx"`, switch to this form or re-run `init`. It works in every client and client version.

## Workspace is not set or does not exist

Set `UVCS_WORKSPACE` to an existing Plastic SCM / Unity Version Control source-control workspace (`WORKSPACE_REQUIRED` when it is missing).

```json
{
  "env": {
    "UVCS_WORKSPACE": "D:/Repositories/YourWorkspace"
  }
}
```

The path must point to a workspace checkout, not merely to a repository name, Unity Editor installation, or empty folder. If the folder does not exist, `cm`-backed tools return `WORKSPACE_NOT_FOUND` instead of a misleading "cm not found" error. With a repository allowlist (`guarded`), the identity check runs first, so a missing folder shows up as `REPOSITORY_NOT_ALLOWED` with an empty `detected` list.

## Workspace cannot reach the server

Run the official CLI directly:

```bash
cm status
```

If this fails outside MCP, fix the local Plastic SCM / Unity Version Control client first:

- log in with the official client;
- verify the server URL and port;
- verify VPN or network access;
- verify that the workspace still exists and is bound to the expected repository.

The server runs `cm` with stdin closed. A command that would ask for credentials or another answer fails immediately instead of waiting for the timeout; complete the login in the official client and retry.

## Write tools are blocked

Write tools require:

```text
UVCS_MCP_MODE=standard
```

The value must be exactly `readonly` or `standard`. Anything else, such as `Standard` or `write`, falls back to `readonly` with a warning, and write tools fail with `STANDARD_MODE_REQUIRED`.

Every write tool also requires its matching prepare/confirm flow, for example:

```text
uvcs_checkin_prepare
uvcs_checkin_confirm
```

This is intentional. `readonly` is the default mode for safer first-time installs.

## Repository is not allowed

If `UVCS_ALLOWED_REPOS` is set, the workspace repository/server identity must match one of the configured entries (`REPOSITORY_NOT_ALLOWED`).

Example:

```text
UVCS_ALLOWED_REPOS=MyGame@uvcs.example.com:8087
```

Run `uvcs_doctor` and check the detected workspace file fields, or compare `detected` in the error details. If the workspace is correct, add the detected repo identity to `UVCS_ALLOWED_REPOS`. If it is not correct, point `UVCS_WORKSPACE` to the intended checkout.

## Checkin is refused

- `NOTHING_TO_CHECKIN`: there are no tracked pending changes. New files are private until they are added; use `uvcs_add_prepare` / `uvcs_add_confirm` first.
- `CHECKIN_TOO_LARGE`: the workspace has more tracked pending changes than `UVCS_CHECKIN_MAX_FILES` (default 20). Private and ignored files are not counted.
- `INVALID_CHECKIN_MESSAGE`: the message must be a non-empty single line.

A checkin always includes all tracked pending changes in the workspace, not a selection. Review `uvcs_pending_changes` before preparing it, and keep each Unity asset and its `.meta` file in the same checkin.

## Confirm is refused

- `CONFIRM_TOKEN_INVALID`, `CONFIRM_TOKEN_EXPIRED`, `CONFIRM_TOKEN_ACTION_MISMATCH`: tokens are single-use, expire after `UVCS_TOKEN_TTL_SEC`, and belong to one action. Run the matching prepare tool again.
- `INVALID_CONFIRM_PHRASE`: pass the exact phrase returned by the prepare tool.
- `WORKSPACE_CHANGED_SINCE_PREPARE`: the branch or tracked pending changes changed after prepare. Do not retry the same confirm; inspect `uvcs_pending_changes`, then prepare again.
- `PENDING_CHANGES_BLOCK_SWITCH`, `PENDING_CHANGES_BLOCK_MERGE`: check in or undo tracked pending changes first. Private and ignored files do not block switch or merge.

## A write was interrupted

`WRITE_INTERRUPTED_STATE_UNKNOWN` means a mutating `cm` command hit `UVCS_WRITE_TIMEOUT_MS` or `UVCS_MAX_OUTPUT_BYTES` and was terminated. The operation may have been partly applied. Do not retry blindly: inspect `uvcs_pending_changes` and `uvcs_branch_info`, report the state to the user, and prepare again only if needed. Raise the limit only when the command is expected to take longer or print more.

## Workspace is locked

`WORKSPACE_WRITE_LOCKED` means another MCP process is writing to the same workspace through `.plastic/uvcs-mcp.write.lock`. Wait for it to finish, then inspect status before retrying. A lock left by a process that no longer exists on the same machine is reclaimed automatically; any other lock becomes stale 2 minutes after its last heartbeat.

## MCP client does not see `uvcs_*` tools

Check the generated client config for your client:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 init --client=cursor --workspace="D:/Repositories/YourWorkspace" --print-config
```

The preview shows the target file and whether it would be created, merged, or is unchanged. Then:

- restart the MCP client;
- confirm the config file path for that client in [Clients](clients.md); project files are written into the workspace folder unless `--project-dir` was passed, so open that folder as the project;
- verify that Node.js 22 or newer is available to the client process;
- on Windows, check that the entry uses `cmd /c npx` (see above);
- run `doctor` manually with the same workspace.

## `init` refuses to write

- `Cannot update this client config; nothing was written`: a target file is not valid JSON (comments and trailing commas are not supported), an `opencode.jsonc` file exists next to `opencode.json`, or the Codex `uvcs` server is defined as an inline table or with dotted keys. Fix the file, or re-run with `--skip-invalid` to configure the other clients and print the entry to add by hand.
- `Refusing to write project client configs ... into the uvcs-mcp package folder`: `init` was run from a clone without a workspace. Pass `--workspace=<workspace>` or `--project-dir=<project folder>`.
- `Unknown option` or `Unknown client` (exit code 2): run `uvcs-mcp init --help` for the valid options and clients.
- A guarded setup that cannot detect the repository prints the `cm` error and an `--allowed-repos=repo@server:8087` example. Pass the identity explicitly.

Changed files are backed up as `<file>.<YYYYMMDDHHmmss>.bak`; restore a backup by copying it over the file.

## Garbled `cm` output on Windows

`cm` writes redirected output in the console code page rather than UTF-8, for example cp866 (OEM) or cp1251 (ANSI) on Russian Windows. The server decodes it automatically: valid UTF-8 is used as is; otherwise it tries the system OEM and ANSI code pages, read from the registry, and keeps the most readable result. Running `chcp 65001` is not needed.

If branch names, comments, or paths still look wrong, force the encoding in the MCP client configuration:

```text
UVCS_CM_OUTPUT_ENCODING=ibm866
```

Any WHATWG encoding label works, for example `utf-8`, `ibm866`, or `windows-1251`. The default is `auto`.

Prefer quoted paths in examples and configs:

```powershell
npx -y @proanima/uvcs-mcp@1.3.0 init --client=cursor --workspace="D:\Repositories\YourWorkspace"
```

## Unexpected `.meta` findings

`uvcs_unity_meta_diagnostics` follows Unity import rules. It scans `Assets/` and the contents of embedded package folders under `Packages/`, skips hidden items (`.name`), names ending with `~` (such as `Samples~`), `cvs` folders, and `*.tmp` files, and does not expect `.meta` files for `Packages/manifest.json` or `Packages/packages-lock.json`. Results are capped at 500 findings; `truncated: true` means there are more.

## Branch, label, or merge command fails

UVCS MCP wraps documented `cm` commands, but server permissions and branch policies are still enforced by Plastic SCM / Unity Version Control.

Check:

- the target branch, label, or changeset exists;
- the user has permission to create branches, create labels, merge, or check in;
- the workspace has no unexpected pending changes before switching or merging;
- the branch naming policy, if your organization has one, is satisfied;
- branch and label names do not start with `-` (`INVALID_BRANCH_SPEC`, `INVALID_LABEL_NAME`).

## Error codes

Every tool failure is an `isError` result with `error.code`, `error.details`, and, for most codes, a `hint`.

| Code | Meaning |
| --- | --- |
| `WORKSPACE_REQUIRED` | `UVCS_WORKSPACE` is not set. |
| `WORKSPACE_NOT_FOUND` | The workspace folder does not exist. |
| `WORKSPACE_NOT_ALLOWED` | The workspace is not in `UVCS_ALLOWED_WORKSPACES`. |
| `REPOSITORY_NOT_ALLOWED` | The workspace identity is not in `UVCS_ALLOWED_REPOS`. |
| `STANDARD_MODE_REQUIRED` | A write tool was called in `readonly` mode. |
| `PATH_OUTSIDE_WORKSPACE` | The item path resolves outside the workspace. |
| `INVALID_PATH` | The item path is empty, starts with `-`, or contains control characters. |
| `UNDO_WORKSPACE_ROOT_FORBIDDEN` | Undo targeted the workspace root. |
| `CONFIRM_TOKEN_INVALID` | Unknown, already used, or pruned token. |
| `CONFIRM_TOKEN_EXPIRED` | The token is older than `UVCS_TOKEN_TTL_SEC`. |
| `CONFIRM_TOKEN_ACTION_MISMATCH` | The token belongs to another action. |
| `CONFIRM_TOKEN_CONTEXT_MISMATCH` | The token belongs to another workspace. |
| `INVALID_CONFIRM_PHRASE` | The confirm phrase does not match exactly. |
| `WORKSPACE_CHANGED_SINCE_PREPARE` | Workspace state changed between prepare and confirm. |
| `NOTHING_TO_CHECKIN` | No tracked pending changes. |
| `CHECKIN_TOO_LARGE` | More tracked pending changes than `UVCS_CHECKIN_MAX_FILES`. |
| `PENDING_CHANGES_BLOCK_SWITCH`, `PENDING_CHANGES_BLOCK_MERGE` | Tracked pending changes exist. |
| `WRITE_INTERRUPTED_STATE_UNKNOWN` | A mutating `cm` command was terminated; its effect is unknown. |
| `WORKSPACE_WRITE_LOCKED` | Another MCP process holds the workspace write lock. |
| `PROCESS_TIMEOUT` | A read-only `cm` command exceeded `UVCS_READ_TIMEOUT_MS`. |
| `PROCESS_OUTPUT_TOO_LARGE` | A read-only `cm` command exceeded `UVCS_MAX_OUTPUT_BYTES`. |
| `PROCESS_SPAWN_FAILED` | `cm` could not be started. |
| `CM_COMMAND_FAILED` | `cm` exited with an error; details contain truncated stdout/stderr. |
| `FLEET_WORKSPACE_REQUIRED`, `FLEET_WORKSPACE_UNKNOWN` | A fleet call is missing a valid `workspace` selector. |

## Compatibility report

If a command behaves differently on a new Plastic SCM / Unity Version Control version, open a compatibility issue and include:

- operating system;
- MCP client;
- `cm version`;
- product branding, if visible;
- cloud, on-premises, or local server;
- sanitized `uvcs_doctor` output;
- the failing `uvcs_*` tool name;
- expected result and actual result.
