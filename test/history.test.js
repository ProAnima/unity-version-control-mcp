import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  annotateCommand,
  catCommand,
  findLabelsCommand,
  historyCommand,
  mergePreviewCommand,
  treeDiffCommand
} from "../src/backend/commands.js";
import {
  normalizeObjectSpec,
  parseHistory,
  parseTreeDiff,
  serverPath,
  unityMetaWarnings
} from "../src/services/history.js";
import { parseMergePreview } from "../src/services/merge-preview.js";
import { diffLines, unifiedDiff } from "../src/services/text-diff.js";
import { createTools } from "../src/tools/index.js";

const F = "\u001f";
const emptyWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-history-empty-"));
test.after(() => fs.rm(emptyWorkspace, { recursive: true, force: true }));

function toolsWith(backend, workspace = emptyWorkspace) {
  return createTools({
    config: { workspace, allowedWorkspaces: [], allowedRepos: [], mode: "readonly", tokenTtlSec: 60 },
    backend
  });
}

test("history commands are read-only and never open the cm Diff window", () => {
  const tree = treeDiffCommand({ source: "cs:5", destination: "cs:9", format: "{path}" });
  assert.deepEqual(tree.args, ["diff", "cs:5", "cs:9", "--format={path}", "--repositorypaths"]);
  assert.equal(tree.mutation, false);
  assert.deepEqual(historyCommand({ filePath: "Assets/A.cs", format: "{id}" }).args, ["history", "Assets/A.cs", "--format={id}"]);
  assert.equal(annotateCommand({ spec: "Assets/A.cs", format: "{line}" }).args[0], "annotate");
  assert.deepEqual(catCommand("serverpath:/A.cs#cs:1").args, ["cat", "serverpath:/A.cs#cs:1"]);
  assert.equal(catCommand("serverpath:/A.cs#cs:1").trimOutput, false);
  assert.equal(findLabelsCommand({ query: "limit 1", format: "{name}" }).args.includes("--nototal"), true);

  const preview = mergePreviewCommand({ source: "br:/main/task", destination: "br:/main" });
  assert.equal(preview.mutation, false);
  assert.equal(preview.args.includes("--merge"), false);
  assert.equal(preview.args.includes("--to=br:/main"), true);
});

test("object specs accept real-world names and reject option-like input", () => {
  assert.equal(normalizeObjectSpec("cs:12", "source"), "cs:12");
  assert.equal(normalizeObjectSpec("/6.0 my-project", "source"), "br:/6.0 my-project");
  assert.equal(normalizeObjectSpec("br:/main/task", "source"), "br:/main/task");
  assert.equal(normalizeObjectSpec("lb:build-264 (Dino)", "source"), "lb:build-264 (Dino)");
  assert.equal(normalizeObjectSpec("sh:3", "source"), "sh:3");
  for (const bad of ["-r", "lb:-x", "/main/../x", "cs:1;rm", "br:/main#cs:1", "lb:a@b", ""]) {
    assert.throws(() => normalizeObjectSpec(bad, "source"), /must be one of/, bad);
  }
  assert.throws(() => normalizeObjectSpec("/main", "compareTo", { allow: ["cs", "lb", "sh"] }), /cs:/);
});

test("tree diff rows are parsed with moves and unquoted paths", () => {
  const items = parseTreeDiff([
    ["C", "F", "\"/Assets/A.cs\"", "\"\"", "\"\"", "11", "10"].join(F),
    ["M", "F", "\"/Assets/New/B.cs\"", "\"/Assets/Old/B.cs\"", "\"/Assets/New/B.cs\"", "12", "9"].join(F),
    ["A", "B", "\"/Assets/C.png\"", "\"\"", "\"\"", "13", "-1"].join(F)
  ].join("\r\n"));
  assert.deepEqual(items[0], { status: "changed", type: "text", path: "/Assets/A.cs", revisionId: "11", baseRevisionId: "10" });
  assert.equal(items[1].from, "/Assets/Old/B.cs");
  assert.equal(items[1].to, "/Assets/New/B.cs");
  assert.equal(items[2].baseRevisionId, undefined);
});

test("unity meta warnings flag assets added, moved, or deleted without their .meta", () => {
  const warnings = unityMetaWarnings([
    { status: "added", path: "/Assets/C.png" },
    { status: "added", path: "/Assets/D.png" },
    { status: "added", path: "/Assets/D.png.meta" },
    { status: "deleted", path: "/Assets/E.prefab.meta" },
    { status: "moved", path: "/Assets/F.cs", to: "/Assets/F.cs" },
    { status: "changed", path: "/Assets/G.cs" },
    { status: "added", path: "/ProjectSettings/X.asset" }
  ]);
  assert.deepEqual(warnings.map((warning) => warning.path), ["/Assets/C.png", "/Assets/E.prefab.meta", "/Assets/F.cs"]);
});

test("history records keep multi-line comments and come back newest first", async () => {
  const stdout = [
    ["1", "/main", "d1", "ian", "100", "first\nline two"].join(F),
    ["2", "/main/task", "d2", "ian", "101", "second"].join(F)
  ].map((record) => `${record}\u001e`).join("\r\n");
  assert.equal(parseHistory(stdout)[0].comment, "first\nline two");

  const tools = toolsWith({ history: async () => ({ stdout }) });
  const result = await tools.call("uvcs_file_history", { filePath: "Assets/A.cs", maxResults: 1 });
  assert.equal(result.count, 2);
  assert.equal(result.truncated, true);
  assert.equal(result.revisions[0].changesetId, "2");
});

test("revision diff compares a changeset with its parent through cm cat", async () => {
  const requested = [];
  const tools = toolsWith({
    findChangesets: async ({ query, format }) => {
      assert.equal(query, "where changesetid=42");
      assert.equal(format, "{parent}");
      return { stdout: "41" };
    },
    cat: async (spec) => {
      requested.push(spec);
      return spec.endsWith("#cs:41")
        ? { ok: true, stdout: "a\nb\nc\n" }
        : { ok: true, stdout: "a\nB\nc\n" };
    }
  });
  const result = await tools.call("uvcs_revision_diff", { filePath: "Assets/My Scripts/A.cs", changeset: "cs:42" });
  assert.deepEqual(requested, ["serverpath:/Assets/My Scripts/A.cs#cs:41", "serverpath:/Assets/My Scripts/A.cs#cs:42"]);
  assert.equal(result.change, "changed");
  assert.equal(result.added, 1);
  assert.equal(result.removed, 1);
  assert.match(result.diff, /-b\n\+B/);
});

test("revision diff reports added files, binary files, and compares with the workspace copy", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-history-"));
  try {
    await fs.writeFile(path.join(workspace, "A.txt"), "one\ntwo\n", "utf8");
    const added = await toolsWith({
      // Answers both the parent lookup and the existence check of cs:6.
      findChangesets: async () => ({ stdout: "6" }),
      cat: async (spec) => (spec.endsWith("#cs:6") ? { ok: false, stdout: "", stderr: `The specified revision was not found ${spec}` } : { ok: true, stdout: "x\n" })
    }, workspace).call("uvcs_revision_diff", { filePath: "A.txt", changeset: "cs:7" });
    assert.equal(added.change, "added");
    assert.equal(added.added, 1);

    const binary = await toolsWith({
      cat: async () => ({ ok: true, stdout: "PNG\0\0data" })
    }, workspace).call("uvcs_revision_diff", { filePath: "A.txt", from: "cs:1" });
    assert.equal(binary.binary, true);

    const local = await toolsWith({
      cat: async () => ({ ok: true, stdout: "one\n" })
    }, workspace).call("uvcs_revision_diff", { filePath: "A.txt", from: "/main" });
    assert.equal(local.from, "br:/main");
    assert.equal(local.to, "workspace");
    assert.equal(local.added, 1);

    await assert.rejects(
      () => toolsWith({}, workspace).call("uvcs_revision_diff", { filePath: "A.txt", changeset: "cs:1", from: "cs:0" }),
      /either changeset or from\/to/
    );

    // A misspelled label is reported, not shown as an added file.
    await assert.rejects(
      () => toolsWith({
        cat: async (spec) => ({ ok: false, stdout: "", stderr: `The specified revision was not found ${spec}` }),
        findLabels: async ({ query }) => {
          assert.equal(query, "where name = 'TYPO'");
          return { stdout: "" };
        }
      }, workspace).call("uvcs_revision_diff", { filePath: "A.txt", from: "lb:TYPO" }),
      (error) => error.code === "REVISION_NOT_FOUND" && /lb:TYPO does not exist/.test(error.message)
    );

    // Server or network errors are raised, not treated as a missing file.
    await assert.rejects(
      () => toolsWith({
        cat: async () => ({ ok: false, stdout: "", stderr: "Failed to connect to server:8087" })
      }, workspace).call("uvcs_revision_diff", { filePath: "A.txt", from: "/main" }),
      (error) => error.code === "REVISION_READ_FAILED"
    );

    // Workspace bytes and cm cat bytes are decoded the same way.
    await fs.writeFile(path.join(workspace, "U.txt"), Buffer.from("Привет\n", "utf8"));
    const unicode = await toolsWith({
      cat: async () => ({ ok: true, stdout: "Привет\n" })
    }, workspace).call("uvcs_revision_diff", { filePath: "U.txt", from: "cs:1" });
    assert.equal(unicode.identical, true);
  } finally {
    await fs.rm(workspace, { recursive: true, force: true });
  }
});

test("annotate returns a bounded line window and per-owner counts", async () => {
  const stdout = [1, 2, 3, 4].map((line) => [line, 10 + line, line % 2 ? "ann" : "bob", "2026-01-01T00:00:00", "br:/main", `line ${line}`].join(F)).join("\r\n");
  let requestedSpec;
  const tools = toolsWith({
    annotate: async ({ spec }) => {
      requestedSpec = spec;
      return { stdout };
    }
  });
  const result = await tools.call("uvcs_annotate", { filePath: "Assets/A.cs", revision: "cs:9", startLine: 2, maxLines: 2 });
  assert.equal(requestedSpec, `${serverPath("Assets/A.cs")}#cs:9`);
  assert.deepEqual(result.lines.map((line) => line.line), [2, 3]);
  assert.equal(result.truncated, true);
  assert.deepEqual(result.byOwner, { ann: 2, bob: 2 });
  assert.equal(result.lines[0].branch, "/main");
});

test("branch and label lists build ISO date queries and parse rows", async () => {
  let branchQuery;
  let labelQuery;
  const tools = toolsWith({
    findBranches: async ({ query, isoDates }) => {
      branchQuery = query;
      assert.equal(isoDates, true);
      return { stdout: ["main/task", "2026-01-02T10:00:00", "ian", "main", "100", "task"].join(F) };
    },
    findLabels: async ({ query }) => {
      labelQuery = query;
      return { stdout: ["build-1 (Dino)", "100", "2026-01-03T10:00:00", "ci", "/6.0 game", ""].join(F) };
    }
  });

  const branches = await tools.call("uvcs_branch_list", { parent: "/main", since: "2026-01-01", nameLike: "task" });
  assert.equal(branchQuery, "where name like '%task%' and date >= '2026-01-01T00:00:00' and parent = 'br:/main' order by date desc limit 50");
  assert.deepEqual(branches.branches[0], {
    name: "/main/task",
    date: "2026-01-02T10:00:00",
    owner: "ian",
    parent: "/main",
    headChangeset: "100",
    comment: "task"
  });

  const labels = await tools.call("uvcs_label_list", { branch: "/6.0 game", maxResults: 5 });
  assert.equal(labelQuery, "where branch = '6.0 game' order by date desc limit 5");
  assert.equal(labels.labels[0].spec, "lb:build-1 (Dino)");

  await assert.rejects(() => tools.call("uvcs_branch_list", { nameLike: "x' or 1=1" }), /without quotes/);
  await assert.rejects(() => tools.call("uvcs_label_list", { since: "01.01.2026" }), /YYYY-MM-DD/);
});

test("merge preview groups conflicts and changes and never merges", async () => {
  assert.deepEqual(parseMergePreview(`STATUS${F}ALREADY_CONNECTED${F}No merges detected`), [
    { type: "STATUS", code: "ALREADY_CONNECTED", message: "No merges detected" }
  ]);

  let requested;
  const tools = toolsWith({
    mergePreview: async (payload) => {
      requested = payload;
      return {
        stdout: [
          ["FILE_SRC", "/Assets/A.cs", "1", "2", "50"].join(F),
          ["APPLY", "ADD", "/Assets/B.cs"].join(F),
          ["FILE_CONFLICT", "/Assets/Main.unity", "1", "2", "3"].join(F)
        ].join("\r\n")
      };
    }
  });
  const result = await tools.call("uvcs_merge_preview", { source: "/main/task", destination: "main" });
  assert.deepEqual(requested, { source: "br:/main/task", destination: "br:/main" });
  assert.equal(result.conflictCount, 1);
  assert.equal(result.changeCount, 2);
  assert.equal(result.changes[0].path, "/Assets/A.cs");
  assert.match(result.recommendation, /conflicts/);
});

test("line diff produces minimal edits and unified hunks", () => {
  for (let run = 0; run < 300; run += 1) {
    const random = () => Array.from({ length: Math.floor(Math.random() * 10) }, () => "abc"[Math.floor(Math.random() * 3)]);
    const a = random();
    const b = random();
    const ops = diffLines(a, b);
    assert.deepEqual(ops.filter(([type]) => type !== "+").map(([, line]) => line), a);
    assert.deepEqual(ops.filter(([type]) => type !== "-").map(([, line]) => line), b);
  }
  const result = unifiedDiff("a\nb\nc\n", "a\nc\nd\n", { oldLabel: "old", newLabel: "new", context: 0 });
  assert.equal(result.diff, "--- old\n+++ new\n@@ -2,1 +1,0 @@\n-b\n@@ -3,0 +3,1 @@\n+d");
  assert.equal(unifiedDiff("x\r\n", "x\n").identical, true);
  assert.equal(unifiedDiff("a\nb\n", "c\nd\n", { maxEditDistance: 1 }).tooManyChanges, true);
});
