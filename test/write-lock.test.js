import test from "node:test";
import assert from "node:assert/strict";
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
