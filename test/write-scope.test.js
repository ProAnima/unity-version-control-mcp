import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  MACHINE_READABLE_FLAGS,
  checkinCommand,
  checkoutCommand,
  lockListCommand,
  releaseCheckoutCommand
} from "../src/backend/commands.js";
import { assertRelativeWorkspacePath } from "../src/policy/policy.js";
import { pendingItems } from "../src/services/pending.js";
import { planScopedCheckin, unityPartner } from "../src/services/checkin-scope.js";
import { createTools } from "../src/tools/index.js";

const F = "\u001f";

async function withWorkspace(files, fn) {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-scope-"));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(workspace, rel)), { recursive: true });
      await fs.writeFile(path.join(workspace, rel), content);
    }
    return await fn(workspace);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
}

// Rows in the shape of `cm status --machinereadable`, with absolute paths.
function status(workspace, rows) {
  const abs = (rel) => path.join(workspace, ...rel.split("/"));
  return [
    `STATUS${F}7${F}repo${F}server:8087`,
    ...rows.map(([code, rel, from]) => (code === "LM"
      ? ["LM", "100%", abs(from), abs(rel), "False", "NO_MERGES"]
      : [code, abs(rel), "False", "NO_MERGES"]).join(F))
  ].join("\r\n");
}

function toolsFor(workspace, backend, overrides = {}) {
  return createTools({
    config: { workspace, allowedWorkspaces: [], allowedRepos: [], mode: "standard", tokenTtlSec: 60, checkinMaxFiles: 20, ...overrides },
    backend
  });
}

test("write commands put item paths before options and never use wildcards", () => {
  assert.deepEqual(checkinCommand("msg", ["Assets/A.cs", "Assets/A.cs.meta"]).args,
    ["checkin", "Assets/A.cs", "Assets/A.cs.meta", "-c=msg", "--all", "--applychanged", ...MACHINE_READABLE_FLAGS]);
  assert.deepEqual(checkinCommand("msg", ["Docs/a.txt"], { dependencies: true }).args.slice(0, 5),
    ["checkin", "Docs/a.txt", "-c=msg", "--all", "--dependencies"]);
  assert.deepEqual(checkinCommand("msg").args, ["checkin", "-c=msg", "--applychanged", ...MACHINE_READABLE_FLAGS]);
  assert.deepEqual(checkoutCommand(["A.png"]).args, ["checkout", "A.png", ...MACHINE_READABLE_FLAGS]);
  assert.deepEqual(releaseCheckoutCommand(["A.png"]).args, ["undo", "A.png", "--unchanged", ...MACHINE_READABLE_FLAGS]);
  assert.equal(releaseCheckoutCommand(["A.png"]).args.includes("--checkedout"), false);
  assert.deepEqual(lockListCommand({ paths: ["A.png"], scope: "user" }).args, ["lock", "list", "A.png", "--onlycurrentuser", ...MACHINE_READABLE_FLAGS]);
  assert.deepEqual(lockListCommand({ scope: "workspace", machineReadable: false }).args, ["lock", "list", "--onlycurrentworkspace"]);
});

test("item paths with wildcards are refused", () => {
  const config = { workspace: os.tmpdir() };
  for (const bad of ["Assets/*", "Assets/?.cs", "*"]) {
    assert.throws(() => assertRelativeWorkspacePath(config, bad), /wildcards/, bad);
  }
});

test("pending items parse moves, deletes, and checkouts relative to the workspace", async () => {
  await withWorkspace({}, async (workspace) => {
    const items = pendingItems(status(workspace, [
      ["CO", "Assets/Hero.png"],
      ["LD", "Docs/old.txt"],
      ["LM", "Docs/sub/new.txt", "Docs/new.txt"],
      ["PR", "Docs/private.txt"]
    ]), workspace);
    assert.deepEqual(items.map(({ code, path: itemPath, from, tracked }) => ({ code, itemPath, from, tracked })), [
      { code: "CO", itemPath: "Assets/Hero.png", from: undefined, tracked: true },
      { code: "LD", itemPath: "Docs/old.txt", from: undefined, tracked: true },
      { code: "LM", itemPath: "Docs/sub/new.txt", from: "Docs/new.txt", tracked: true },
      { code: "PR", itemPath: "Docs/private.txt", from: undefined, tracked: false }
    ]);
  });
});

test("unity partners are only computed under Assets", () => {
  assert.equal(unityPartner("Assets/A.cs"), "Assets/A.cs.meta");
  assert.equal(unityPartner("Assets/A.cs.meta"), "Assets/A.cs");
  assert.equal(unityPartner("Assets\\Folder\\"), "Assets/Folder.meta");
  assert.equal(unityPartner("Assets"), null);
  assert.equal(unityPartner("Packages/manifest.json"), null);
});

test("scoped checkin adds .meta partners of files, folders, and deletes", async () => {
  await withWorkspace({}, async (workspace) => {
    const plan = planScopedCheckin({
      workspace,
      paths: ["Assets/A.cs", "Assets/Feature"],
      statusText: status(workspace, [
        ["AD", "Assets/A.cs"],
        ["AD", "Assets/A.cs.meta"],
        ["AD", "Assets/Feature"],
        ["AD", "Assets/Feature/B.cs"],
        ["AD", "Assets/Feature/B.cs.meta"],
        ["AD", "Assets/Feature.meta"],
        ["LD", "Assets/Gone.prefab.meta"],
        ["CH", "Assets/Other.cs"]
      ])
    });
    assert.deepEqual(plan.autoIncludedMeta, ["Assets/A.cs.meta", "Assets/Feature.meta"]);
    assert.equal(plan.items.length, 6);
    assert.equal(plan.items.some((item) => item.path === "Assets/Other.cs"), false);
    assert.deepEqual(plan.dependencies, []);

    const deleted = planScopedCheckin({
      workspace,
      paths: ["Assets/Gone.prefab"],
      statusText: status(workspace, [["LD", "Assets/Gone.prefab"], ["LD", "Assets/Gone.prefab.meta"]])
    });
    assert.deepEqual(deleted.autoIncludedMeta, ["Assets/Gone.prefab.meta"]);
  });
});

test("scoped checkin blocks assets whose .meta is private and warns when it is missing", async () => {
  await withWorkspace({ "Assets/B.cs.meta": "guid" }, async (workspace) => {
    assert.throws(() => planScopedCheckin({
      workspace,
      paths: ["Assets/B.cs"],
      statusText: status(workspace, [["AD", "Assets/B.cs"], ["PR", "Assets/B.cs.meta"]])
    }), (error) => error.code === "UNITY_META_NOT_ADDED" && error.details.blockers[0].meta === "Assets/B.cs.meta");

    const plan = planScopedCheckin({ workspace, paths: ["Assets/C.cs"], statusText: status(workspace, [["AD", "Assets/C.cs"]]) });
    assert.equal(plan.unityMetaWarnings[0].meta, "Assets/C.cs.meta");
  });
});

test("scoped checkin lists pending parent folders as dependencies and refuses empty or root selections", async () => {
  await withWorkspace({}, async (workspace) => {
    const plan = planScopedCheckin({
      workspace,
      paths: ["Docs/sub/new.txt"],
      statusText: status(workspace, [["LM", "Docs/sub/new.txt", "Docs/new.txt"], ["PR", "Docs/sub"], ["PR", "Docs/sub/other.txt"]])
    });
    assert.deepEqual(plan.dependencies, [{ code: "PR", path: "Docs/sub" }]);
    assert.equal(plan.items.length, 1);

    assert.throws(() => planScopedCheckin({ workspace, paths: ["Docs/none.txt"], statusText: status(workspace, [["CH", "Docs/a.txt"]]) }),
      (error) => error.code === "NOTHING_TO_CHECKIN");
    assert.throws(() => planScopedCheckin({ workspace, paths: ["."], statusText: status(workspace, [["CH", "Docs/a.txt"]]) }),
      (error) => error.code === "INVALID_PATH");
  });
});

test("scoped checkin confirm runs only the planned paths and rejects edits made after prepare", async () => {
  await withWorkspace({ "Assets/A.cs": "a", "Assets/A.cs.meta": "m", "Docs/x.txt": "x" }, async (workspace) => {
    const statusText = status(workspace, [["CH", "Assets/A.cs"], ["CH", "Assets/A.cs.meta"], ["CH", "Docs/x.txt"]]);
    const calls = [];
    const tools = toolsFor(workspace, {
      pendingChanges: async () => ({ stdout: statusText }),
      checkin: async (...args) => {
        calls.push(args);
        return { ok: true, stdout: "CHANGESET cs:8" };
      }
    });

    const prepared = await tools.call("uvcs_checkin_prepare", { message: "fix", paths: ["Assets/A.cs"] });
    assert.equal(prepared.changedFiles, 2);
    assert.equal(prepared.otherPendingChangesLeft, 1);
    await tools.call("uvcs_checkin_confirm", { token: prepared.token, confirmPhrase: prepared.confirmPhrase });
    assert.deepEqual(calls, [["fix", [path.join("Assets", "A.cs"), path.join("Assets", "A.cs.meta")], { dependencies: false }]]);

    const again = await tools.call("uvcs_checkin_prepare", { message: "fix", paths: ["Assets/A.cs"] });
    await new Promise((resolve) => {
      setTimeout(resolve, 20);
    });
    await fs.writeFile(path.join(workspace, "Assets/A.cs"), "edited after prepare");
    await assert.rejects(
      () => tools.call("uvcs_checkin_confirm", { token: again.token, confirmPhrase: again.confirmPhrase }),
      (error) => error.code === "WORKSPACE_CHANGED_SINCE_PREPARE"
    );
    assert.equal(calls.length, 1);
  });
});

test("full checkin confirm also rejects files edited after prepare", async () => {
  await withWorkspace({ "Docs/x.txt": "x" }, async (workspace) => {
    const statusText = status(workspace, [["CH", "Docs/x.txt"]]);
    let checkedIn = false;
    const tools = toolsFor(workspace, {
      pendingChanges: async () => ({ stdout: statusText }),
      checkin: async () => {
        checkedIn = true;
        return { ok: true };
      }
    });
    const prepared = await tools.call("uvcs_checkin_prepare", { message: "all" });
    await fs.writeFile(path.join(workspace, "Docs/x.txt"), "longer content after prepare");
    await assert.rejects(
      () => tools.call("uvcs_checkin_confirm", { token: prepared.token, confirmPhrase: prepared.confirmPhrase }),
      (error) => error.code === "WORKSPACE_CHANGED_SINCE_PREPARE"
    );
    assert.equal(checkedIn, false);
  });
});

test("checkout refuses private, added, missing, directory, and locked items", async () => {
  await withWorkspace({ "Assets/Hero.png": "png", "Assets/New.png": "n", "Docs/p.txt": "p", "Assets/Locked.prefab": "l" }, async (workspace) => {
    let checkedOut;
    const tools = toolsFor(workspace, {
      pendingChanges: async () => ({ stdout: status(workspace, [["AD", "Assets/New.png"], ["PR", "Docs"]]) }),
      locks: async ({ paths }) => ({
        format: "machinereadable",
        stdout: paths.some((item) => item.includes("Locked"))
          ? ["guid", "ann", "ann-ws", "/Assets/Locked.prefab"].join(F)
          : ""
      }),
      checkout: async (paths) => {
        checkedOut = paths;
        return { ok: true };
      }
    });
    const code = async (paths) => {
      try {
        await tools.call("uvcs_checkout_prepare", { paths });
        return "ok";
      } catch (error) {
        return error.code;
      }
    };
    assert.equal(await code(["Docs/p.txt"]), "ITEM_NOT_CONTROLLED");
    assert.equal(await code(["Assets/New.png"]), "ITEM_NOT_CONTROLLED");
    assert.equal(await code(["Assets/Missing.png"]), "ITEM_NOT_FOUND");
    assert.equal(await code(["Assets"]), "CHECKOUT_FILES_ONLY");
    assert.equal(await code(["Assets/Locked.prefab"]), "ITEM_LOCKED");

    const prepared = await tools.call("uvcs_checkout_prepare", { paths: ["Assets/Hero.png"] });
    assert.equal(prepared.action, "checkout");
    await tools.call("uvcs_checkout_confirm", { token: prepared.token, confirmPhrase: prepared.confirmPhrase });
    assert.deepEqual(checkedOut, [path.join("Assets", "Hero.png")]);
  });
});

test("release checkout reports released and still checked-out files", async () => {
  await withWorkspace({ "Assets/A.png": "a", "Assets/B.png": "b" }, async (workspace) => {
    let rows = [["CO", "Assets/A.png"], ["CO", "Assets/B.png"]];
    const tools = toolsFor(workspace, {
      pendingChanges: async () => ({ stdout: status(workspace, rows) }),
      releaseCheckout: async () => {
        rows = [["CO", "Assets/B.png"]];
        return { ok: true };
      }
    });
    await assert.rejects(() => tools.call("uvcs_release_checkout_prepare", { paths: ["Assets/C.png"] }), (error) => error.code === "NOT_CHECKED_OUT");
    const prepared = await tools.call("uvcs_release_checkout_prepare", { paths: ["Assets/A.png", "Assets/B.png"] });
    const result = await tools.call("uvcs_release_checkout_confirm", { token: prepared.token, confirmPhrase: prepared.confirmPhrase });
    assert.deepEqual(result.released, [path.join("Assets", "A.png")]);
    assert.deepEqual(result.stillCheckedOut, [path.join("Assets", "B.png")]);
    assert.match(result.note, /stay checked out/);
  });
});

test("merge prepare refuses conflicting or already merged sources", async () => {
  await withWorkspace({}, async (workspace) => {
    let previewStdout = ["FILE_CONFLICT", "/A.txt", "1", "2", "3", "9"].join(F);
    const tools = toolsFor(workspace, {
      pendingChanges: async () => ({ stdout: `STATUS${F}1${F}r${F}s` }),
      mergePreview: async () => ({ stdout: previewStdout })
    });
    await assert.rejects(() => tools.call("uvcs_merge_prepare", { source: "/main/task" }),
      (error) => error.code === "MERGE_HAS_CONFLICTS" && error.details.conflicts[0].destinationChangeset === "3");
    previewStdout = `STATUS${F}ALREADY_CONNECTED${F}No merges detected`;
    await assert.rejects(() => tools.call("uvcs_merge_prepare", { source: "/main/task" }), (error) => error.code === "NOTHING_TO_MERGE");
    previewStdout = ["FILE_SRC", "/A.txt", "1", "2", "9"].join(F);
    const prepared = await tools.call("uvcs_merge_prepare", { source: "/main/task" });
    assert.equal(prepared.payload.changeCount, 1);
  });
});

test("uvcs_locks validates paths and passes the scope", async () => {
  await withWorkspace({}, async (workspace) => {
    let requested;
    const tools = toolsFor(workspace, {
      locks: async (options) => {
        requested = options;
        return { ok: true, rows: [], stdout: ["g", "ann", "ws", "/Assets/A.png"].join(F) };
      }
    }, { mode: "readonly" });
    const result = await tools.call("uvcs_locks", { paths: ["Assets/A.png"], scope: "user" });
    assert.deepEqual(requested, { paths: [path.join("Assets", "A.png")], scope: "user" });
    assert.deepEqual(result.locks, [{ itemId: "g", owner: "ann", workspace: "ws", path: "/Assets/A.png" }]);
    await assert.rejects(() => tools.call("uvcs_locks", { paths: ["-r"] }), /cannot start with '-'/);
  });
});

test("empty path lists are refused instead of becoming a full checkin, checkout, or release", async () => {
  await withWorkspace({ "Docs/x.txt": "x" }, async (workspace) => {
    let ran = false;
    const tools = toolsFor(workspace, {
      pendingChanges: async () => ({ stdout: status(workspace, [["CH", "Docs/x.txt"], ["CO", "Docs/y.txt"]]) }),
      checkin: async () => {
        ran = true;
      }
    });
    for (const [name, args] of [
      ["uvcs_checkin_prepare", { message: "m", paths: [] }],
      ["uvcs_checkout_prepare", { paths: [] }],
      ["uvcs_release_checkout_prepare", { paths: [] }]
    ]) {
      await assert.rejects(() => tools.call(name, args), (error) => error.code === "INVALID_PATH", name);
    }
    assert.equal(ran, false);
  });
});

test("a selected folder .meta never widens the checkin to the folder", async () => {
  await withWorkspace({ "Assets/Foo/Secret.cs": "s", "Assets/Foo.meta": "m" }, async (workspace) => {
    const plan = planScopedCheckin({
      workspace,
      paths: ["Assets/Foo.meta"],
      statusText: status(workspace, [
        ["CO", "Assets/Foo"],
        ["CH", "Assets/Foo.meta"],
        ["AD", "Assets/Foo/Secret.cs"],
        ["CH", "Assets/Foo/Other.cs"]
      ])
    });
    assert.deepEqual(plan.paths, [path.join("Assets", "Foo.meta")]);
    assert.deepEqual(plan.autoIncludedMeta, []);
    assert.deepEqual(plan.items.map((item) => item.path), ["Assets/Foo.meta"]);
    assert.equal(plan.unityMetaWarnings[0].path, "Assets/Foo");
  });
});

test("private dependencies count as checked-in items but not as other pending changes", async () => {
  await withWorkspace({ "Docs/sub/new.txt": "n" }, async (workspace) => {
    const tools = toolsFor(workspace, {
      pendingChanges: async () => ({
        stdout: status(workspace, [["LM", "Docs/sub/new.txt", "Docs/new.txt"], ["PR", "Docs/sub"], ["CH", "Docs/other.txt"]])
      })
    });
    const prepared = await tools.call("uvcs_checkin_prepare", { message: "move", paths: ["Docs/sub/new.txt"] });
    assert.equal(prepared.changedFiles, 2);
    assert.equal(prepared.otherPendingChangesLeft, 1);
  });
});

test("merge confirm re-checks conflicts and runs the previewed spec", async () => {
  await withWorkspace({}, async (workspace) => {
    let previewStdout = ["FILE_SRC", "/A.txt", "1", "2", "9"].join(F);
    const previewed = [];
    let merged;
    const tools = toolsFor(workspace, {
      pendingChanges: async () => ({ stdout: `STATUS${F}1${F}r${F}s` }),
      mergePreview: async ({ source }) => {
        previewed.push(source);
        return { stdout: previewStdout };
      },
      merge: async (payload) => {
        merged = payload;
        return { ok: true };
      }
    });
    const first = await tools.call("uvcs_merge_prepare", { source: "main/task" });
    previewStdout = ["FILE_CONFLICT", "/A.txt", "1", "3", "2", "9"].join(F);
    await assert.rejects(
      () => tools.call("uvcs_merge_confirm", { token: first.token, confirmPhrase: first.confirmPhrase }),
      (error) => error.code === "MERGE_HAS_CONFLICTS"
    );
    assert.equal(merged, undefined);

    previewStdout = ["FILE_SRC", "/A.txt", "1", "2", "9"].join(F);
    const second = await tools.call("uvcs_merge_prepare", { source: "main/task" });
    await tools.call("uvcs_merge_confirm", { token: second.token, confirmPhrase: second.confirmPhrase });
    assert.equal(merged.source, "br:/main/task");
    assert.ok(previewed.every((source) => source === "br:/main/task"));
  });
});

test("checkout refuses when locks cannot be read in machine-readable form", async () => {
  await withWorkspace({ "Assets/Hero.png": "png" }, async (workspace) => {
    const tools = toolsFor(workspace, {
      pendingChanges: async () => ({ stdout: status(workspace, []) }),
      locks: async () => ({ ok: true, stdout: "guid ann ws /Assets/Hero.png" })
    });
    await assert.rejects(() => tools.call("uvcs_checkout_prepare", { paths: ["Assets/Hero.png"] }), (error) => error.code === "LOCK_CHECK_FAILED");
  });
});
