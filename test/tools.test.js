import test from "node:test";
import assert from "node:assert/strict";
import { createTools } from "../src/tools/index.js";

test("branch create prepare allows safe release branch names with a project name", async () => {
  const tools = createTools({
    config: {
      workspace: "D:/workspace",
      allowedWorkspaces: [],
      mode: "standard",
      tokenTtlSec: 60
    },
    backend: {}
  });

  const prepared = await tools.call("uvcs_branch_create_prepare", {
    branch: "/3.4 sample-project",
    fromChangeset: "cs:1"
  });

  assert.equal(prepared.action, "branch_create");
  assert.equal(prepared.payload.branch, "/3.4 sample-project");
});

test("branch create prepare still rejects unsafe branch names", async () => {
  const tools = createTools({
    config: {
      workspace: "D:/workspace",
      allowedWorkspaces: [],
      mode: "standard",
      tokenTtlSec: 60
    },
    backend: {}
  });

  await assert.rejects(
    () => tools.call("uvcs_branch_create_prepare", {
      branch: "/3.4  sample-project",
      fromChangeset: "cs:1"
    }),
    /safe branch path/
  );
});
