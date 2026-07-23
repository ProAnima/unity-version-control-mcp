# Publishing

UVCS MCP publishes as `@proanima/uvcs-mcp`.

## Release gate

Run the full local release gate before creating a tag or GitHub release:

```bash
npm ci
npm test
npm run lint
npm run check
npm run audit:prod
npm run release:check
npm run smoke:fake
npm run smoke:fleet
npm pack --dry-run
```

The project intentionally does not require a real Plastic SCM / Unity Version Control server in CI. Real-world compatibility is tracked through compatibility reports and maintainer-run validation, while `smoke:fake` covers the MCP transport and tool flow without credentials.

## Release procedure

1. Move completed changelog entries from `Unreleased` to the target version and date.
2. Update `package.json`, `package-lock.json`, `src/server.js`, README, wiki, and release notes.
3. Run the complete release gate.
4. Commit the release metadata to `main` and push.
5. Create and push an annotated `v<version>` tag.
6. Publish a GitHub Release from that tag using the reviewed notes.
7. Confirm the `Publish` workflow succeeds and verify the npm package and provenance.

Example:

```bash
git tag -a v1.2.0 -m "UVCS MCP 1.2.0"
git push origin v1.2.0
gh release create v1.2.0 --title "UVCS MCP 1.2.0" --notes-file docs/releases/v1.2.0.md
```

Publishing the GitHub Release triggers `.github/workflows/publish.yml`.

## Trusted publishing

The `.github/workflows/publish.yml` workflow is designed for npm trusted publishing through GitHub Actions OIDC.

Before publishing from GitHub Actions, configure npm trusted publishing for:

- package: `@proanima/uvcs-mcp`
- repository: `ProAnima/unity-version-control-mcp`
- workflow: `.github/workflows/publish.yml`
- allowed action: `npm publish`

The workflow uses Node.js `24.15.0`, installs the latest npm CLI, runs the full release gate, and publishes with:

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
npm run audit:prod
npm run release:check
npm run smoke:fake
npm run smoke:fleet
npm pack --dry-run
npm publish --access public --provenance
```

Prefer trusted publishing over long-lived npm tokens.
