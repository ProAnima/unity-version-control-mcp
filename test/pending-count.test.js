import test from "node:test";
import assert from "node:assert/strict";
import { createTools } from "../src/tools/index.js";

test("switch prepare ignores machine-readable STATUS header on clean workspace", async () => {
  const config = {
    workspace: process.cwd(),
    mode: "standard",
    tokenTtlSec: 300,
    allowedWorkspaces: [],
    checkinMaxFiles: 20
  };
  const backend = {
    pendingChanges: async () => ({ stdout: "STATUS\u001f92\u001frepo\u001fserver" })
  };

  const tools = createTools({ config, backend });
  const result = await tools.call("uvcs_switch_workspace_prepare", { target: "/main/test" });

  assert.equal(result.action, "switch_workspace");
});

test("checkin confirm refuses workspace changes made after prepare", async () => {
  const config = {
    workspace: process.cwd(),
    mode: "standard",
    tokenTtlSec: 300,
    allowedWorkspaces: [],
    allowedRepos: [],
    checkinMaxFiles: 20
  };
  let pending = "CH\u001fAssets/Before.prefab";
  let checkedIn = false;
  const backend = {
    pendingChanges: async () => ({ stdout: pending }),
    checkin: async () => {
      checkedIn = true;
      return { ok: true };
    }
  };

  const tools = createTools({ config, backend });
  const prepared = await tools.call("uvcs_checkin_prepare", { message: "test: guarded checkin" });
  pending = "CH\u001fAssets/Before.prefab\nCH\u001fAssets/After.prefab";

  await assert.rejects(
    () => tools.call("uvcs_checkin_confirm", {
      token: prepared.token,
      confirmPhrase: "confirm uvcs checkin"
    }),
    (error) => error.code === "WORKSPACE_CHANGED_SINCE_PREPARE"
  );
  assert.equal(checkedIn, false);
});

test("doctor respects workspace allowlist before invoking cm", async () => {
  const config = {
    workspace: process.cwd(),
    mode: "readonly",
    allowedWorkspaces: [pathOutsideCurrentWorkspace()],
    allowedRepos: []
  };
  let invoked = false;
  const backend = new Proxy({}, {
    get: () => async () => {
      invoked = true;
      return { stdout: "", stderr: "", ok: true };
    }
  });

  const tools = createTools({ config, backend });
  await assert.rejects(() => tools.call("uvcs_doctor", {}), /not allowed/);
  assert.equal(invoked, false);
});

function pathOutsideCurrentWorkspace() {
  return process.platform === "win32" ? "C:\\uvcs-not-allowed" : "/uvcs-not-allowed";
}
