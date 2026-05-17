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

When configured, `UVCS_ALLOWED_WORKSPACES` and `UVCS_ALLOWED_REPOS` restrict the server to approved local workspace paths and repository/server identities.
