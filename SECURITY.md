# Security Policy

## Supported Versions

Security fixes target the current release line.

| Version | Supported |
| --- | --- |
| `1.x` | Yes |
| `0.3.x` | Security fixes only |
| `< 0.3` | No |

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
- fleet calls require an explicit workspace and confirmation tokens cannot cross workspaces;
- workspace and repository allowlists are enforced when configured;
- file paths are constrained to `UVCS_WORKSPACE`.

See [docs/security.md](docs/security.md) for the operational model.

## Disclosure

Maintainers will acknowledge valid reports as soon as practical, investigate the issue, and publish a fix or mitigation before public disclosure when possible.
