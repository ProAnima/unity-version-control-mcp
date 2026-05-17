import test from "node:test";
import assert from "node:assert/strict";
import { buildChangesetQuery, parseChangesets } from "../src/services/analytics.js";

test("changeset analytics builds safe find query", () => {
  assert.equal(
    buildChangesetQuery({
      since: "2026-01-01",
      until: "2026-01-31",
      branch: "/main/release",
      owner: "ian",
      commentLike: "release",
      limit: 25
    }),
    "where date >= '2026/01/01' and date <= '2026/01/31' and branch = 'main/release' and owner = 'ian' and comment like '%release%' order by date desc limit 25"
  );
});

test("changeset analytics parses formatted rows", () => {
  const rows = parseChangesets("91\u001f/main\u001f2026-05-17\u001fian\u001ffix: one\n92\u001f/main/release\u001f2026-05-18\u001fian\u001frelease: two\n");
  assert.deepEqual(rows, [
    {
      changesetId: "91",
      branch: "/main",
      date: "2026-05-17",
      owner: "ian",
      comment: "fix: one"
    },
    {
      changesetId: "92",
      branch: "/main/release",
      date: "2026-05-18",
      owner: "ian",
      comment: "release: two"
    }
  ]);
});
