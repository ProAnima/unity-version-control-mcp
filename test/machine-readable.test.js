import test from "node:test";
import assert from "node:assert/strict";
import { parseMachineReadableTable } from "../src/backend/machine-readable.js";

test("machine-readable parser splits rows by unit separator", () => {
  const rows = parseMachineReadableTable("CHANGED\u001fAssets/Foo.prefab\u001f123\nADDED\u001fAssets/Foo.meta\u001f0");

  assert.deepEqual(rows, [
    ["CHANGED", "Assets/Foo.prefab", "123"],
    ["ADDED", "Assets/Foo.meta", "0"]
  ]);
});

test("machine-readable parser tolerates empty output", () => {
  assert.deepEqual(parseMachineReadableTable(""), []);
  assert.deepEqual(parseMachineReadableTable("\n\n"), []);
});
