# Publishing

UVCS MCP publishes as `@proanima/uvcs-mcp`.

## Release gate

Run the full local release gate before creating a tag or GitHub release:

```bash
npm ci
npm test
npm run lint
npm run check
npm run release:check
npm run smoke:fake
npm pack --dry-run
```

The project intentionally does not require a real Plastic SCM / Unity Version Control server in CI. Real-world compatibility is tracked through compatibility reports and maintainer-run validation, while `smoke:fake` covers the MCP transport and tool flow without credentials.

## Trusted publishing

The `.github/workflows/publish.yml` workflow is designed for npm trusted publishing through GitHub Actions OIDC.

Before publishing from GitHub Actions, configure npm trusted publishing for:

- package: `@proanima/uvcs-mcp`
- repository: `ProAnima/unity-version-control-mcp`
- workflow: `.github/workflows/publish.yml`
- allowed action: `npm publish`

The workflow uses Node.js `22.14.0`, installs the latest npm CLI, runs the full release gate, and publishes with:

```bash
npm publish --access public --provenance
```

## Manual publish fallback

Manual publishing is acceptable only for maintainers with npm account 2FA configured:

```bash
npm ci
npm test
npm run lint
npm run check
npm run release:check
npm run smoke:fake
npm pack --dry-run
npm publish --access public --provenance
```

Prefer trusted publishing over long-lived npm tokens.
