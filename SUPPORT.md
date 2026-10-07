# Support

Use GitHub Issues for:

- reproducible bugs;
- setup failures;
- MCP client config problems;
- Plastic SCM / Unity Version Control compatibility reports;
- feature requests for new source-control workflows.

Before opening an issue, run:

```text
uvcs_doctor
```

Or from a terminal:

```bash
npx -y @proanima/uvcs-mcp@1.3.0 doctor --workspace="D:/Repositories/YourWorkspace"
```

From a checkout, use `node src/cli.js doctor --workspace="D:/Repositories/YourWorkspace"`.

Also include:

- the UVCS MCP version and Node.js version (22 or newer is required);
- the `warnings` from `uvcs_setup_status`;
- the `error.code` and `hint` of the failing tool result.

Please include sanitized output only. Remove server credentials, access tokens, private paths, repository and server names, and proprietary repository contents. See [docs/troubleshooting.md](docs/troubleshooting.md) for common errors and [docs/configuration.md](docs/configuration.md) for settings.

For security reports, use [SECURITY.md](SECURITY.md).

For maintainer contact:

```text
proanimastudio@gmail.com
```

