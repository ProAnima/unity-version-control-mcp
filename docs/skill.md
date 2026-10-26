# Agent Skill

UVCS MCP ships the agent skill `uvcs-version-control` in [`skills/uvcs-version-control`](../skills/uvcs-version-control/SKILL.md). It uses the open `SKILL.md` format and teaches an agent:

- which `uvcs_*` tool answers which question (status, history, review, blame, merge preview, naming);
- the prepare → user approval → confirm workflow, and when not to retry;
- when to check in everything and when to pass `paths`, and how to read the prepared `.meta` additions and dependencies;
- how to lock (check out) scenes and prefabs before editing them and release locks afterwards;
- Unity `.meta` pairing, folders to never touch, and how to report YAML and binary assets.

The skill does not replace the MCP server. Configure the server first with `uvcs-mcp init`, then install the skill.

## Install

```bash
npx -y @proanima/uvcs-mcp@1.4.1 skill install
```

By default the skill goes to the user-level folders of Claude Code (`~/.claude/skills`) and of the agents that read the shared `~/.agents/skills` folder. Choose agents with `--agent` (comma-separated, or `all`):

| `--agent` | User scope (default) | Project scope (`--scope=project --project-dir=<folder>`) | Loaded by |
| --- | --- | --- | --- |
| `claude` | `~/.claude/skills` | `<folder>/.claude/skills` | Claude Code (also read by Cursor and OpenCode) |
| `agents` | `~/.agents/skills` | `<folder>/.agents/skills` | Codex, Cursor, OpenCode, Gemini CLI, and other SKILL.md agents |
| `cursor` | `~/.cursor/skills` | `<folder>/.cursor/skills` | Cursor |
| `opencode` | `$XDG_CONFIG_HOME/opencode/skills` (`~/.config/opencode/skills`) | `<folder>/.opencode/skills` | OpenCode |
| `codex` | `$CODEX_HOME/skills` (`~/.codex/skills`) | `<folder>/.agents/skills` | Codex |

Examples:

```bash
# Every agent, for the current user
npx -y @proanima/uvcs-mcp@1.4.1 skill install --agent=all

# Commit the skill with the workspace so the whole team gets it
npx -y @proanima/uvcs-mcp@1.4.1 skill install --scope=project --project-dir="D:/Repositories/YourWorkspace" --agent=claude,agents

# Show the target folders without writing anything
npx -y @proanima/uvcs-mcp@1.4.1 skill install --agent=all --print-only
```

Installing again is a no-op when the copy is current. If an older or edited copy exists, the command stops; `--force` replaces it and keeps the old folder as `uvcs-version-control.<timestamp>.bak` next to the `skills` folder, where agents do not load it.

`uvcs-mcp skill path` prints the bundled skill folder, for agents or tools that want to copy or link it themselves. Restart the agent after installing.

Other agents that load `SKILL.md` folders (for example Kiro or Windsurf) can use a copy of `skills/uvcs-version-control` in their own skills folder.

## Marketplace package (Agensi)

```bash
npm run pack:skill
```

The script validates the skill and writes `dist/uvcs-version-control-skill.zip` with `SKILL.md` at the archive root and the `references/` and `agents/` folders next to it. Validation checks:

- the frontmatter `name` equals the folder name and is a lowercase slug of at most 64 characters;
- `description` is at most 1,024 characters and says when to use the skill;
- every link in `SKILL.md` points to a file in the package;
- every URL in the package is declared in `external_urls` (Agensi rejects undeclared network access);
- `compatibility` is at most 500 characters;
- no file looks like it contains a secret, and `SKILL.md` has at most 500 lines.

When uploading to Agensi, set the listing's allowed hosts to the `external_urls` values (`registry.npmjs.org` for installing the server with `npx`, and the GitHub repository for documentation). The skill itself does not change user configuration, run hooks, or execute scripts; it asks the user to configure the MCP server when it is missing.

## Contents

| File | Purpose |
| --- | --- |
| `SKILL.md` | Trigger description, orientation steps, tool selection table, write rules, Unity rules |
| `references/tools.md` | Every tool with its arguments and important error codes |
| `references/workflows.md` | Step-by-step recipes: branch review, release notes, blame investigation, safe merge, Unity checkin, release, fleet |
| `references/setup.md` | How the user connects the MCP server |
| `agents/openai.yaml` | Codex display metadata |

Keep the skill's `metadata.version` in step with changes to its content, and update `references/tools.md` whenever tools are added or renamed.
