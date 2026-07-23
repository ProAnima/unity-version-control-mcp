# Security Model

UVCS MCP exposes a fixed allowlist of Plastic SCM / Unity Version Control `cm` commands. It does not expose arbitrary shell execution, `run_cm`, repository deletion, repository rename, or raw `cm api` server startup.

The MCP transport and request lifecycle are handled by the official MCP TypeScript SDK. Tool arguments are validated server-side with strict schemas before UVCS command handlers run.

## Modes

- `readonly`: status, branch, locks, diff, and doctor tools.
- `standard`: enables guarded workspace write tools, including update, add, branch create, label create, switch, merge, and checkin.

## Prepare/confirm

Critical write operations use two calls:

1. A `*_prepare` tool validates inputs, checks workspace state when needed, and returns a short-lived token.
2. A `*_confirm` tool requires the token and exact confirm phrase.

The default token TTL is 300 seconds. The default max file count for checkin is 20.

Prepare/confirm is used for update, add, path-scoped undo, branch create, label create, switch, merge, and checkin.

Confirm steps are serialized per workspace so two write operations cannot run concurrently against the same checkout through this MCP server.

Fleet mode requires a named `workspace` on every tool call. Confirmation tokens include that workspace context and cannot be replayed against another project.

Switch, merge, update, undo, and checkin confirmations revalidate the relevant workspace state after consuming the token. If the branch or pending changes changed after prepare, confirmation is refused and a new prepare call is required. Undo is limited to a specific relative path and refuses the workspace root because UVCS undo is irreversible.

Writes are also coordinated across MCP server processes through `.plastic/uvcs-mcp.write.lock`. This matters when multiple AI clients are configured for the same checkout.

## Workspace and repository allowlists

`UVCS_ALLOWED_WORKSPACES` restricts the server to specific local workspace paths.

`UVCS_ALLOWED_REPOS` restricts the server to specific repository/server identities detected from `.plastic/plastic.workspace`.

Example:

```text
UVCS_ALLOWED_REPOS=pas-Kodeks@SRV-IAN-N:8087
```

Use semicolons for multiple entries.

Client setup always pins `UVCS_ALLOWED_WORKSPACES` to the configured workspace. The `guarded` safety profile detects repository identity from `.plastic/plastic.workspace` when it contains repository metadata, otherwise it uses the read-only `cm status --header --nochanges` identity. If neither is available, an explicit repository allowlist is required. Run `uvcs_setup_status` to inspect the effective policy and workspace identity.

## Process limits

- read timeout: `UVCS_READ_TIMEOUT_MS`, default 30 seconds;
- write timeout: `UVCS_WRITE_TIMEOUT_MS`, default 300 seconds;
- combined stdout/stderr limit: `UVCS_MAX_OUTPUT_BYTES`, default 10 MiB.

Exceeding a limit returns a structured tool error. After any interrupted write command, inspect workspace status before retrying.

Tool failures are returned to MCP clients as `isError` tool results with a stable error code, details, and a short remediation hint.

Cleanup helpers such as `uvcs_cleanup_candidates` and `uvcs_branch_safety_report` are read-only. They provide manual review guidance and do not delete branches, changesets, labels, or files.

## Audit logging

Set `UVCS_AUDIT_LOG` to a local JSONL file path to record tool call audit events:

```text
UVCS_AUDIT_LOG=/var/log/uvcs-mcp-audit.jsonl
```

Audit entries include timestamp, tool name, success status, duration, and error code when available. Tool arguments and confirmation tokens are not written to the audit log.
