# Automation Style

Optional style file:

```text
.uvcs-mcp/style.json
```

Project style files can point at a central policy:

```json
{
  "extends": "../../.uvcs-mcp/style.json"
}
```

The path must be relative and point to another `.uvcs-mcp/style.json`.

Use it to standardize:

- branch names;
- checkin messages;
- release branch names;
- release labels;
- branch and label comments.

Useful tools:

- `uvcs_style_rules`
- `uvcs_name_preview`
- `uvcs_release_plan`

Example request:

```text
Plan a minor release using UVCS MCP style rules.
```

The tool can return:

```text
branch: /main/release/v1.3.0
label: v1.3.0
checkinMessage: release: prepare v1.3.0
```

For project release branches, style patterns can use a user-provided release version and project name:

```json
{
  "release": {
    "branchPattern": "/{releaseVersion} {projectName}"
  }
}
```

`uvcs_release_plan` accepts an explicit `releaseVersion` and a lowercase `projectName`.

Actual branch creation and labels still use prepare/confirm tools.
