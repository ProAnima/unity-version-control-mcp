export function effectivePolicyReport(config) {
  const warnings = [];
  if (config.mode === "standard" && config.allowedWorkspaces.length === 0) {
    warnings.push("Standard mode should pin UVCS_ALLOWED_WORKSPACES.");
  }
  if (config.mode === "standard" && config.allowedRepos.length === 0) {
    warnings.push("Repository identity is not pinned. Use the guarded safety profile for shared or production workspaces.");
  }
  if (config.mode === "standard" && !config.auditLogPath) {
    warnings.push("Audit logging is disabled.");
  }

  return {
    ok: warnings.length === 0,
    workspace: {
      name: config.workspaceName,
      path: config.workspace
    },
    safetyProfile: config.safetyProfile,
    mode: config.mode,
    writesEnabled: config.mode === "standard",
    allowedWorkspaces: config.allowedWorkspaces,
    allowedRepos: config.allowedRepos,
    limits: {
      checkinMaxFiles: config.checkinMaxFiles,
      tokenTtlSec: config.tokenTtlSec,
      readTimeoutMs: config.readTimeoutMs,
      writeTimeoutMs: config.writeTimeoutMs,
      maxOutputBytes: config.maxOutputBytes
    },
    auditLog: config.auditLogPath || null,
    warnings,
    massWorkGuidance: [
      "Treat every named workspace as an independent target and pass its explicit selector on every fleet tool call.",
      "Run read-only status and style checks for every target workspace before preparing writes.",
      "Prepare every workspace first, present the complete plan to the user, then confirm each workspace independently.",
      "There is no cross-repository atomic commit. Stop on the first failure and report completed, failed, and untouched workspaces."
    ]
  };
}
