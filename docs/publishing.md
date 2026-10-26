# Publishing

UVCS MCP publishes as `@proanima/uvcs-mcp` on npm and as `io.github.ProAnima/uvcs-mcp` in the [MCP Registry](https://registry.modelcontextprotocol.io).

## Release gate

Run the full local release gate on Node.js 22 or newer before creating a tag or GitHub release:

```bash
npm ci
npm test
npm run lint
npm run check
npm audit
npm run audit:prod
npm run release:check
npm run smoke:fake
npm run smoke:fleet
npm run smoke:pack
```

- `npm run check` runs `node --check` on every JavaScript file in `src/` and `scripts/`; new files are picked up automatically.
- `npm run release:check` verifies that the version markers agree, that `server.json` matches `package.json` (name and `mcpName`, versions, npm identifier, description length, icon file, documented environment variables), and fails on any `@proanima/uvcs-mcp@X.Y.Z` pin in README, `SECURITY.md`, `SUPPORT.md`, `CONTRIBUTING.md`, `docs/`, `wiki/`, or `templates/` that does not match `package.json`. Release notes under `docs/releases/` are excluded.
- `npm run smoke:pack` packs the package, installs the tarball into a clean temporary project, and starts the installed server to confirm it lists its tools. It replaces `npm pack --dry-run`; run it through `npm run` so it can locate the npm CLI.

The project intentionally does not require a real Plastic SCM / Unity Version Control server in CI. Real-world compatibility is tracked through compatibility reports and maintainer-run validation, while `smoke:fake` and `smoke:fleet` cover the MCP transport and tool flow with a stateful fake `cm` and no credentials.

CI runs the gate (without the full `npm audit`) on Ubuntu, Windows, and macOS with Node.js 22, 24, and 26.

## Release procedure

1. Move completed changelog entries from `Unreleased` to the target version and date.
2. Update `package.json`, `package-lock.json`, `server.json` (`version` and `packages[0].version`), `src/server.js`, the package spec in `src/cli/init.js`, README, wiki, release notes, and every pinned `@proanima/uvcs-mcp@X.Y.Z` in user-facing docs.
3. Run the complete release gate.
4. Commit the release metadata to `main` and push.
5. Create and push an annotated `v<version>` tag.
6. Publish a GitHub Release from that tag using the reviewed notes.
7. Confirm both jobs of the `Publish` workflow succeed, then verify the npm package, its provenance, and the MCP Registry entry.

Example:

```bash
git tag -a v1.4.1 -m "UVCS MCP 1.4.1"
git push origin v1.4.1
gh release create v1.4.1 --title "UVCS MCP 1.4.1" --notes-file docs/releases/v1.4.1.md
```

Publishing the GitHub Release triggers `.github/workflows/publish.yml`.

## Trusted publishing

The `.github/workflows/publish.yml` workflow is designed for npm trusted publishing through GitHub Actions OIDC.

Before publishing from GitHub Actions, configure npm trusted publishing for:

- package: `@proanima/uvcs-mcp`
- repository: `ProAnima/unity-version-control-mcp`
- workflow: `.github/workflows/publish.yml`
- allowed action: `npm publish`

The workflow uses Node.js `24.15.0` and installs npm `^11.5.1` (trusted publishing requires npm 11.5.1 or later), refuses to continue when the release tag is not `v` followed by the `package.json` version, runs the release gate, and publishes with:

```bash
npm publish --access public --provenance
```

## MCP Registry

The second job of `.github/workflows/publish.yml` publishes `server.json` to the official MCP Registry after the npm job:

1. It waits until npm serves the new version, because the registry checks that the published package declares the same `mcpName` as `server.json`.
2. It downloads `mcp-publisher` at a pinned release (`MCP_PUBLISHER_VERSION`) and verifies its Sigstore bundle with cosign.
3. It runs `mcp-publisher login github-oidc` and `mcp-publisher publish`.

GitHub OIDC is required for the `io.github.ProAnima/*` namespace: the interactive `mcp-publisher login github` device flow can publish only to a personal namespace. No secret is needed; the job uses the `id-token: write` permission.

If only the registry job fails, run the workflow again with `workflow_dispatch` and the same tag. The npm job skips `npm publish` when the version is already on npm.

Check the entry after a release:

```bash
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=io.github.ProAnima/uvcs-mcp"
```

Validate `server.json` against the registry before tagging, without publishing:

```bash
mcp-publisher validate
```

When upgrading `MCP_PUBLISHER_VERSION`, change it deliberately and keep the Sigstore verification; do not switch to the mutable `releases/latest` URL.

## Manual publish fallback

Manual publishing is acceptable only for maintainers with npm account 2FA configured:

```bash
npm ci
npm test
npm run lint
npm run check
npm audit
npm run audit:prod
npm run release:check
npm run smoke:fake
npm run smoke:fleet
npm run smoke:pack
npm publish --access public --provenance
```

Prefer trusted publishing over long-lived npm tokens.
