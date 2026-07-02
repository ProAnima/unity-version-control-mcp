# Automation Style

UVCS MCP can read optional naming rules from:

```text
.uvcs-mcp/style.json
```

If the file is missing, the server uses built-in defaults. The setup tools help agents notice missing project conventions and ask the user whether to create them. Preview and planning tools help agents produce consistent branch names, checkin comments, release branch names, labels, and review windows before running any write tools.

Workspace style files can also extend a central JSON policy:

```json
{
  "extends": "../../.uvcs-mcp/style.json"
}
```

Relative `extends` paths are resolved from the workspace `.uvcs-mcp/style.json` file. Local values override the inherited style.

## Default style

```json
{
  "version": 1,
  "release": {
    "baseBranch": "/main",
    "branchPattern": "{baseBranch}/release/v{version}",
    "labelPattern": "v{version}",
    "branchCommentPattern": "Release {version}",
    "labelCommentPattern": "Release {version}",
    "checkinMessagePattern": "release: prepare v{version}",
    "versionFile": "package.json"
  },
  "branches": {
    "allowedTypes": ["feature", "fix", "release", "hotfix", "refactor", "docs", "test", "chore"],
    "branchPattern": "{baseBranch}/{type}/{slug}",
    "slugMaxLength": 60
  },
  "checkins": {
    "allowedTypes": ["feat", "fix", "refactor", "docs", "test", "chore", "release"],
    "messagePattern": "{type}: {summary}",
    "summaryMaxLength": 120
  }
}
```

## Tools

### `uvcs_style_rules`

Returns the active style config and whether it came from `.uvcs-mcp/style.json` or built-in defaults.

Input:

```json
{}
```

Use when an agent needs to inspect naming rules before creating a branch, checkin, label, or release plan.

### `uvcs_style_setup_check`

Checks whether `.uvcs-mcp/style.json` exists. If it is missing, the response includes a suggested question the model should ask the user before branch or release work.

Input:

```json
{}
```

Recommended first-run behavior:

```text
uvcs_style_setup_check
ask the user whether to create project naming rules
uvcs_style_init_prepare
uvcs_style_init_confirm
```

### `uvcs_style_init_prepare` / `uvcs_style_init_confirm`

Creates `.uvcs-mcp/style.json` from a preset. This is a guarded write operation and requires `UVCS_MCP_MODE=standard`, a prepare token, and the returned confirm phrase.

Prepare input:

```json
{
  "preset": "unity",
  "baseBranch": "/main",
  "branchPrefix": "PROJ-",
  "versionFile": "ProjectSettings/ProjectVersion.txt"
}
```

Presets:

- `unity`: Unity-friendly defaults using feature/fix/release branch types and conventional checkin prefixes.
- `conventional`: conventional-commit-like branch and checkin types.
- `minimal`: small teams that want simple branch and message rules.

### `uvcs_name_preview`

Previews a branch name or checkin message without mutating the workspace.

Branch input:

```json
{
  "kind": "branch",
  "type": "feature",
  "title": "Add release automation",
  "baseBranch": "/main"
}
```

Branch output example:

```text
/main/feature/add-release-automation
```

Checkin input:

```json
{
  "kind": "checkin",
  "type": "feat",
  "summary": "add release automation"
}
```

Checkin output example:

```text
feat: add release automation
```

### `uvcs_release_plan`

Plans a semantic release branch, label, comments, and checkin message from style rules. It does not create the branch or label by itself.

Input:

```json
{
  "releaseType": "minor",
  "currentVersion": "1.2.3",
  "projectName": "hp-kidalki"
}
```

For projects that use user-provided release numbers instead of semantic bumps, pass `releaseVersion`:

```json
{
  "releaseVersion": "2.1",
  "projectName": "hp-kidalki"
}
```

Release patterns can use `{baseBranch}`, `{version}`, `{releaseVersion}`, `{currentVersion}`, `{releaseType}`, and `{projectName}`. `{version}` and `{releaseVersion}` both resolve to the target release version. `{projectName}` is optional, lowercase, and may contain only latin letters, numbers, `_`, and `-`.

Output example:

```json
{
  "currentVersion": "1.2.3",
  "releaseVersion": "1.3.0",
  "nextVersion": "1.3.0",
  "branch": "/main/release/v1.3.0",
  "label": "v1.3.0",
  "branchComment": "Release 1.3.0",
  "labelComment": "Release 1.3.0",
  "checkinMessage": "release: prepare v1.3.0"
}
```

If `currentVersion` is omitted, UVCS MCP reads `release.versionFile`. The default is `package.json`.

Recommended flow:

```text
uvcs_release_plan
uvcs_branch_create_prepare
uvcs_branch_create_confirm
uvcs_switch_workspace_prepare
uvcs_switch_workspace_confirm
uvcs_checkin_prepare
uvcs_checkin_confirm
uvcs_label_create_prepare
uvcs_label_create_confirm
```

## Changeset Analytics

### `uvcs_changeset_analytics`

Runs a read-only changeset review window using `cm find changeset`.

Input:

```json
{
  "since": "2026-05-01",
  "until": "2026-05-17",
  "branch": "/main",
  "owner": "ian",
  "commentLike": "refactor",
  "maxResults": 100
}
```

All filters are optional. `maxResults` must be from 1 to 500.

Use this for:

- release review;
- refactor review over a period;
- checking who changed what in a branch;
- spotting checkin message patterns;
- preparing a changelog draft.

The tool returns:

- matched changesets;
- count by owner;
- count by branch;
- the safe `cm find changeset` query used.

## What to introduce now

Recommended for the next minor release:

- `uvcs_style_rules`
- `uvcs_style_setup_check`
- `uvcs_style_init_prepare`
- `uvcs_style_init_confirm`
- `uvcs_name_preview`
- `uvcs_release_plan`
- `uvcs_changeset_analytics`

Keep as future work:

- automatic version file editing;
- full release branch creation in one tool;
- changelog generation;
- merge risk scoring;
- additional per-repository style presets.

Actual branch creation, checkin, label creation, and merge still go through existing prepare/confirm tools. Style initialization also uses prepare/confirm because it writes `.uvcs-mcp/style.json`.
