# Security Policy

## Supported Versions

Security fixes target the current release line.

| Version | Supported |
| --- | --- |
| `1.x` | Yes |
| `0.3.x` | Security fixes only |
| `< 0.3` | No |

Users of `1.2.x` and earlier should upgrade to `1.3.0` or newer. It fixes option injection through item paths and branch/label names, which in write-enabled workspaces allowed a recursive undo from the workspace root; see [docs/security-review.md](docs/security-review.md).

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
- write tools are gated by `UVCS_MCP_MODE=standard`; an unrecognized mode means `readonly`;
- every write tool uses prepare/confirm tokens, and MCP tool annotations mark confirm tools as writes so clients can require human approval;
- fleet calls require an explicit workspace and confirmation tokens cannot cross workspaces;
- workspace and repository allowlists are enforced when configured;
- file paths are constrained to `UVCS_WORKSPACE`, and paths, branch names, and label names cannot start with `-`, so they are never parsed by `cm` as options;
- `cm` runs without a shell and with stdin closed, under read/write timeouts and an output limit.

See [docs/security.md](docs/security.md) for the operational model, [docs/security-review.md](docs/security-review.md) for reviewed findings, and [docs/configuration.md](docs/configuration.md) for every setting.

## Disclosure

Maintainers will acknowledge valid reports as soon as practical, investigate the issue, and publish a fix or mitigation before public disclosure when possible.
