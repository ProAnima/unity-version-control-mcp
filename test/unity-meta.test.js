import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { unityMetaDiagnostics } from "../src/services/unity-meta.js";

test("unity meta diagnostics reports missing and orphan meta files", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-meta-"));
  await fs.mkdir(path.join(workspace, "Assets", "Art"), { recursive: true });
  await fs.writeFile(path.join(workspace, "Assets", "Art", "Tree.prefab"), "prefab", "utf8");
  await fs.writeFile(path.join(workspace, "Assets", "Art", "Ghost.png.meta"), "meta", "utf8");

  const result = await unityMetaDiagnostics(workspace);

  assert.equal(result.summary.missingMeta, 2);
  assert.equal(result.summary.orphanMeta, 1);
  assert.equal(result.findings.some((item) => item.path === "Assets/Art/Tree.prefab"), true);
  assert.equal(result.findings.some((item) => item.path === "Assets/Art/Ghost.png.meta"), true);
});
