# Configuration

UVCS MCP is configured only through environment variables in the MCP client configuration (the `env` block of the server entry) or, in fleet mode, through a workspace manifest. `uvcs-mcp init` writes these values for you; this page is the complete reference.

Settings never come from files inside the workspace, so repository content cannot grant itself additional privileges. Values are read once when the server starts: restart the MCP client after changing them.

## Parsing rules

- Lists use `;` as the separator. Whitespace around entries is trimmed and empty entries are ignored.
- Numeric values must be positive integers. Any other value is ignored with a warning and the default is used.
- `UVCS_MCP_MODE` must be exactly `readonly` or `standard` (case-sensitive, surrounding whitespace ignored). Any other value falls back to `readonly` with a warning.
- Warnings are written to stderr at startup as `[uvcs-mcp] <workspace name>: <warning>` and are listed in `warnings` of `uvcs_policy_status` (and `policy.warnings` of `uvcs_setup_status`).
- Relative paths resolve against the working directory of the server process, which the MCP client chooses. Use absolute paths in client configuration.

## Environment variables

### Workspace and identity

| Variable | Default | Meaning |
| --- | --- | --- |
| `UVCS_WORKSPACE` | unset | Root of the Plastic SCM / Unity Version Control workspace (the folder that contains `.plastic`). Every workspace `cm` command runs with this folder as its working directory. Required for every tool except `uvcs_doctor`, which then checks only `cm`. Unset: `WORKSPACE_REQUIRED`. If the folder does not exist, `cm`-backed tools fail with `WORKSPACE_NOT_FOUND`; with `UVCS_ALLOWED_REPOS` set, the identity check runs first and fails with `REPOSITORY_NOT_ALLOWED` and an empty `detected` list. |
| `UVCS_WORKSPACE_NAME` | `uvcs` | Display name reported by `uvcs_policy_status` / `uvcs_setup_status` and used as the prefix of startup warnings. `init` sets it to the MCP server name; fleet mode sets it to the manifest `name`. |
| `UVCS_SAFETY_PROFILE` | `readonly` in readonly mode, else `standard` | Profile label (`readonly`, `guarded`, or `standard`) reported by the policy tools. It does not enable or restrict anything by itself: a profile's protection comes from the variables `init` writes for it (see [Safety profiles](#safety-profiles)). In fleet mode the manifest `safety` value is validated and enforced at startup. |
| `UVCS_FLEET_MANIFEST` | unset | Path to a [fleet manifest](#fleet-manifest). When set, the server serves every workspace in the manifest and ignores per-workspace `UVCS_*` variables from its own environment. |

### Write policy

| Variable | Default | Meaning |
| --- | --- | --- |
| `UVCS_MCP_MODE` | `readonly` | `readonly` or `standard`. `standard` enables the prepare/confirm write tools; in `readonly` they fail with `STANDARD_MODE_REQUIRED`. Fails closed: an unrecognized value means `readonly`. |
| `UVCS_ALLOWED_WORKSPACES` | empty (no restriction) | `;`-separated workspace paths. When set, `UVCS_WORKSPACE` must match one entry after symlink/junction resolution (case-insensitive on Windows), otherwise every tool fails with `WORKSPACE_NOT_ALLOWED`. `init` always pins it to the configured workspace. Empty in `standard` mode produces a policy warning. |
| `UVCS_ALLOWED_REPOS` | empty (no restriction) | `;`-separated `repository@server:port` identities, compared case-insensitively. When set, every tool (and `uvcs_doctor` when a workspace is set) checks the workspace identity. The identity is read from `.plastic/plastic.workspace`; when that file has no repository metadata, from `cm wi --machinereadable` (local metadata, works while the server is unreachable); and only then from `cm status --header --nochanges`. A mismatch fails with `REPOSITORY_NOT_ALLOWED`. Set by the `guarded` profile. Empty in `standard` mode produces a policy warning. |
| `UVCS_CHECKIN_MAX_FILES` | `20` | Maximum number of tracked pending changes for `uvcs_checkin_prepare` and `uvcs_checkin_confirm` (`CHECKIN_TOO_LARGE`). Private and ignored items are not counted. Because a checkin always includes every tracked pending change in the workspace, this limits the whole pending set, not a selection. |
| `UVCS_TOKEN_TTL_SEC` | `300` | Lifetime of prepare/confirm tokens in seconds. An expired token is refused with `CONFIRM_TOKEN_EXPIRED`, or with `CONFIRM_TOKEN_INVALID` once a later prepare has pruned it. The `guarded` profile writes `120`. |
| `UVCS_AUDIT_LOG` | unset (disabled) | Path of a JSONL audit file. Missing parent folders are created. Each line holds `ts`, `tool`, `ok`, `durationMs`, and `errorCode` on failure; tool arguments and tokens are never written. Unset in `standard` mode produces a policy warning. |

### `cm` process

| Variable | Default | Meaning |
| --- | --- | --- |
| `UVCS_CM_PATH` | `cm` (looked up on `PATH`) | `cm` executable. `init` detects it on `PATH` and in standard install folders and writes the full path. |
| `UVCS_CM_ARGS` | empty | `;`-separated arguments inserted before every `cm` argument list. Intended for wrappers and tests, for example `UVCS_CM_PATH=node` with `UVCS_CM_ARGS=scripts/fake-cm.js`. Still passed as argv without a shell. |
| `UVCS_CM_OUTPUT_ENCODING` | `auto` | Character encoding used to decode `cm` output. `auto`: strict UTF-8 first; on Windows, output that is not valid UTF-8 is decoded with the system OEM and ANSI code pages read from the registry, and the most readable result is used. Any [WHATWG encoding label](https://encoding.spec.whatwg.org/#names-and-labels) forces one encoding, for example `utf-8`, `ibm866`, or `windows-1251`. An unknown label falls back to UTF-8. |
| `UVCS_READ_TIMEOUT_MS` | `30000` | Timeout for read-only `cm` commands. Exceeding it terminates the process and returns `PROCESS_TIMEOUT`. |
| `UVCS_WRITE_TIMEOUT_MS` | `300000` | Timeout for mutating `cm` commands (update, add, undo, branch create, label create, switch, merge, checkin). Exceeding it terminates the process and returns `WRITE_INTERRUPTED_STATE_UNKNOWN`. |
| `UVCS_MAX_OUTPUT_BYTES` | `10485760` (10 MiB) | Limit for the combined stdout and stderr of one `cm` command. Exceeding it terminates the process and returns `PROCESS_OUTPUT_TOO_LARGE` for reads or `WRITE_INTERRUPTED_STATE_UNKNOWN` for writes. |

Every `cm` process runs without a shell, with stdin closed, and with `LC_ALL=C.UTF-8` added to the inherited environment.

### Removed variables

- `UVCS_LOCALE` was removed in `1.3.0`. It was never used; setting it has no effect.

## Safety profiles

A profile is a set of the variables above. `uvcs-mcp init --safety=<profile>` writes them:

| Profile | `UVCS_MCP_MODE` | Also written |
| --- | --- | --- |
| `readonly` (default) | `readonly` | `UVCS_ALLOWED_WORKSPACES` pinned to the workspace. |
| `guarded` | `standard` | `UVCS_ALLOWED_WORKSPACES` pinned; `UVCS_ALLOWED_REPOS` from `--allowed-repos` or detected from the workspace (setup fails when it cannot be detected); `UVCS_CHECKIN_MAX_FILES=20`; `UVCS_TOKEN_TTL_SEC=120`. |
| `standard` | `standard` | `UVCS_ALLOWED_WORKSPACES` pinned; no repository allowlist. Use only for trusted or disposable workspaces. |

All profiles also write `UVCS_WORKSPACE`, `UVCS_WORKSPACE_NAME`, `UVCS_SAFETY_PROFILE`, and, when `cm` was found, `UVCS_CM_PATH`. Optional `init` flags such as `--audit-log` or `--read-timeout-ms` write the matching variable.

## Fleet manifest

`UVCS_FLEET_MANIFEST` points to a JSON file that describes up to 50 named workspaces served by one process. Start from `templates/fleet/workspaces.example.json`; `templates/fleet/workspaces.schema.json` provides editor completion. See [Multi-Workspace](multi-workspace.md) for the workflow.

The manifest is validated strictly at startup. Unknown keys, a wrong `version`, invalid names or numbers, a `mode` that does not match `safety`, duplicate names, and duplicate paths stop the server with an error instead of falling back to defaults.

### Top-level keys

| Key | Required | Meaning |
| --- | --- | --- |
| `$schema` | no | Editor hint; ignored by the server. |
| `version` | yes | Must be `1`. |
| `defaults` | no | Settings applied to every workspace unless the entry sets its own value. Accepts the [settings keys](#settings-keys). |
| `workspaces` | yes | Array of 1 to 50 workspace entries. |

### Workspace entry keys

| Key | Required | Meaning |
| --- | --- | --- |
| `name` | yes | Workspace selector passed as `workspace` on every fleet tool call; also becomes `UVCS_WORKSPACE_NAME`. Lowercase letters, digits, and dashes; starts with a letter or digit; at most 63 characters; unique in the manifest. |
| `path` | yes | Workspace root, relative to the manifest folder or absolute. Becomes `UVCS_WORKSPACE` and the only entry of `UVCS_ALLOWED_WORKSPACES`. Two entries cannot resolve to the same path (case-insensitive on Windows). |

An entry also accepts every settings key.

### Settings keys

| Key | Variable | Default | Notes |
| --- | --- | --- | --- |
| `safety` | `UVCS_SAFETY_PROFILE` | `readonly` | `readonly`, `guarded`, or `standard`. |
| `mode` | `UVCS_MCP_MODE` | derived from `safety` | Optional. Must be `readonly` for `readonly`, `standard` for `guarded` and `standard`. |
| `allowedRepos` | `UVCS_ALLOWED_REPOS` | `[]` | Array of `repository@server:port` strings. With `guarded` and no value, the identity is detected from the workspace at startup; if detection fails, startup fails with a message that names the workspace and suggests pinning `allowedRepos`. |
| `cmPath` | `UVCS_CM_PATH` | process `UVCS_CM_PATH`, else `cm` | |
| `checkinMaxFiles` | `UVCS_CHECKIN_MAX_FILES` | `20` | |
| `tokenTtlSec` | `UVCS_TOKEN_TTL_SEC` | `300`; `120` for `guarded` | |
| `auditLog` | `UVCS_AUDIT_LOG` | disabled | Relative to the manifest folder. Use a separate file per workspace. |
| `readTimeoutMs` | `UVCS_READ_TIMEOUT_MS` | `30000` | |
| `writeTimeoutMs` | `UVCS_WRITE_TIMEOUT_MS` | `300000` | |
| `maxOutputBytes` | `UVCS_MAX_OUTPUT_BYTES` | `10485760` | |
| `installSource` | none | `npm` | `npm` or `local`. Used only by `uvcs-mcp init` to build the launch command; ignored by the server. |

### Process environment in fleet mode

Per-workspace settings come only from the manifest. Of the server's own `UVCS_*` variables, only `UVCS_CM_PATH`, `UVCS_CM_ARGS`, and `UVCS_CM_OUTPUT_ENCODING` are shared with every workspace; all others, such as `UVCS_ALLOWED_REPOS`, `UVCS_AUDIT_LOG`, or `UVCS_CHECKIN_MAX_FILES`, are ignored so that one value cannot silently apply to every workspace. Non-`UVCS_*` variables such as `PATH` are inherited as usual.

## Checking the effective configuration

- `uvcs_setup_status` and `uvcs_policy_status` report the workspace, profile, mode, allowlists, limits, audit path, and configuration warnings.
- `uvcs-mcp doctor --workspace=<path>` or `uvcs-mcp doctor --manifest=<file>` checks `cm` and each workspace before the MCP client starts the server.
