import fs from "node:fs/promises";
import path from "node:path";
import { readWorkspaceInfo } from "../backend/cm.js";
import { loadConfig } from "./env.js";

const SETTING_KEYS = [
  "safety", "mode", "installSource", "cmPath", "allowedRepos", "checkinMaxFiles",
  "tokenTtlSec", "auditLog", "readTimeoutMs", "writeTimeoutMs", "maxOutputBytes"
];

export async function loadFleetConfigs(manifestPath, baseEnv = process.env) {
  const absoluteManifest = path.resolve(manifestPath);
  const manifestDir = path.dirname(absoluteManifest);
  const manifest = JSON.parse(await fs.readFile(absoluteManifest, "utf8"));
  assertPlainObject(manifest, "Workspace manifest");
  assertKnownKeys(manifest, ["$schema", "version", "defaults", "workspaces"], "Workspace manifest");
  if (manifest.version !== 1) throw new Error("Workspace manifest version must be 1");
  if (!Array.isArray(manifest.workspaces) || manifest.workspaces.length < 1 || manifest.workspaces.length > 50) {
    throw new Error("Workspace manifest must contain from 1 to 50 workspaces");
  }

  const defaults = manifest.defaults ?? {};
  assertPlainObject(defaults, "Workspace manifest defaults");
  assertKnownKeys(defaults, SETTING_KEYS, "Workspace manifest defaults");
  const names = new Set();

  const configs = await Promise.all(manifest.workspaces.map(async (entry) => {
    assertPlainObject(entry, "Workspace entry");
    assertKnownKeys(entry, ["name", "path", ...SETTING_KEYS], "Workspace entry");
    const name = normalizeName(entry.name);
    if (names.has(name)) throw new Error(`Duplicate workspace name in manifest: ${name}`);
    names.add(name);
    if (typeof entry.path !== "string" || entry.path.trim().length === 0) {
      throw new Error(`Workspace ${name} requires a path`);
    }

    const workspace = path.resolve(manifestDir, entry.path);
    const safety = entry.safety ?? defaults.safety ?? "readonly";
    const mode = entry.mode ?? defaults.mode ?? modeForSafety(safety);
    if (mode !== modeForSafety(safety)) {
      throw new Error(`Workspace ${name} safety=${safety} requires mode=${modeForSafety(safety)}`);
    }
    let allowedRepos = normalizeStringList(entry.allowedRepos ?? defaults.allowedRepos ?? []);
    if (safety === "guarded" && allowedRepos.length === 0) {
      allowedRepos = await detectWorkspaceRepos(workspace);
    }
    if (safety === "guarded" && allowedRepos.length === 0) {
      throw new Error(`Workspace ${name} uses guarded safety and requires allowedRepos`);
    }

    const env = {
      ...baseEnv,
      UVCS_WORKSPACE: workspace,
      UVCS_WORKSPACE_NAME: name,
      UVCS_SAFETY_PROFILE: safety,
      UVCS_MCP_MODE: mode,
      UVCS_ALLOWED_WORKSPACES: workspace
    };
    setOptional(env, "UVCS_CM_PATH", entry.cmPath ?? defaults.cmPath);
    setOptional(env, "UVCS_ALLOWED_REPOS", allowedRepos.length > 0 ? allowedRepos.join(";") : undefined);
    setPositiveInt(env, "UVCS_CHECKIN_MAX_FILES", entry.checkinMaxFiles ?? defaults.checkinMaxFiles ?? (safety === "guarded" ? 20 : undefined));
    setPositiveInt(env, "UVCS_TOKEN_TTL_SEC", entry.tokenTtlSec ?? defaults.tokenTtlSec ?? (safety === "guarded" ? 120 : undefined));
    setPositiveInt(env, "UVCS_READ_TIMEOUT_MS", entry.readTimeoutMs ?? defaults.readTimeoutMs);
    setPositiveInt(env, "UVCS_WRITE_TIMEOUT_MS", entry.writeTimeoutMs ?? defaults.writeTimeoutMs);
    setPositiveInt(env, "UVCS_MAX_OUTPUT_BYTES", entry.maxOutputBytes ?? defaults.maxOutputBytes);
    const auditLog = entry.auditLog ?? defaults.auditLog;
    if (auditLog) env.UVCS_AUDIT_LOG = path.resolve(manifestDir, assertString(auditLog, "auditLog"));
    return loadConfig(env);
  }));

  return { manifestPath: absoluteManifest, configs };
}

function modeForSafety(safety) {
  if (safety === "readonly") return "readonly";
  if (safety === "guarded" || safety === "standard") return "standard";
  throw new Error("safety must be readonly, guarded, or standard");
}

function normalizeName(value) {
  if (typeof value !== "string" || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(value)) {
    throw new Error("Workspace name must use lowercase letters, numbers, and dashes");
  }
  return value;
}

function normalizeStringList(value) {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item.trim().length === 0)) {
    throw new Error("allowedRepos must be an array of non-empty strings");
  }
  return value.map((item) => item.trim());
}

async function detectWorkspaceRepos(workspace) {
  const info = await readWorkspaceInfo(workspace);
  const entries = Object.entries(info);
  const direct = entries.map(([, value]) => String(value ?? "").trim()).filter((value) => value.includes("@"));
  const byKey = Object.fromEntries(entries.map(([key, value]) => [key.toLowerCase(), String(value ?? "").trim()]));
  const repo = byKey.repository || byKey.repo || byKey.name || byKey.reponame;
  const server = byKey.server || byKey.repositoryserver || byKey.servername;
  return [...new Set([...direct, ...(repo && server ? [`${repo}@${server}`] : [])])];
}

function setOptional(env, key, value) {
  if (value !== undefined && value !== null && value !== "") env[key] = assertString(value, key);
}

function setPositiveInt(env, key, value) {
  if (value === undefined || value === null || value === "") return;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) throw new Error(`${key} must be a positive integer`);
  env[key] = String(parsed);
}

function assertString(value, name) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function assertPlainObject(value, name) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${name} must be an object`);
}

function assertKnownKeys(value, allowed, name) {
  const unknown = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unknown.length > 0) throw new Error(`${name} contains unknown fields: ${unknown.join(", ")}`);
}
