import test from "node:test";
import assert from "node:assert/strict";
import {
  branchSafetyReport,
  buildBranchCleanupQuery,
  buildRecentChangesetsQuery,
  cleanupCandidates,
  parseBranches
} from "../src/services/safety.js";

test("cleanup branch query is constrained to safe branch prefixes", () => {
  assert.equal(
    buildBranchCleanupQuery({ patterns: ["/main/tmp", "/main/agent"], limit: 25 }),
    "where (name = 'main/tmp' or name like 'main/tmp/%') or (name = 'main/agent' or name like 'main/agent/%') order by date desc limit 25"
  );
});

test("branch parser normalizes branch names", () => {
  assert.deepEqual(
    parseBranches("main/tmp/old\u001f2026-01-01\u001fian\u001ftmp\n/main/agent/work\u001f2026-01-02\u001fbot\u001fagent\n"),
    [
      { name: "/main/tmp/old", date: "2026-01-01", owner: "ian", comment: "tmp" },
      { name: "/main/agent/work", date: "2026-01-02", owner: "bot", comment: "agent" }
    ]
  );
});

test("cleanup candidates are read-only manual review results", async () => {
  const backend = {
    findBranches: async () => ({
      stdout: [
        "main/tmp/old\u001f2026-01-01\u001fian\u001ftmp",
        "main\u001f2026-01-02\u001fian\u001fprotected",
        "main/feature/not-cleanup\u001f2026-01-03\u001fian\u001ffeature",
        ""
      ].join("\n")
    })
  };

  const result = await cleanupCandidates({ backend, patterns: ["/main/tmp"], maxResults: 10 });

  assert.equal(result.mode, "read-only");
  assert.equal(result.count, 1);
  assert.equal(result.candidates[0].name, "/main/tmp/old");
  assert.match(result.warning, /never deletes/);
});

test("branch safety report summarizes pending changes and recent changesets", async () => {
  const backend = {
    branchInfo: async () => ({ branchLine: "cs:42@/main/feature/work" }),
    pendingChanges: async () => ({ stdout: "CHANGED\u001fAssets/Foo.prefab\u001f1\n" }),
    findChangesets: async () => ({
      stdout: "42\u001f/main/feature/work\u001f2026-01-01\u001fian\u001ffeat: work\n"
    })
  };

  const report = await branchSafetyReport({ backend });

  assert.equal(report.currentBranch, "/main/feature/work");
  assert.equal(report.pendingChanges.count, 1);
  assert.equal(report.pendingChanges.clean, false);
  assert.equal(report.recentChangesets.length, 1);
  assert.match(report.recommendations.join(" "), /pending changes/i);
});

test("recent changesets query validates branch names", () => {
  assert.equal(
    buildRecentChangesetsQuery({ branch: "/main/feature/work", limit: 5 }),
    "where branch = 'main/feature/work' order by date desc limit 5"
  );
  assert.throws(
    () => buildRecentChangesetsQuery({ branch: "../outside", limit: 5 }),
    /safe branch/
  );
});
