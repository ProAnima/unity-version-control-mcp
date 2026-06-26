import { UvcsError } from "../backend/errors.js";

const BRANCH_FORMAT = "{name}\u001f{date}\u001f{owner}\u001f{comment}";
const RECENT_CHANGESET_FORMAT = "{changesetid}\u001f{branch}\u001f{date}\u001f{owner}\u001f{comment}";
const DEFAULT_CLEANUP_PATTERNS = ["/main/tmp", "/main/agent", "/main/sandbox"];

export async function cleanupCandidates({ backend, patterns = DEFAULT_CLEANUP_PATTERNS, maxResults = 50 } = {}) {
  const safeMaxResults = clampMaxResults(maxResults);
  const safePatterns = normalizePatterns(patterns);
  const query = buildBranchCleanupQuery({ patterns: safePatterns, limit: safeMaxResults });
  const result = await backend.findBranches({
    query,
    format: BRANCH_FORMAT
  });
  const branches = parseBranches(result.stdout)
    .filter((branch) => safePatterns.some((pattern) => branch.name === pattern || branch.name.startsWith(`${pattern}/`)))
    .filter((branch) => !isProtectedBranch(branch.name))
    .slice(0, safeMaxResults);

  return {
    ok: true,
    mode: "read-only",
    query,
    patterns: safePatterns,
    count: branches.length,
    candidates: branches.map((branch) => ({
      ...branch,
      risk: cleanupRisk(branch.name),
      manualAction: `Review in UVCS/Plastic before deleting branch ${branch.name}`
    })),
    warning: "This tool never deletes branches or changesets. Treat candidates as a manual review queue."
  };
}

export async function branchSafetyReport({ backend, branch, recentChangesets = 10 } = {}) {
  const branchInfo = await backend.branchInfo();
  const currentBranch = parseBranchFromStatus(branchInfo.branchLine || branchInfo.stdout);
  const targetBranch = branch ? normalizeBranch(branch) : currentBranch;
  const pending = await backend.pendingChanges();
  const pendingCount = countLikelyChangedFiles(pending.stdout);
  const recentLimit = clampMaxResults(recentChangesets, 1, 50);
  const query = buildRecentChangesetsQuery({ branch: targetBranch, limit: recentLimit });
  const recentResult = await backend.findChangesets({
    query,
    format: RECENT_CHANGESET_FORMAT
  });
  const recent = parseChangesets(recentResult.stdout);

  return {
    ok: true,
    mode: "read-only",
    currentBranch,
    targetBranch,
    onTargetBranch: currentBranch === targetBranch,
    pendingChanges: {
      count: pendingCount,
      clean: pendingCount === 0,
      raw: pending.stdout
    },
    recentChangesets: recent,
    recommendations: branchSafetyRecommendations({
      currentBranch,
      targetBranch,
      pendingCount,
      recentCount: recent.length
    }),
    warning: "This report is advisory. It does not delete branches or changesets."
  };
}

export function buildBranchCleanupQuery({ patterns, limit }) {
  const safePatterns = normalizePatterns(patterns);
  const conditions = safePatterns.map((pattern) => {
    const clean = pattern.replace(/^\/+/, "");
    return `(name = '${escapeFindLiteral(clean)}' or name like '${escapeFindLiteral(clean)}/%')`;
  });
  return `where ${conditions.join(" or ")} order by date desc limit ${clampMaxResults(limit)}`;
}

export function buildRecentChangesetsQuery({ branch, limit }) {
  const cleanBranch = normalizeBranch(branch).replace(/^\/+/, "");
  return `where branch = '${escapeFindLiteral(cleanBranch)}' order by date desc limit ${clampMaxResults(limit, 1, 50)}`;
}

export function parseBranches(stdout) {
  return String(stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("Total:"))
    .map((line) => {
      const [name, date, owner, ...commentParts] = line.split("\u001f");
      return {
        name: name?.startsWith("/") ? name : `/${name}`,
        date,
        owner,
        comment: commentParts.join("\u001f")
      };
    })
    .filter((row) => row.name && row.name !== "/undefined");
}

function parseChangesets(stdout) {
  return String(stdout ?? "")
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

function branchSafetyRecommendations({ currentBranch, targetBranch, pendingCount, recentCount }) {
  const recommendations = [];
  if (currentBranch !== targetBranch) {
    recommendations.push("Switch to the target branch or explicitly confirm you are reviewing another branch.");
  }
  if (pendingCount > 0) {
    recommendations.push("Resolve or check in pending changes before switching, merging, or release work.");
  }
  if (recentCount === 0) {
    recommendations.push("No recent changesets were found for this branch; verify the branch name before planning work.");
  }
  if (recommendations.length === 0) {
    recommendations.push("Branch looks clean for normal read-only planning. Use prepare/confirm tools for any write operation.");
  }
  return recommendations;
}

function parseBranchFromStatus(text) {
  const match = String(text ?? "").match(/@((?:\/?[A-Za-z0-9._-]+)(?:\/[A-Za-z0-9._-]+)*)/);
  if (match) return normalizeBranch(match[1]);
  return "/main";
}

function countLikelyChangedFiles(statusText) {
  if (!String(statusText ?? "").trim()) return 0;
  return String(statusText)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("Total:"))
    .filter((line) => !line.startsWith("STATUS\u001f"))
    .filter((line) => !line.startsWith("STAGE\u001f"))
    .length;
}

function normalizePatterns(patterns) {
  const list = Array.isArray(patterns)
    ? patterns
    : String(patterns ?? "").split(/[;,]/);
  const normalized = list.map((item) => normalizeBranch(item)).filter(Boolean);
  if (normalized.length === 0) {
    throw new UvcsError("At least one branch pattern is required", { code: "INVALID_BRANCH_PATTERN" });
  }
  return [...new Set(normalized)];
}

function normalizeBranch(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new UvcsError("Branch must be a non-empty string", { code: "INVALID_BRANCH_SPEC" });
  }
  const clean = value.trim();
  if (!/^\/?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(clean)) {
    throw new UvcsError("Branch must be a safe branch path", {
      code: "INVALID_BRANCH_SPEC",
      details: { branch: value }
    });
  }
  if (clean.split("/").some((segment) => segment === "." || segment === "..")) {
    throw new UvcsError("Branch must be a safe branch path", {
      code: "INVALID_BRANCH_SPEC",
      details: { branch: value }
    });
  }
  return clean.startsWith("/") ? clean : `/${clean}`;
}

function isProtectedBranch(branch) {
  return ["/main", "/master", "/trunk", "/develop", "/dev"].includes(branch);
}

function cleanupRisk(branch) {
  if (/\/(tmp|temp|sandbox|agent)\//i.test(branch)) return "lower";
  return "review";
}

function clampMaxResults(maxResults, min = 1, max = 200) {
  const parsed = Number(maxResults);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new UvcsError(`maxResults must be an integer from ${min} to ${max}`, {
      code: "INVALID_MAX_RESULTS"
    });
  }
  return parsed;
}

function escapeFindLiteral(value) {
  return value.replace(/'/g, "''").replace(/%/g, "\\%");
}
