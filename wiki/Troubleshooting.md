# Troubleshooting

Start with:

```text
uvcs_doctor
```

Common fixes:

- set `UVCS_WORKSPACE` to a real source-control workspace;
- pass `--cm=/path/to/cm` if `cm` is not in `PATH`;
- log in with the official Plastic SCM / Unity Version Control client;
- restart the MCP client after config changes;
- set `UVCS_MCP_MODE=standard` for guarded write tools.

On Windows, if terminal output looks broken:

```bat
chcp 65001
```

