# Security Model

UVCS MCP exposes a fixed allowlist of Plastic SCM / Unity Version Control `cm` commands. It does not expose arbitrary shell execution, `run_cm`, repository deletion, repository rename, or raw `cm api` server startup.

## Modes

- `readonly`: status, branch, locks, diff, and doctor tools.
- `standard`: enables workspace update and checkin prepare/confirm.

## Prepare/confirm

Critical write operations use two calls:

1. A `*_prepare` tool validates inputs, checks workspace state when needed, and returns a short-lived token.
2. A `*_confirm` tool requires the token and exact confirm phrase.

The default token TTL is 300 seconds. The default max file count for checkin is 20.

Prepare/confirm is used for add, branch create, label create, switch, merge, and checkin.

Tool failures are returned to MCP clients as `isError` tool results with a stable error code, details, and a short remediation hint.
