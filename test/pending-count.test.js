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
