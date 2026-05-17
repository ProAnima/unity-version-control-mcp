import path from "node:path";

export function loadConfig(env = process.env) {
  const workspace = env.UVCS_WORKSPACE ? path.resolve(env.UVCS_WORKSPACE) : "";
  const mode = normalizeMode(env.UVCS_MCP_MODE);

  return {
    workspace,
    cmPath: env.UVCS_CM_PATH?.trim() || "cm",
    mode,
    allowedRepos: splitList(env.UVCS_ALLOWED_REPOS),
    allowedWorkspaces: splitList(env.UVCS_ALLOWED_WORKSPACES).map((item) => path.resolve(item)),
    checkinMaxFiles: parsePositiveInt(env.UVCS_CHECKIN_MAX_FILES, 20),
    tokenTtlSec: parsePositiveInt(env.UVCS_TOKEN_TTL_SEC, 300),
    locale: env.UVCS_LOCALE || "en"
  };
}

export function splitList(value) {
  if (!value) return [];
  return value
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeMode(value) {
  if (value === "standard") return "standard";
  return "readonly";
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
