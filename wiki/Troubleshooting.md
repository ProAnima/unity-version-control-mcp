# Troubleshooting

Start with:

```text
uvcs_doctor
```

Then check `policy.warnings` in `uvcs_setup_status`; configuration mistakes such as an unrecognized `UVCS_MCP_MODE` are reported there.

Common fixes:

- set `UVCS_WORKSPACE` to a real source-control workspace (`WORKSPACE_NOT_FOUND` means the folder does not exist);
- pass `--cm=/path/to/cm` if `cm` is not found; GUI clients on macOS do not inherit the shell `PATH`, so keep the absolute `UVCS_CM_PATH` that `init` writes;
- on Windows, start the npm package as `cmd /c npx -y @proanima/uvcs-mcp@1.3.0`; clients that spawn without a shell cannot launch `npx` directly;
- if `init` writes nothing, fix the malformed client config it names or re-run with `--skip-invalid`;
- log in with the official Plastic SCM / Unity Version Control client; `cm` runs without stdin, so login prompts fail instead of waiting;
- restart the MCP client after config changes;
- set `UVCS_MCP_MODE=standard` (exactly) for write tools;
- set `UVCS_ALLOWED_REPOS` only to repository/server identities that should be allowed;
- use Node.js 22 or newer.

After `WORKSPACE_CHANGED_SINCE_PREPARE` or `WRITE_INTERRUPTED_STATE_UNKNOWN`, do not retry the confirm: inspect `uvcs_pending_changes` and prepare again.

On Windows, `cm` output in OEM or ANSI code pages (for example cp866 or cp1251) is decoded automatically; `chcp 65001` is not needed. If text still looks wrong, set:

```text
UVCS_CM_OUTPUT_ENCODING=ibm866
```

More: [Troubleshooting](https://github.com/ProAnima/unity-version-control-mcp/blob/main/docs/troubleshooting.md), [Configuration](https://github.com/ProAnima/unity-version-control-mcp/blob/main/docs/configuration.md).
