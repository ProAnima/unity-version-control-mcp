# Automation Style

Optional style file:

```text
.uvcs-mcp/style.json
```

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

Actual branch creation and labels still use prepare/confirm tools.

