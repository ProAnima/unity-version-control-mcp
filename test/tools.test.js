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

test("undo prepare forbids workspace root and confirm revalidates pending changes", async () => {
  const config = {
    workspace: process.cwd(),
    allowedWorkspaces: [],
    allowedRepos: [],
    mode: "standard",
    tokenTtlSec: 60
  };
  let pending = "CH\u001fAssets/Foo.prefab";
  let undone;
  const tools = createTools({
    config,
    backend: {
      pendingChanges: async () => ({ stdout: pending }),
      undo: async (payload) => {
        undone = payload;
        return { ok: true };
      }
    }
  });

  await assert.rejects(
    () => tools.call("uvcs_undo_prepare", { itemPath: "." }),
    (error) => error.code === "UNDO_WORKSPACE_ROOT_FORBIDDEN"
  );

  const prepared = await tools.call("uvcs_undo_prepare", {
    itemPath: "Assets/Foo.prefab"
  });
  assert.match(prepared.payload.warning, /irreversible/i);
  pending = "CH\u001fAssets/Foo.prefab\nCH\u001fAssets/Bar.prefab";

  await assert.rejects(
    () => tools.call("uvcs_undo_confirm", {
      token: prepared.token,
      confirmPhrase: "confirm uvcs undo"
    }),
    (error) => error.code === "WORKSPACE_CHANGED_SINCE_PREPARE"
  );
  assert.equal(undone, undefined);
});

test("undo confirm targets one canonical relative path", async () => {
  const config = {
    workspace: process.cwd(),
    allowedWorkspaces: [],
    allowedRepos: [],
    mode: "standard",
    tokenTtlSec: 60
  };
  let undone;
  const backend = {
    pendingChanges: async () => ({ stdout: "CH\u001fAssets/Foo.prefab" }),
    undo: async (payload) => {
      undone = payload;
      return { ok: true };
    }
  };
  const tools = createTools({ config, backend });
  const prepared = await tools.call("uvcs_undo_prepare", {
    itemPath: "Assets/Foo.prefab",
    recursive: false
  });
  await tools.call("uvcs_undo_confirm", {
    token: prepared.token,
    confirmPhrase: "confirm uvcs undo"
  });

  assert.equal(undone.itemPath.toLowerCase(), pathForPlatform("Assets/Foo.prefab").toLowerCase());
  assert.equal(undone.recursive, false);
});

function pathForPlatform(value) {
  return value.replaceAll("/", pathSeparator());
}

function pathSeparator() {
  return process.platform === "win32" ? "\\" : "/";
}
