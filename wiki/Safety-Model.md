# Safety Model

UVCS MCP exposes allowlisted Plastic SCM / Unity Version Control `cm` commands.

It does not expose:

- arbitrary shell execution;
- arbitrary `cm` execution;
- repository delete;
- repository rename;
- branch or changeset delete;
- raw `cm api` startup.

Default mode:

```text
UVCS_MCP_MODE=readonly
```

Write mode:

```text
UVCS_MCP_MODE=standard
```

Any other value falls back to `readonly` and produces a warning in `uvcs_setup_status`.

Every write uses a `*_prepare` tool and a matching `*_confirm` tool with a short-lived, single-use token. The agent must show the prepare result and confirm only after the user approves that exact operation. Configure your MCP client to auto-approve only read-only tools: every tool carries MCP annotations, and all `*_confirm` tools are marked as writes (undo, update, switch, and merge as destructive).

Switch, merge, update, undo, and checkin revalidate workspace state after prepare. Multiple MCP processes coordinate writes through a workspace lock file.

A checkin always includes all tracked pending changes in the workspace. Private and ignored files are not included and do not count toward the checkin limit.

Item paths must stay inside the workspace and cannot start with `-`; branch and label names cannot start with `-` either, so no input can be parsed by `cm` as an option.

Safety profiles:

- `readonly`: inspection only;
- `guarded`: writes with workspace and repository allowlists;
- `standard`: writes with workspace pinning and optional repository allowlist.

When configured, `UVCS_ALLOWED_WORKSPACES` and `UVCS_ALLOWED_REPOS` restrict the server to approved local workspace paths and repository/server identities.

Details: [Security Model](https://github.com/ProAnima/unity-version-control-mcp/blob/main/docs/security.md), [Configuration](https://github.com/ProAnima/unity-version-control-mcp/blob/main/docs/configuration.md).
