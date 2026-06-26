import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { auditToolCall } from "../src/services/audit.js";

test("auditToolCall appends JSONL audit entries without requiring tool arguments", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-audit-"));
  const auditLogPath = path.join(dir, "audit.jsonl");

  await auditToolCall({ auditLogPath }, {
    tool: "uvcs_workspace_status",
    ok: true,
    durationMs: 12
  });
  await auditToolCall({ auditLogPath }, {
    tool: "uvcs_checkin_confirm",
    ok: false,
    durationMs: 5,
    errorCode: "INVALID_CONFIRM_PHRASE"
  });

  const lines = (await fs.readFile(auditLogPath, "utf8")).trim().split(/\r?\n/);
  const entries = lines.map((line) => JSON.parse(line));

  assert.equal(entries.length, 2);
  assert.match(entries[0].ts, /^\d{4}-\d{2}-\d{2}T/);
  assert.equal(entries[0].tool, "uvcs_workspace_status");
  assert.equal(entries[0].ok, true);
  assert.equal(entries[1].errorCode, "INVALID_CONFIRM_PHRASE");
  assert.equal(Object.hasOwn(entries[1], "args"), false);
  assert.equal(Object.hasOwn(entries[1], "token"), false);
});

test("auditToolCall is a no-op when audit logging is disabled", async () => {
  await assert.doesNotReject(() => auditToolCall({ auditLogPath: "" }, {
    tool: "uvcs_workspace_status",
    ok: true,
    durationMs: 1
  }));
});
