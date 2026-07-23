import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  assertRelativeWorkspacePath,
  assertRepoAllowed,
  assertStandardMode,
  consumeConfirmToken,
  createConfirmToken
} from "../src/policy/policy.js";

test("relative workspace paths cannot escape workspace", () => {
  const config = {
    workspace: path.resolve("workspace")
  };

  assert.equal(assertRelativeWorkspacePath(config, "Assets/Foo.asset"), path.join("Assets", "Foo.asset"));
  assert.throws(() => assertRelativeWorkspacePath(config, "../outside.txt"), /inside UVCS_WORKSPACE/);
});

test("allowed repo guard accepts repository and server from workspace info", () => {
  assert.doesNotThrow(() => assertRepoAllowed(
    { allowedRepos: ["pas-Kodeks@SRV-IAN-N:8087"] },
    { repository: "pas-Kodeks", server: "SRV-IAN-N:8087" }
  ));

  assert.throws(() => assertRepoAllowed(
    { allowedRepos: ["other@server:8087"] },
    { repository: "pas-Kodeks", server: "SRV-IAN-N:8087" }
  ), /UVCS_ALLOWED_REPOS/);
});

test("standard mode guard rejects readonly", () => {
  assert.throws(() => assertStandardMode({ mode: "readonly" }), /standard/);
  assert.doesNotThrow(() => assertStandardMode({ mode: "standard" }));
});

test("confirm tokens are single use and action scoped", () => {
  const { token } = createConfirmToken({
    action: "checkin",
    payload: { message: "ok" },
    ttlSec: 60
  });

  assert.throws(() => consumeConfirmToken({ token, action: "update" }), /checkin/);

  const second = createConfirmToken({
    action: "checkin",
    payload: { message: "ok" },
    ttlSec: 60
  });

  assert.deepEqual(consumeConfirmToken({ token: second.token, action: "checkin" }), { message: "ok" });
  assert.throws(() => consumeConfirmToken({ token: second.token, action: "checkin" }), /Unknown/);
});

test("confirm tokens cannot cross workspace contexts", () => {
  const prepared = createConfirmToken({
    action: "checkin",
    payload: { message: "ok" },
    ttlSec: 60,
    context: "workspace-a"
  });

  assert.throws(
    () => consumeConfirmToken({
      token: prepared.token,
      action: "checkin",
      context: "workspace-b"
    }),
    (error) => error.code === "CONFIRM_TOKEN_CONTEXT_MISMATCH"
  );
});
