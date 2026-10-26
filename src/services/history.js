import fs from "node:fs/promises";
import path from "node:path";
import { UvcsError } from "../backend/errors.js";
import { decodeProcessOutput } from "../backend/output-encoding.js";
import { pathKey, pendingItems } from "./pending.js";
import { isProbablyBinary, unifiedDiff } from "./text-diff.js";

const FIELD = "\u001f";
const RECORD = "\u001e";
const TREE_DIFF_FORMAT = ["{status}", "{type}", "{path}", "{srccmpath}", "{dstcmpath}", "{revid}", "{baserevid}"].join(FIELD);
// History comments can span several lines, so each record ends with RECORD.
const HISTORY_FORMAT = `${["{changesetid}", "{branch}", "{date}", "{owner}", "{id}", "{comment}"].join(FIELD)}${RECORD}`;
const ANNOTATE_FORMAT = ["{line}", "{changeset}", "{owner}", "{date}", "{branch}", "{content}"].join(FIELD);
const BRANCH_FORMAT = ["{name}", "{date}", "{owner}", "{parent}", "{changeset}", "{comment}"].join(FIELD);
const LABEL_FORMAT = ["{name}", "{changeset}", "{date}", "{owner}", "{branch}", "{comment}"].join(FIELD);

const STATUS_NAMES = { A: "added", C: "changed", D: "deleted", M: "moved" };
const TYPE_NAMES = { D: "directory", B: "binary", F: "text", S: "symlink", X: "xlink" };

// Read-only object specs. Names may contain spaces (for example
// "/6.0 my-project" or "build-264 (Dino)"), but never start with "-", so cm
// cannot read them as options, and never contain spec separators.
const NAME_SEGMENT = String.raw`[\p{L}\p{N}._][\p{L}\p{N}._ ()+-]*`;
const BRANCH_PATTERN = new RegExp(`^/?${NAME_SEGMENT}(?:/${NAME_SEGMENT})*$`, "u");
const LABEL_PATTERN = new RegExp(`^${NAME_SEGMENT}$`, "u");

export function normalizeBranch(value, name = "branch") {
  if (typeof value !== "string") throw invalidSpec(name, value);
  const branch = value.trim().replace(/^br:/, "");
  if (!BRANCH_PATTERN.test(branch) || branch.split("/").some((segment) => segment === "." || segment === "..")) {
    throw invalidSpec(name, value);
  }
  return branch.startsWith("/") ? branch : `/${branch}`;
}

// Accepts cs:N, lb:NAME, sh:N, br:/branch, or a bare /branch path and returns
// the cm object spec.
export function normalizeObjectSpec(value, name, { allow = ["cs", "lb", "br", "sh"] } = {}) {
  if (typeof value !== "string" || value.trim() === "") throw invalidSpec(name, value);
  const spec = value.trim();
  const changeset = spec.match(/^cs:(\d+)$/);
  if (changeset) return assertAllowed("cs", `cs:${changeset[1]}`);
  const shelve = spec.match(/^sh:(\d+)$/);
  if (shelve) return assertAllowed("sh", `sh:${shelve[1]}`);
  if (spec.startsWith("lb:")) {
    const label = spec.slice(3);
    if (!LABEL_PATTERN.test(label)) throw invalidSpec(name, value);
    return assertAllowed("lb", `lb:${label}`);
  }
  return assertAllowed("br", `br:${normalizeBranch(spec, name)}`);

  function assertAllowed(kind, result) {
    if (!allow.includes(kind)) throw invalidSpec(name, value, allow);
    return result;
  }
}

export async function changesetDiff({ backend, source, compareTo, maxItems = 500 }) {
  const sourceSpec = normalizeObjectSpec(source, "source");
  const destinationSpec = compareTo ? normalizeObjectSpec(compareTo, "compareTo", { allow: ["cs", "lb", "sh"] }) : undefined;
  if (destinationSpec && sourceSpec.startsWith("br:")) {
    throw new UvcsError("compareTo cannot be combined with a branch source; a branch diff always compares the whole branch", {
      code: "INVALID_DIFF_SPEC"
    });
  }
  const limit = clampInteger(maxItems, "maxItems", 1, 5_000);
  const result = await backend.treeDiff({ source: sourceSpec, destination: destinationSpec, format: TREE_DIFF_FORMAT });
  const items = parseTreeDiff(result.stdout);
  return {
    mode: "read-only",
    source: sourceSpec,
    ...(destinationSpec ? { compareTo: destinationSpec } : {}),
    count: items.length,
    byStatus: countBy(items, "status"),
    byType: countBy(items, "type"),
    unityMetaWarnings: unityMetaWarnings(items),
    truncated: items.length > limit,
    items: items.slice(0, limit),
    nextStep: "Use uvcs_revision_diff with filePath and changeset (or from/to) to read the line changes of a text file."
  };
}

export function parseTreeDiff(stdout) {
  return String(stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes(FIELD))
    .map((line) => {
      const [status, type, itemPath, sourcePath, destinationPath, revisionId, baseRevisionId] = line.split(FIELD).map(unquote);
      const item = {
        status: STATUS_NAMES[status] ?? status,
        type: TYPE_NAMES[type] ?? type,
        path: itemPath
      };
      if (status === "M") {
        item.from = sourcePath;
        item.to = destinationPath || itemPath;
      }
      if (revisionId && revisionId !== "-1") item.revisionId = revisionId;
      if (baseRevisionId && baseRevisionId !== "-1") item.baseRevisionId = baseRevisionId;
      return item;
    })
    .filter((item) => item.path);
}

// Unity keeps GUIDs in .meta files. An asset added, deleted, or moved without
// its .meta (or the reverse) breaks references in other assets.
export function unityMetaWarnings(items) {
  const byStatus = new Map();
  for (const item of items) {
    const key = item.status;
    if (!byStatus.has(key)) byStatus.set(key, new Set());
    byStatus.get(key).add(item.status === "moved" ? item.to : item.path);
  }
  const warnings = [];
  for (const item of items) {
    if (!["added", "deleted", "moved"].includes(item.status)) continue;
    const itemPath = item.status === "moved" ? item.to : item.path;
    if (!/^\/?Assets\//.test(itemPath)) continue;
    const paths = byStatus.get(item.status);
    if (itemPath.endsWith(".meta")) {
      const assetPath = itemPath.slice(0, -".meta".length);
      if (!paths.has(assetPath)) warnings.push({ path: itemPath, status: item.status, issue: `.meta ${item.status} without its asset` });
    } else if (!paths.has(`${itemPath}.meta`)) {
      warnings.push({ path: itemPath, status: item.status, issue: `asset ${item.status} without its .meta` });
    }
  }
  return warnings;
}

export async function fileHistory({ backend, filePath, maxResults = 50 }) {
  const limit = clampInteger(maxResults, "maxResults", 1, 500);
  const result = await backend.history({ filePath, format: HISTORY_FORMAT });
  const revisions = parseHistory(result.stdout);
  // cm lists the oldest revision first; agents almost always want the newest.
  const newestFirst = revisions.reverse();
  return {
    mode: "read-only",
    filePath,
    count: newestFirst.length,
    truncated: newestFirst.length > limit,
    revisions: newestFirst.slice(0, limit)
  };
}

export function parseHistory(stdout) {
  return String(stdout ?? "")
    .split(RECORD)
    .map((record) => record.replace(/^\s+/, "").replace(/\s+$/, ""))
    .filter((record) => record.includes(FIELD))
    .map((record) => {
      const [changesetId, branch, date, owner, revisionId, ...commentParts] = record.split(FIELD);
      return {
        changesetId,
        branch,
        date,
        owner,
        revisionId,
        comment: commentParts.join(FIELD).trim()
      };
    });
}

export async function annotateFile({ backend, filePath, revision, startLine = 1, maxLines = 500 }) {
  const first = clampInteger(startLine, "startLine", 1, 10_000_000);
  const count = clampInteger(maxLines, "maxLines", 1, 5_000);
  const revisionSpec = revision ? normalizeObjectSpec(revision, "revision", { allow: ["cs", "lb", "br"] }) : undefined;
  const spec = revisionSpec ? `${serverPath(filePath)}#${revisionSpec}` : filePath;
  const result = await backend.annotate({ spec, format: ANNOTATE_FORMAT });
  const lines = parseAnnotate(result.stdout);
  const selected = lines.filter((line) => line.line >= first && line.line < first + count);
  return {
    mode: "read-only",
    filePath,
    ...(revisionSpec ? { revision: revisionSpec } : {}),
    totalLines: lines.length,
    startLine: first,
    truncated: lines.some((line) => line.line >= first + count),
    byOwner: countBy(lines, "owner"),
    lines: selected
  };
}

export function parseAnnotate(stdout) {
  return String(stdout ?? "")
    .split(/\r?\n/)
    .filter((line) => line.includes(FIELD))
    .map((line) => {
      const [lineNumber, changesetId, owner, date, branch, ...contentParts] = line.split(FIELD);
      return {
        line: Number(lineNumber),
        changesetId,
        owner,
        date,
        branch: String(branch ?? "").replace(/^br:/, ""),
        content: contentParts.join(FIELD)
      };
    })
    .filter((line) => Number.isInteger(line.line));
}

export async function revisionDiff({ backend, workspace, filePath, changeset, from, to, context = 3, maxChars = 200_000 }) {
  const contextLines = clampInteger(context, "context", 0, 20);
  let fromSpec;
  let toSpec;
  if (changeset) {
    if (from || to) {
      throw new UvcsError("Use either changeset or from/to, not both", { code: "INVALID_DIFF_SPEC" });
    }
    toSpec = normalizeObjectSpec(changeset, "changeset", { allow: ["cs"] });
    fromSpec = await parentChangeset(backend, toSpec);
  } else {
    if (!from) {
      throw new UvcsError("Pass changeset, or from (and optionally to)", { code: "INVALID_DIFF_SPEC" });
    }
    fromSpec = normalizeObjectSpec(from, "from", { allow: ["cs", "lb", "br"] });
    toSpec = to ? normalizeObjectSpec(to, "to", { allow: ["cs", "lb", "br"] }) : undefined;
  }

  const oldSide = fromSpec ? await readRevision(backend, filePath, fromSpec) : { exists: false, content: "", label: "none" };
  const newSide = toSpec ? await readRevision(backend, filePath, toSpec) : await readWorkspaceFile(workspace, filePath);
  if (!oldSide.exists && !newSide.exists) {
    throw new UvcsError(`${filePath} exists in neither ${oldSide.label} nor ${newSide.label}`, {
      code: "REVISION_NOT_FOUND",
      details: { from: oldSide.label, to: newSide.label, reason: oldSide.error || newSide.error }
    });
  }

  return compareSides({ filePath, oldSide, newSide, context: contextLines, maxChars });
}

// `cm diff <path>` opens the GUI diff tool and waits until it is closed, so a
// pending change is compared here: the revision loaded in the workspace (from
// the status header) against the file on disk.
export async function pendingFileDiff({ backend, workspace, filePath, context = 3, maxChars = 200_000 }) {
  const contextLines = clampInteger(context, "context", 0, 20);
  const status = await backend.pendingChanges();
  const loaded = String(status.stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim().split(FIELD))
    .find((fields) => fields[0] === "STATUS")?.[1];
  const itemPath = String(filePath).split(path.sep).join("/");
  const item = pendingItems(status.stdout, workspace).find((candidate) => pathKey(candidate.path) === pathKey(itemPath));
  if (!item?.tracked) {
    throw new UvcsError(`${itemPath} has no tracked pending change`, {
      code: "NO_PENDING_CHANGE",
      details: { path: itemPath, status: item?.code ?? "unchanged" }
    });
  }
  if (!/^\d+$/.test(loaded ?? "")) {
    throw new UvcsError("Cannot read the loaded changeset from cm status", { code: "WORKSPACE_REVISION_UNKNOWN" });
  }
  const spec = `cs:${loaded}`;
  const oldSide = item.code === "AD"
    ? { exists: false, content: "", label: "new" }
    : await readRevision(backend, item.from ?? itemPath, spec);
  const newSide = await readWorkspaceFile(workspace, itemPath);
  const result = compareSides({ filePath: itemPath, oldSide, newSide, context: contextLines, maxChars });
  return { ...result, status: item.code, ...(item.from ? { movedFrom: item.from } : {}) };
}

function compareSides({ filePath, oldSide, newSide, context: contextLines, maxChars }) {
  const base = {
    mode: "read-only",
    filePath,
    from: oldSide.label,
    to: newSide.label,
    change: !oldSide.exists ? "added" : !newSide.exists ? "deleted" : "changed"
  };
  if (isProbablyBinary(oldSide.content) || isProbablyBinary(newSide.content)) {
    return { ...base, binary: true, identical: oldSide.content === newSide.content };
  }

  const result = unifiedDiff(oldSide.content, newSide.content, {
    oldLabel: `${filePath} (${oldSide.label})`,
    newLabel: `${filePath} (${newSide.label})`,
    context: contextLines
  });
  if (result.tooManyChanges) {
    return {
      ...base,
      binary: false,
      tooManyChanges: true,
      warning: "The revisions differ in too many lines for a line diff. Narrow the range or inspect the file in the UVCS client."
    };
  }
  return {
    ...base,
    binary: false,
    identical: result.identical,
    added: result.added,
    removed: result.removed,
    truncated: result.diff.length > maxChars,
    diff: result.diff.length > maxChars ? `${result.diff.slice(0, maxChars)}\n… [truncated ${result.diff.length - maxChars} characters]` : result.diff
  };
}

async function parentChangeset(backend, changesetSpec) {
  const id = changesetSpec.slice(3);
  const result = await backend.findChangesets({ query: `where changesetid=${id}`, format: "{parent}" });
  const parent = String(result.stdout ?? "").split(/\r?\n/).map((line) => line.trim()).find(Boolean);
  if (parent === undefined) {
    throw new UvcsError(`Changeset ${changesetSpec} was not found`, { code: "REVISION_NOT_FOUND", details: { changeset: changesetSpec } });
  }
  // Changeset 0 (the repository root) has no parent.
  return /^\d+$/.test(parent) ? `cs:${parent}` : undefined;
}

// cm cat prints "The specified revision was not found" both when the file is
// absent in that revision and when the changeset, label, or branch does not
// exist, so a miss is only accepted after the spec itself is confirmed.
async function readRevision(backend, filePath, spec) {
  const result = await backend.cat(`${serverPath(filePath)}#${spec}`);
  if (result.ok) return { exists: true, content: result.stdout, label: spec };
  const error = (result.stderr || result.stdout || "").trim();
  if (!/revision was not found/i.test(error)) {
    throw new UvcsError(`Cannot read ${filePath} at ${spec}: ${error}`, {
      code: "REVISION_READ_FAILED",
      details: { spec, error }
    });
  }
  if (!(await objectSpecExists(backend, spec))) {
    throw new UvcsError(`${spec} does not exist in this repository`, {
      code: "REVISION_NOT_FOUND",
      details: { spec }
    });
  }
  return { exists: false, content: "", label: spec };
}

async function objectSpecExists(backend, spec) {
  const [kind, value] = [spec.slice(0, 2), spec.slice(3)];
  let result;
  if (kind === "cs") {
    result = await backend.findChangesets({ query: `where changesetid=${value}`, format: "{changesetid}" });
  } else if (kind === "lb") {
    result = await backend.findLabels({ query: `where name = '${value}'`, format: "{name}" });
  } else {
    result = await backend.findBranches({ query: `where name = '${value.replace(/^\/+/, "")}'`, format: "{name}" });
  }
  return String(result.stdout ?? "").trim().length > 0;
}

async function readWorkspaceFile(workspace, filePath) {
  try {
    // Decoded with the same rule as cm cat output, so both sides compare alike.
    const content = decodeProcessOutput(await fs.readFile(path.join(workspace, filePath)), { encoding: "auto" });
    return { exists: true, content, label: "workspace" };
  } catch (error) {
    if (error?.code === "ENOENT") return { exists: false, content: "", label: "workspace" };
    throw error;
  }
}

// Workspace-relative paths map to repository paths when the workspace root is
// the repository root, which is the only layout this server supports.
export function serverPath(filePath) {
  return `serverpath:/${String(filePath).split(path.sep).join("/").replace(/^\/+/, "")}`;
}

export async function listBranches({ backend, nameLike, owner, since, parent, maxResults = 50 }) {
  const limit = clampInteger(maxResults, "maxResults", 1, 500);
  const conditions = [];
  if (nameLike) conditions.push(`name like '%${findLiteral(nameLike, "nameLike")}%'`);
  if (owner) conditions.push(`owner = '${findLiteral(owner, "owner")}'`);
  if (since) conditions.push(`date >= '${isoDate(since, "since")}T00:00:00'`);
  if (parent) conditions.push(`parent = 'br:${normalizeBranch(parent, "parent")}'`);
  const query = whereClause(conditions, limit);
  const result = await backend.findBranches({ query, format: BRANCH_FORMAT, isoDates: true });
  const branches = parseRows(result.stdout).map(([name, date, rowOwner, parentBranch, headChangeset, ...comment]) => ({
    name: name.startsWith("/") ? name : `/${name}`,
    date,
    owner: rowOwner,
    parent: parentBranch ? (parentBranch.startsWith("/") ? parentBranch : `/${parentBranch}`) : null,
    headChangeset,
    comment: comment.join(FIELD)
  }));
  return { mode: "read-only", query, count: branches.length, branches };
}

export async function listLabels({ backend, nameLike, owner, since, branch, maxResults = 50 }) {
  const limit = clampInteger(maxResults, "maxResults", 1, 500);
  const conditions = [];
  if (nameLike) conditions.push(`name like '%${findLiteral(nameLike, "nameLike")}%'`);
  if (owner) conditions.push(`owner = '${findLiteral(owner, "owner")}'`);
  if (since) conditions.push(`date >= '${isoDate(since, "since")}T00:00:00'`);
  if (branch) conditions.push(`branch = '${normalizeBranch(branch, "branch").replace(/^\/+/, "")}'`);
  const query = whereClause(conditions, limit);
  const result = await backend.findLabels({ query, format: LABEL_FORMAT });
  const labels = parseRows(result.stdout).map(([name, changesetId, date, rowOwner, labelBranch, ...comment]) => ({
    name,
    spec: `lb:${name}`,
    changesetId,
    date,
    owner: rowOwner,
    branch: labelBranch,
    comment: comment.join(FIELD)
  }));
  return { mode: "read-only", query, count: labels.length, labels };
}

function whereClause(conditions, limit) {
  const where = conditions.length > 0 ? `where ${conditions.join(" and ")} ` : "";
  return `${where}order by date desc limit ${limit}`;
}

function parseRows(stdout) {
  return String(stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes(FIELD))
    .map((line) => line.split(FIELD));
}

// find queries run with --dateformat=ISO_DATE_FORMAT, and cm parses date
// literals in the query with that same format.
export function isoDate(value, name) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new UvcsError(`${name} must use YYYY-MM-DD format`, { code: "INVALID_DATE", details: { name, value } });
  }
  return value;
}

function findLiteral(value, name) {
  if (typeof value !== "string" || value.trim() === "" || /['\r\n%]/.test(value)) {
    throw new UvcsError(`${name} must be a non-empty single line without quotes or %`, {
      code: "INVALID_FIND_FILTER",
      details: { name }
    });
  }
  return value.trim();
}

function clampInteger(value, name, min, max) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new UvcsError(`${name} must be an integer from ${min} to ${max}`, { code: "INVALID_MAX_RESULTS", details: { name } });
  }
  return parsed;
}

function countBy(rows, key) {
  return rows.reduce((acc, row) => {
    const value = row[key] || "unknown";
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function unquote(value) {
  const text = String(value ?? "").trim();
  return text.length >= 2 && text.startsWith("\"") && text.endsWith("\"") ? text.slice(1, -1) : text;
}

function invalidSpec(name, value, allow) {
  const kinds = allow ? allow.map((kind) => (kind === "br" ? "/branch" : `${kind}:…`)).join(", ") : "cs:123, lb:NAME, sh:12, or /main/branch";
  return new UvcsError(`${name} must be one of: ${kinds}`, { code: "INVALID_OBJECT_SPEC", details: { name, value } });
}
