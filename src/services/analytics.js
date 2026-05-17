import { UvcsError } from "../backend/errors.js";

const FIND_FORMAT = "{changesetid}\u001f{branch}\u001f{date}\u001f{owner}\u001f{comment}";

export async function changesetAnalytics({ backend, since, until, branch, owner, commentLike, maxResults = 100 }) {
  const safeMaxResults = clampMaxResults(maxResults);
  const query = buildChangesetQuery({ since, until, branch, owner, commentLike, limit: safeMaxResults });
  const result = await backend.findChangesets({
    query,
    format: FIND_FORMAT
  });
  const changesets = parseChangesets(result.stdout);
  return {
    query,
    count: changesets.length,
    byOwner: countBy(changesets, "owner"),
    byBranch: countBy(changesets, "branch"),
    changesets,
    raw: result
  };
}

export function buildChangesetQuery({ since, until, branch, owner, commentLike, limit = 100 }) {
  const conditions = [];
  if (since) conditions.push(`date >= '${assertDate(since, "since")}'`);
  if (until) conditions.push(`date <= '${assertDate(until, "until")}'`);
  if (branch) conditions.push(`branch = '${escapeFindLiteral(normalizeBranchForFind(branch))}'`);
  if (owner) conditions.push(`owner = '${escapeFindLiteral(assertSafeText(owner, "owner"))}'`);
  if (commentLike) conditions.push(`comment like '%${escapeFindLiteral(assertSafeText(commentLike, "commentLike"))}%'`);
  const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
  return `${where} order by date desc limit ${clampMaxResults(limit)}`.trim();
}

export function parseChangesets(stdout) {
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("Total:"))
    .map((line) => {
      const [changesetId, branch, date, owner, ...commentParts] = line.split("\u001f");
      return {
        changesetId,
        branch,
        date,
        owner,
        comment: commentParts.join("\u001f")
      };
    })
    .filter((row) => row.changesetId);
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] || "unknown";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function clampMaxResults(maxResults) {
  const parsed = Number(maxResults);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 500) {
    throw new UvcsError("maxResults must be an integer from 1 to 500", { code: "INVALID_MAX_RESULTS" });
  }
  return parsed;
}

function assertDate(value, name) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new UvcsError(`${name} must use YYYY-MM-DD format`, {
      code: "INVALID_DATE",
      details: { name, value }
    });
  }
  return value.replaceAll("-", "/");
}

function normalizeBranchForFind(branch) {
  const clean = assertSafeText(branch, "branch").replace(/^\/+/, "");
  if (!/^[A-Za-z0-9._/-]+$/.test(clean)) {
    throw new UvcsError("branch contains unsupported characters", { code: "INVALID_BRANCH_SPEC" });
  }
  return clean;
}

function assertSafeText(value, name) {
  if (typeof value !== "string" || value.trim().length === 0 || /['\r\n]/.test(value)) {
    throw new UvcsError(`${name} must be a non-empty single line without quotes`, {
      code: "INVALID_FIND_FILTER",
      details: { name }
    });
  }
  return value.trim();
}

function escapeFindLiteral(value) {
  return value.replace(/%/g, "\\%");
}
