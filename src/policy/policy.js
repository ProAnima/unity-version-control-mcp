import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { PolicyError, UvcsError } from "../backend/errors.js";

const pendingConfirms = new Map();

export function assertWorkspaceAllowed(config) {
  if (!config.workspace) {
    throw new UvcsError("UVCS_WORKSPACE is required", { code: "WORKSPACE_REQUIRED" });
  }
  if (!isDirectory(config.workspace)) {
    throw new UvcsError(`Workspace directory does not exist: ${config.workspace}`, {
      code: "WORKSPACE_NOT_FOUND",
      details: { workspace: config.workspace }
    });
  }

  if (config.allowedWorkspaces.length === 0) return;

  const current = normalizePath(config.workspace);
  const allowed = config.allowedWorkspaces.map(normalizePath);
  if (!allowed.includes(current)) {
    throw new PolicyError(`Workspace is not allowed: ${config.workspace}`, {
      code: "WORKSPACE_NOT_ALLOWED",
      workspace: config.workspace,
      allowedWorkspaces: config.allowedWorkspaces
    });
  }
}

export function assertRepoAllowed(config, workspaceInfo = {}) {
  if (!config.allowedRepos || config.allowedRepos.length === 0) return;

  const candidates = workspaceRepoCandidates(workspaceInfo).map(normalizeRepo);
  const allowed = config.allowedRepos.map(normalizeRepo);
  const matched = candidates.some((candidate) => allowed.includes(candidate));
  if (!matched) {
    throw new PolicyError("Repository is not allowed by UVCS_ALLOWED_REPOS", {
      code: "REPOSITORY_NOT_ALLOWED",
      allowedRepos: config.allowedRepos,
      detected: candidates
    });
  }
}

export function assertStandardMode(config) {
  if (config.mode !== "standard") {
    throw new PolicyError("This tool requires UVCS_MCP_MODE=standard", { code: "STANDARD_MODE_REQUIRED" });
  }
}

export function assertRelativeWorkspacePath(config, filePath) {
  if (!filePath || typeof filePath !== "string") {
    throw new PolicyError("filePath is required", { code: "INVALID_PATH" });
  }
  if (/[\0\r\n]/.test(filePath)) {
    throw new PolicyError("filePath cannot contain control characters", { code: "INVALID_PATH", filePath });
  }

  const resolved = path.resolve(config.workspace, filePath);
  const workspace = path.resolve(config.workspace);
  const canonicalWorkspace = canonicalPath(workspace);
  const canonicalResolved = canonicalPathWithExistingAncestor(resolved);
  const relative = path.relative(canonicalWorkspace, canonicalResolved);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new PolicyError("filePath must stay inside UVCS_WORKSPACE", { code: "PATH_OUTSIDE_WORKSPACE", filePath });
  }
  // cm parses a leading dash as an option (for example `undo -r`), so such a
  // relative path could widen the command beyond the requested item.
  if (relative.startsWith("-")) {
    throw new PolicyError("filePath cannot start with '-'; it would be parsed as a cm option", {
      code: "INVALID_PATH",
      filePath
    });
  }

  return relative;
}

export function createConfirmToken({ action, payload, ttlSec, context }) {
  pruneExpiredTokens();
  const token = crypto.randomBytes(18).toString("base64url");
  const expiresAt = Date.now() + ttlSec * 1000;
  pendingConfirms.set(token, { action, payload, expiresAt, context });
  return { token, expiresAt };
}

export function consumeConfirmToken({ token, action, context }) {
  const record = pendingConfirms.get(token);
  if (!record) {
    throw new PolicyError("Unknown or already used confirm token", { code: "CONFIRM_TOKEN_INVALID" });
  }

  pendingConfirms.delete(token);

  if (record.expiresAt < Date.now()) {
    throw new PolicyError("Confirm token has expired", { code: "CONFIRM_TOKEN_EXPIRED" });
  }

  if (record.action !== action) {
    throw new PolicyError(`Confirm token is for ${record.action}, not ${action}`, { code: "CONFIRM_TOKEN_ACTION_MISMATCH" });
  }
  if (record.context !== context) {
    throw new PolicyError("Confirm token belongs to another workspace", {
      code: "CONFIRM_TOKEN_CONTEXT_MISMATCH"
    });
  }

  return record.payload;
}

// Expired tokens stay known for a while so a late confirm still gets
// CONFIRM_TOKEN_EXPIRED rather than CONFIRM_TOKEN_INVALID.
const EXPIRED_TOKEN_RETENTION_MS = 10 * 60_000;

function pruneExpiredTokens(now = Date.now()) {
  for (const [token, record] of pendingConfirms) {
    if (record.expiresAt + EXPIRED_TOKEN_RETENTION_MS < now) pendingConfirms.delete(token);
  }
}

function isDirectory(directory) {
  try {
    return fs.statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

function normalizePath(input) {
  const canonical = canonicalPath(input);
  return process.platform === "win32" ? canonical.toLowerCase() : canonical;
}

function canonicalPath(input) {
  const resolved = path.resolve(input);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    return resolved;
  }
}

function canonicalPathWithExistingAncestor(input) {
  let cursor = path.resolve(input);
  const suffix = [];

  while (!fs.existsSync(cursor)) {
    const parent = path.dirname(cursor);
    if (parent === cursor) break;
    suffix.unshift(path.basename(cursor));
    cursor = parent;
  }

  return path.resolve(canonicalPath(cursor), ...suffix);
}

function normalizeRepo(input) {
  return String(input ?? "").trim().toLowerCase();
}

function workspaceRepoCandidates(info) {
  const entries = Object.entries(info ?? {});
  const values = entries.map(([, value]) => String(value ?? "").trim()).filter(Boolean);
  const direct = values.filter((value) => value.includes("@"));
  const byKey = Object.fromEntries(entries.map(([key, value]) => [key.toLowerCase(), String(value ?? "").trim()]));
  const repo = byKey.repository || byKey.repo || byKey.name || byKey.reponame;
  const server = byKey.server || byKey.repositoryserver || byKey.servername;
  const combined = repo && server ? [`${repo}@${server}`] : [];
  return [...direct, ...combined].filter(Boolean);
}
