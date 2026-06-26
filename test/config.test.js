import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { loadConfig } from "../src/config/env.js";

test("loadConfig resolves audit log path when UVCS_AUDIT_LOG is set", () => {
  const config = loadConfig({
    UVCS_WORKSPACE: ".",
    UVCS_AUDIT_LOG: "logs/uvcs-mcp-audit.jsonl"
  });

  assert.equal(config.auditLogPath, path.resolve("logs/uvcs-mcp-audit.jsonl"));
});

test("loadConfig leaves audit logging disabled by default", () => {
  const config = loadConfig({
    UVCS_WORKSPACE: "."
  });

  assert.equal(config.auditLogPath, "");
});

test("loadConfig supports cm command prefix args for wrappers", () => {
  const config = loadConfig({
    UVCS_WORKSPACE: ".",
    UVCS_CM_PATH: "node",
    UVCS_CM_ARGS: "scripts/fake-cm.js"
  });

  assert.equal(config.cmPath, "node");
  assert.deepEqual(config.cmArgs, ["scripts/fake-cm.js"]);
});
