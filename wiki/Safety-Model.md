# Safety Model

UVCS MCP exposes allowlisted Plastic SCM / Unity Version Control `cm` commands.

It does not expose:

- arbitrary shell execution;
- arbitrary `cm` execution;
- repository delete;
- repository rename;
- raw `cm api` startup.

Default mode:

```text
UVCS_MCP_MODE=readonly
```

Write mode:

```text
UVCS_MCP_MODE=standard
```

Critical write operations use prepare/confirm tokens.

Switch, merge, update, and checkin revalidate workspace state after prepare. Multiple MCP processes coordinate writes through a workspace lock file.

Safety profiles:

- `readonly`: inspection only;
- `guarded`: writes with workspace and repository allowlists;
- `standard`: writes with workspace pinning and optional repository allowlist.

When configured, `UVCS_ALLOWED_WORKSPACES` and `UVCS_ALLOWED_REPOS` restrict the server to approved local workspace paths and repository/server identities.
