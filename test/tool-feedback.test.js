import test from "node:test";
import assert from "node:assert/strict";
import { formatToolError } from "../src/server/tool-result.js";
import { UvcsError } from "../src/backend/errors.js";

test("tool feedback includes code, details, and actionable hints", () => {
  const payload = formatToolError(new UvcsError("cm failed", {
    code: "CM_COMMAND_FAILED",
    details: {
      command: "cm",
      args: ["status"]
    }
  }));

  assert.equal(payload.ok, false);
  assert.equal(payload.error.code, "CM_COMMAND_FAILED");
  assert.deepEqual(payload.error.details.args, ["status"]);
  assert.match(payload.hint, /doctor/);
});

test("tool feedback guides invalid checkin messages", () => {
  const payload = formatToolError(new UvcsError("bad message", {
    code: "INVALID_CHECKIN_MESSAGE"
  }));

  assert.match(payload.hint, /non-empty/);
});

test("tool feedback guides repository allowlist failures", () => {
  const payload = formatToolError(new UvcsError("repo denied", {
    code: "REPOSITORY_NOT_ALLOWED"
  }));

  assert.match(payload.hint, /UVCS_ALLOWED_REPOS/);
});
