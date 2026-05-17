import crypto from "node:crypto";
import path from "node:path";
import { PolicyError, UvcsError } from "../backend/errors.js";

const pendingConfirms = new Map();

export function assertWorkspaceAllowed(config) {
  if (!config.workspace) {
    throw new UvcsError("UVCS_WORKSPACE is required", { code: "WORKSPACE_REQUIRED" });
  }

  if (config.allowedWorkspaces.length === 0) return;

  const current = normalizePath(config.workspace);
  const allowed = config.allowedWorkspaces.map(normalizePath);
  if (!allowed.includes(current)) {
    throw new PolicyError(`Workspace is not allowed: ${config.workspace}`, {
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
    throw new PolicyError("This tool requires UVCS_MCP_MODE=standard");
  }
}

export function assertRelativeWorkspacePath(config, filePath) {
  if (!filePath || typeof filePath !== "string") {
    throw new PolicyError("filePath is required");
  }

  const resolved = path.resolve(config.workspace, filePath);
  const workspace = path.resolve(config.workspace);
  const relative = path.relative(workspace, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new PolicyError("filePath must stay inside UVCS_WORKSPACE", { filePath });
  }

  return relative;
}

export function createConfirmToken({ action, payload, ttlSec }) {
  const token = crypto.randomBytes(18).toString("base64url");
  const expiresAt = Date.now() + ttlSec * 1000;
  pendingConfirms.set(token, { action, payload, expiresAt });
  return { token, expiresAt };
}

export function consumeConfirmToken({ token, action }) {
  const record = pendingConfirms.get(token);
  if (!record) {
    throw new PolicyError("Unknown or already used confirm token");
  }

  pendingConfirms.delete(token);

  if (record.expiresAt < Date.now()) {
    throw new PolicyError("Confirm token has expired");
  }

  if (record.action !== action) {
    throw new PolicyError(`Confirm token is for ${record.action}, not ${action}`);
  }

  return record.payload;
}

function normalizePath(input) {
  return path.resolve(input).toLowerCase();
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
