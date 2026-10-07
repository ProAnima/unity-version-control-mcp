import path from "node:path";

const MODES = new Set(["readonly", "standard"]);

export function loadConfig(env = process.env) {
  const warnings = [];
  const workspace = env.UVCS_WORKSPACE ? path.resolve(env.UVCS_WORKSPACE) : "";
  const mode = normalizeMode(env.UVCS_MCP_MODE, warnings);
  const positiveInt = (name, fallback) => parsePositiveInt(env, name, fallback, warnings);

  return {
    workspace,
    workspaceName: env.UVCS_WORKSPACE_NAME?.trim() || "uvcs",
    safetyProfile: env.UVCS_SAFETY_PROFILE?.trim() || (mode === "readonly" ? "readonly" : "standard"),
    cmPath: env.UVCS_CM_PATH?.trim() || "cm",
    cmArgs: splitList(env.UVCS_CM_ARGS),
    cmOutputEncoding: env.UVCS_CM_OUTPUT_ENCODING?.trim() || "auto",
    mode,
    allowedRepos: splitList(env.UVCS_ALLOWED_REPOS),
    allowedWorkspaces: splitList(env.UVCS_ALLOWED_WORKSPACES).map((item) => path.resolve(item)),
    checkinMaxFiles: positiveInt("UVCS_CHECKIN_MAX_FILES", 20),
    tokenTtlSec: positiveInt("UVCS_TOKEN_TTL_SEC", 300),
    readTimeoutMs: positiveInt("UVCS_READ_TIMEOUT_MS", 30_000),
    writeTimeoutMs: positiveInt("UVCS_WRITE_TIMEOUT_MS", 300_000),
    maxOutputBytes: positiveInt("UVCS_MAX_OUTPUT_BYTES", 10 * 1024 * 1024),
    auditLogPath: env.UVCS_AUDIT_LOG ? path.resolve(env.UVCS_AUDIT_LOG) : "",
    configWarnings: warnings
  };
}

export function splitList(value) {
  if (!value) return [];
  return value
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeMode(value, warnings) {
  // Fail closed: anything other than the exact mode names stays read-only.
  const normalized = String(value ?? "").trim();
  if (normalized === "") return "readonly";
  if (MODES.has(normalized)) return normalized;
  warnings.push(`UVCS_MCP_MODE=${value} is not recognised; falling back to readonly. Use exactly readonly or standard.`);
  return "readonly";
}

function parsePositiveInt(env, name, fallback, warnings) {
  const raw = env[name];
  if (raw === undefined || String(raw).trim() === "") return fallback;
  const parsed = Number(String(raw).trim());
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  warnings.push(`${name}=${raw} is not a positive integer; using ${fallback}.`);
  return fallback;
}
