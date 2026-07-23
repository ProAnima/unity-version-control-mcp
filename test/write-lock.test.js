import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { withWorkspaceWriteLock } from "../src/server/write-lock.js";

test("withWorkspaceWriteLock serializes work for the same workspace", async () => {
  const events = [];
  let resolveFirstStarted;
  let releaseFirst;
  const firstStarted = new Promise((resolve) => {
    resolveFirstStarted = resolve;
  });

  const first = withWorkspaceWriteLock("workspace-a", async () => {
    events.push("first:start");
    resolveFirstStarted();
    await new Promise((resolve) => {
      releaseFirst = resolve;
    });
    events.push("first:end");
    return "first";
  });

  await firstStarted;

  let secondStarted = false;
  const second = withWorkspaceWriteLock("workspace-a", async () => {
    secondStarted = true;
    events.push("second:start");
    return "second";
  });

  await Promise.resolve();
  assert.equal(secondStarted, false);

  releaseFirst();
  assert.deepEqual(await Promise.all([first, second]), ["first", "second"]);
  assert.deepEqual(events, ["first:start", "first:end", "second:start"]);
});

test("withWorkspaceWriteLock does not block different workspaces", async () => {
  let releaseA;
  let bStarted = false;
  const a = withWorkspaceWriteLock("workspace-a", async () => {
    await new Promise((resolve) => {
      releaseA = resolve;
    });
  });

  const b = withWorkspaceWriteLock("workspace-b", async () => {
    bStarted = true;
  });

  await b;
  assert.equal(bStarted, true);
  releaseA();
  await a;
});

test("withWorkspaceWriteLock detects another process lock", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-lock-"));
  const plasticDir = path.join(workspace, ".plastic");
  await fs.mkdir(plasticDir);
  await fs.writeFile(path.join(plasticDir, "uvcs-mcp.write.lock"), JSON.stringify({
    pid: 123,
    token: "other-process",
    createdAt: new Date().toISOString()
  }), "utf8");

  await assert.rejects(
    () => withWorkspaceWriteLock(workspace, async () => "unexpected", { waitMs: 0 }),
    (error) => error.code === "WORKSPACE_WRITE_LOCKED"
  );
});

test("withWorkspaceWriteLock safely replaces a stale process lock", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-stale-lock-"));
  const plasticDir = path.join(workspace, ".plastic");
  const lockPath = path.join(plasticDir, "uvcs-mcp.write.lock");
  await fs.mkdir(plasticDir);
  await fs.writeFile(lockPath, JSON.stringify({
    pid: 123,
    token: "stale-process",
    createdAt: "2020-01-01T00:00:00.000Z"
  }), "utf8");
  const old = new Date("2020-01-01T00:00:00.000Z");
  await fs.utimes(lockPath, old, old);

  const result = await withWorkspaceWriteLock(
    workspace,
    async () => "recovered",
    { waitMs: 100, staleMs: 1 }
  );

  assert.equal(result, "recovered");
  await assert.rejects(() => fs.access(lockPath), (error) => error.code === "ENOENT");
  await assert.rejects(() => fs.access(`${lockPath}.cleanup`), (error) => error.code === "ENOENT");
});
