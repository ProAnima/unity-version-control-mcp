import test from "node:test";
import assert from "node:assert/strict";
import { mergeCodexServer } from "../src/cli/codex-toml.js";

const block = {
  command: "npx",
  args: ["-y", "@proanima/uvcs-mcp"],
  env: { UVCS_WORKSPACE: "D:/ws", UVCS_MCP_MODE: "readonly" }
};
const count = (text, pattern) => (text.match(pattern) ?? []).length;

test("array tables after our table survive the merge", () => {
  const existing = [
    "[mcp_servers.uvcs]",
    "command = \"old\"",
    "",
    "[[profiles]]",
    "name = \"a\"",
    "",
    "[[profiles]]",
    "name = \"b\"",
    ""
  ].join("\n");

  const { text } = mergeCodexServer(existing, "uvcs", block);

  assert.equal(count(text, /^\[\[profiles\]\]$/gm), 2);
  assert.match(text, /\[\[profiles\]\]\nname = "a"\n\n\[\[profiles\]\]\nname = "b"\n$/);
  assert.doesNotMatch(text, /old/);
});

test("quoted table headers are recognised and replaced instead of duplicated", () => {
  const existing = [
    "[mcp_servers.\"uvcs\"]",
    "command = \"old\"",
    "",
    "[ mcp_servers . 'uvcs' . env ]",
    "OLD = \"1\"",
    "",
    "[mcp_servers.\"uvcs-other\"]",
    "command = \"keep\"",
    ""
  ].join("\n");

  const { text } = mergeCodexServer(existing, "uvcs", block);

  assert.equal(count(text, /^\[mcp_servers\.uvcs\]$/gm), 1);
  assert.equal(count(text, /^\[mcp_servers\.uvcs\.env\]$/gm), 1);
  assert.doesNotMatch(text, /"uvcs"\]|'uvcs'|OLD = /);
  assert.match(text, /\[mcp_servers\."uvcs-other"\]\ncommand = "keep"/);
});

test("user keys in our table are kept and startup_timeout_sec is only added when missing", () => {
  const existing = [
    "[mcp_servers.uvcs]",
    "command = \"old\"",
    "args = [",
    "  \"old.js\",",
    "]",
    "env = { OLD = \"1\" }",
    "tool_timeout_sec = 120",
    "# limit the exposed tools",
    "enabled_tools = [",
    "  \"uvcs_status\",",
    "  \"uvcs_diff\"",
    "]",
    "startup_timeout_sec = 15",
    ""
  ].join("\n");

  const { text, section } = mergeCodexServer(existing, "uvcs", block, { startupTimeoutSec: 60 });

  assert.match(text, /command = "npx"\nargs = \["-y", "@proanima\/uvcs-mcp"\]\n/);
  assert.match(text, /tool_timeout_sec = 120/);
  assert.match(text, /# limit the exposed tools\nenabled_tools = \[\n {2}"uvcs_status",\n {2}"uvcs_diff"\n\]/);
  assert.match(text, /startup_timeout_sec = 15/);
  assert.doesNotMatch(text, /startup_timeout_sec = 60|old\.js|OLD/);
  assert.equal(section, text);

  const legacy = mergeCodexServer("[mcp_servers.uvcs]\nstartup_timeout_ms = 30000\n", "uvcs", block, { startupTimeoutSec: 60 }).text;
  assert.doesNotMatch(legacy, /startup_timeout_sec/);

  const fresh = mergeCodexServer("", "uvcs", block, { startupTimeoutSec: 60 }).text;
  assert.match(fresh, /^\[mcp_servers\.uvcs\]\ncommand = "npx"\nargs = .*\nstartup_timeout_sec = 60\n\n\[mcp_servers\.uvcs\.env\]\n/);
  assert.doesNotMatch(mergeCodexServer("", "uvcs", block).text, /startup_timeout_sec/);
});

test("comments and tables around our server stay in place and the merge is idempotent", () => {
  const existing = [
    "model = \"gpt-5\"",
    "",
    "# uvcs server",
    "[mcp_servers.uvcs]",
    "command = \"old\"",
    "",
    "[mcp_servers.uvcs.env]",
    "UVCS_WORKSPACE = \"old\"",
    "",
    "# the next server",
    "[mcp_servers.other]",
    "command = \"keep\"",
    "description = \"\"\"",
    "[not-a-table]",
    "\"\"\"",
    ""
  ].join("\n");

  const first = mergeCodexServer(existing, "uvcs", block).text;
  assert.match(first, /^model = "gpt-5"\n\n# uvcs server\n\[mcp_servers\.uvcs\]\n/);
  assert.match(first, /UVCS_MCP_MODE = "readonly"\n\n# the next server\n\[mcp_servers\.other\]/);
  assert.match(first, /description = """\n\[not-a-table\]\n"""\n$/);
  assert.equal(mergeCodexServer(first, "uvcs", block).text, first);
});

test("CRLF line endings are preserved", () => {
  const existing = "model = \"gpt-5\"\r\n\r\n[mcp_servers.uvcs]\r\ncommand = \"old\"\r\n";
  const { text } = mergeCodexServer(existing, "uvcs", block);
  assert.doesNotMatch(text.replace(/\r\n/g, ""), /\n/);
  assert.match(text, /\[mcp_servers\.uvcs\]\r\ncommand = "npx"\r\n/);
});

test("servers defined with inline tables or dotted keys are refused instead of duplicated", () => {
  assert.throws(() => mergeCodexServer("[mcp_servers]\nuvcs = { command = \"x\" }\n", "uvcs", block), /line 2 defines mcp_servers\.uvcs/);
  assert.throws(() => mergeCodexServer("mcp_servers.uvcs.command = \"x\"\n", "uvcs", block), /mcp_servers\.uvcs/);
  assert.throws(() => mergeCodexServer("mcp_servers = { other = { command = \"x\" } }\n", "uvcs", block), /defines mcp_servers with/);
  assert.throws(() => mergeCodexServer("[broken\n", "uvcs", block), /not a valid table header/);

  const dottedSibling = mergeCodexServer("[mcp_servers]\nother.command = \"x\"\n", "uvcs", block).text;
  assert.match(dottedSibling, /other\.command = "x"\n\n\[mcp_servers\.uvcs\]/);
});
