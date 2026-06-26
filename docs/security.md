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

Prepare/confirm is used for update, add, branch create, label create, switch, merge, and checkin.

Confirm steps are serialized per workspace so two write operations cannot run concurrently against the same checkout through this MCP server.

## Workspace and repository allowlists

`UVCS_ALLOWED_WORKSPACES` restricts the server to specific local workspace paths.

`UVCS_ALLOWED_REPOS` restricts the server to specific repository/server identities detected from `.plastic/plastic.workspace`.

Example:

```text
UVCS_ALLOWED_REPOS=pas-Kodeks@SRV-IAN-N:8087
```

Use semicolons for multiple entries.

Tool failures are returned to MCP clients as `isError` tool results with a stable error code, details, and a short remediation hint.

## Audit logging

Set `UVCS_AUDIT_LOG` to a local JSONL file path to record tool call audit events:

```text
UVCS_AUDIT_LOG=/var/log/uvcs-mcp-audit.jsonl
```

Audit entries include timestamp, tool name, success status, duration, and error code when available. Tool arguments and confirmation tokens are not written to the audit log.
