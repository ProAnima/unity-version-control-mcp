import test from "node:test";
import assert from "node:assert/strict";
import {
  CM_COMMANDS,
  MACHINE_READABLE_FLAGS,
  addCommand,
  branchCreateCommand,
  checkinCommand,
  diffFileCommand,
  findBranchesCommand,
  findChangesetsCommand,
  labelCreateCommand,
  mergeCommand,
  switchCommand,
  undoCommand
} from "../src/backend/commands.js";
import { parseStatusHeaderWorkspaceInfo, parseWorkspaceFile, runCmSpec } from "../src/backend/cm.js";

test("critical cm commands use documented command names and safe argv arrays", () => {
  assert.deepEqual(CM_COMMANDS.statusShort.args, ["status", "--short"]);
  assert.deepEqual(CM_COMMANDS.statusMachine.args, ["status", ...MACHINE_READABLE_FLAGS]);
  assert.deepEqual(CM_COMMANDS.statusHeader.args, ["status", "--header", "--nochanges"]);
  assert.deepEqual(CM_COMMANDS.updateMachine.args, ["update", "--noinput", ...MACHINE_READABLE_FLAGS]);
  assert.deepEqual(checkinCommand("hello").args, ["checkin", "-c=hello", "--applychanged", ...MACHINE_READABLE_FLAGS]);
  assert.deepEqual(diffFileCommand("Assets/Foo.prefab").args, ["diff", "Assets/Foo.prefab"]);
  assert.deepEqual(addCommand("Assets/Foo.prefab").args, ["add", "-R", "Assets/Foo.prefab"]);
  assert.deepEqual(undoCommand({ itemPath: "Assets/Foo.prefab" }).args, ["undo", "Assets/Foo.prefab", ...MACHINE_READABLE_FLAGS]);
  assert.deepEqual(undoCommand({ itemPath: "Assets/Folder", recursive: true }).args, ["undo", "Assets/Folder", "--recursive", ...MACHINE_READABLE_FLAGS]);
  assert.deepEqual(branchCreateCommand({ branch: "/main/task", fromChangeset: "cs:1", comment: "c" }).args, ["branch", "create", "/main/task", "--changeset=cs:1", "-c=c"]);
  assert.deepEqual(labelCreateCommand({ label: "L1", target: "cs:2", comment: "c" }).args, ["label", "create", "L1", "cs:2", "-c=c"]);
  assert.deepEqual(switchCommand("/main/task").args, ["switch", "/main/task"]);
  assert.deepEqual(mergeCommand({ source: "/main/task" }).args, ["merge", "/main/task", "--merge", "--nointeractiveresolution", ...MACHINE_READABLE_FLAGS]);
  assert.deepEqual(
    findChangesetsCommand({ query: "where date >= '2026/01/01' order by date desc limit 25", format: "{changesetid}" }).args,
    ["find", "changeset", "where date >= '2026/01/01' order by date desc limit 25", "--format={changesetid}", "--nototal"]
  );
  assert.deepEqual(
    findBranchesCommand({ query: "where name like 'main/tmp/%' order by date desc limit 25", format: "{name}" }).args,
    ["find", "branch", "where name like 'main/tmp/%' order by date desc limit 25", "--format={name}", "--nototal"]
  );

  for (const spec of Object.values(CM_COMMANDS)) {
    assert.equal(Array.isArray(spec.args), true);
    assert.equal(spec.args.every((arg) => typeof arg === "string" && arg.length > 0), true);
  }
});

test("mutating commands are blocked by backend in readonly mode", async () => {
  const config = {
    cmPath: "cm",
    workspace: process.cwd(),
    mode: "readonly"
  };

  await assert.rejects(
    () => runCmSpec(config, CM_COMMANDS.updateMachine),
    /UVCS_MCP_MODE=standard/
  );
});

test("read commands still require workspace when command needs one", async () => {
  const config = {
    cmPath: "cm",
    workspace: "",
    mode: "readonly"
  };

  await assert.rejects(
    () => runCmSpec(config, CM_COMMANDS.statusShort),
    /UVCS_WORKSPACE is required/
  );
});

test("status header exposes repository and server identity for guarded mode", () => {
  assert.deepEqual(
    parseStatusHeaderWorkspaceInfo("/main/feature/test@team/GameClient@server.example:8087 (cs:123 - head)\n"),
    {
      repository: "team/GameClient",
      server: "server.example:8087"
    }
  );
  assert.deepEqual(parseStatusHeaderWorkspaceInfo("cs:100@/main"), {});
});

test("real Plastic workspace files expose their positional name and guid", () => {
  assert.deepEqual(
    parseWorkspaceFile("PhygitalHub\nfb1b6916-1783-45dd-8828-28d26145f3a8\n"),
    {
      workspaceName: "PhygitalHub",
      workspaceGuid: "fb1b6916-1783-45dd-8828-28d26145f3a8"
    }
  );
});
