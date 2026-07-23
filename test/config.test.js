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

test("loadConfig exposes workspace identity and bounded process settings", () => {
  const config = loadConfig({
    UVCS_WORKSPACE: ".",
    UVCS_WORKSPACE_NAME: "game-client",
    UVCS_SAFETY_PROFILE: "guarded",
    UVCS_READ_TIMEOUT_MS: "15000",
    UVCS_WRITE_TIMEOUT_MS: "240000",
    UVCS_MAX_OUTPUT_BYTES: "1048576"
  });

  assert.equal(config.workspaceName, "game-client");
  assert.equal(config.safetyProfile, "guarded");
  assert.equal(config.readTimeoutMs, 15000);
  assert.equal(config.writeTimeoutMs, 240000);
  assert.equal(config.maxOutputBytes, 1048576);
});
