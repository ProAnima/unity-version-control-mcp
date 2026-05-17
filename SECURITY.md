# Security Policy

## Supported Versions

Security fixes target the current release line.

| Version | Supported |
| --- | --- |
| `0.2.x-alpha` | Yes |
| `0.1.x-alpha` | No |

## Reporting a Vulnerability

Please do not open a public issue for a vulnerability.

Send a report to:

```text
proanimastudio@gmail.com
```

Include:

- affected version or commit;
- operating system;
- MCP client;
- Plastic SCM / Unity Version Control version;
- a minimal reproduction;
- impact and whether arbitrary command execution, unintended repository mutation, credential exposure, or path escape is involved.

Do not include real access tokens, passwords, private server credentials, or proprietary repository contents.

## Security Model

UVCS MCP is designed as a constrained source-control bridge:

- no arbitrary shell execution;
- no arbitrary `cm` command execution;
- no repository deletion or repository rename tools;
- no raw `cm api` server startup;
- write tools are gated by `UVCS_MCP_MODE=standard`;
- critical write tools use prepare/confirm tokens;
- workspace and repository allowlists are enforced when configured;
- file paths are constrained to `UVCS_WORKSPACE`.

See [docs/security.md](docs/security.md) for the operational model.

## Disclosure

Maintainers will acknowledge valid reports as soon as practical, investigate the issue, and publish a fix or mitigation before public disclosure when possible.
