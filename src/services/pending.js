import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const FIELD_SEPARATOR = "\u001f";
// Header rows and items that `cm checkin --applychanged`, switch, and merge do
// not act on. Private and ignored items stay visible in raw status output.
const HEADER_STATUSES = new Set(["STATUS", "STAGE"]);
const UNTRACKED_STATUSES = new Set(["PR", "IG"]);

export function summarizePendingChanges(statusText) {
  const lines = statusLines(statusText);
  const header = lines.filter((line) => HEADER_STATUSES.has(statusCode(line)));
  const tracked = [];
  let untracked = 0;
  for (const line of lines) {
    const code = statusCode(line);
    if (HEADER_STATUSES.has(code)) continue;
    if (UNTRACKED_STATUSES.has(code)) {
      untracked += 1;
      continue;
    }
    tracked.push(line);
  }

  return {
    trackedCount: tracked.length,
    untrackedCount: untracked,
    fingerprint: crypto
      .createHash("sha256")
      .update([...header, ...tracked].join("\n"), "utf8")
      .digest("hex")
  };
}

export function countTrackedChanges(statusText) {
  return summarizePendingChanges(statusText).trackedCount;
}

export function fingerprintPendingChanges(statusText) {
  return summarizePendingChanges(statusText).fingerprint;
}

function statusLines(statusText) {
  return String(statusText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("Total:"));
}

function statusCode(line) {
  const separator = line.indexOf(FIELD_SEPARATOR);
  return separator === -1 ? "" : line.slice(0, separator);
}

const MOVE_STATUSES = new Set(["LM", "MV"]);

// Parses `cm status --machinereadable` rows into workspace-relative items.
// Rows are `<code> <absolute path> <merge info…>`; moves carry the source and
// destination paths, and locally moved rows (LM) start with a similarity.
export function pendingItems(statusText, workspace) {
  const roots = workspaceRoots(workspace);
  const items = [];
  for (const line of statusLines(statusText)) {
    const fields = line.split(FIELD_SEPARATOR);
    const code = fields[0];
    if (HEADER_STATUSES.has(code)) continue;
    const absolutePaths = fields.slice(1).filter(isAbsolutePath);
    if (absolutePaths.length === 0) continue;
    const item = { code, tracked: !UNTRACKED_STATUSES.has(code), line };
    if (MOVE_STATUSES.has(code) && absolutePaths.length >= 2) {
      item.from = toRelative(roots, absolutePaths[0]);
      item.path = toRelative(roots, absolutePaths[1]);
    } else {
      item.path = toRelative(roots, absolutePaths[0]);
    }
    items.push(item);
  }
  return items;
}

// Items a path-scoped checkin of `paths` takes: the path itself, everything
// below it, and moves whose source or destination is there.
export function itemsUnderPaths(items, paths) {
  const keys = paths.map(pathKey);
  const under = (itemPath) => itemPath !== undefined && keys.some((key) => {
    const candidate = pathKey(itemPath);
    return candidate === key || candidate.startsWith(`${key}/`);
  });
  return items.filter((item) => under(item.path) || under(item.from));
}

export function fingerprintItems(statusText, items) {
  const header = statusLines(statusText).filter((line) => HEADER_STATUSES.has(statusCode(line)));
  return crypto
    .createHash("sha256")
    .update([...header, ...items.map((item) => item.line)].join("\n"), "utf8")
    .digest("hex");
}

export function pathKey(itemPath) {
  const normalized = String(itemPath ?? "").replaceAll("\\", "/").replace(/\/+$/, "");
  return process.platform === "win32" ? normalized.toLowerCase() : normalized;
}

function isAbsolutePath(value) {
  return path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value);
}

// cm prints long paths, while the configured workspace may be a short (8.3),
// differently cased, or linked path, so both forms of the root are tried.
function toRelative(roots, absolutePath) {
  const candidates = roots.map((root) => path.relative(root, absolutePath));
  const inside = candidates.find((relative) => relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
  return (inside ?? candidates[0]).split(path.sep).join("/");
}

function workspaceRoots(workspace) {
  const resolved = path.resolve(workspace);
  try {
    return [...new Set([fs.realpathSync.native(resolved), resolved])];
  } catch {
    return [resolved];
  }
}

// Status rows do not change when an already changed file is edited again, so
// checkin tokens also bind the size and modification time of every item.
export async function fileStateFingerprint(workspace, items) {
  const states = [];
  for (const item of items) {
    try {
      const stat = await fs.promises.stat(path.join(workspace, item.path));
      states.push(`${pathKey(item.path)}|${stat.isDirectory() ? "dir" : `${stat.size}|${stat.mtimeMs}`}`);
    } catch {
      states.push(`${pathKey(item.path)}|missing`);
    }
  }
  return crypto.createHash("sha256").update(states.sort().join("\n"), "utf8").digest("hex");
}
