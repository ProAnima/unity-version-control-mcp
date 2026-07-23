export function toolSuccess(result) {
  return {
    content: [
      {
        type: "text",
        text: typeof result === "string" ? result : JSON.stringify(result, null, 2)
      }
    ]
  };
}

export function toolFailure(error) {
  return {
    isError: true,
    content: [
      {
        type: "text",
        text: JSON.stringify(formatToolError(error), null, 2)
      }
    ]
  };
}

export function formatToolError(error) {
  return {
    ok: false,
    error: {
      message: error?.message ?? String(error),
      code: error?.code ?? "UNEXPECTED_ERROR",
      details: error?.details
    },
    hint: hintForError(error)
  };
}

function hintForError(error) {
  switch (error?.code) {
    case "WORKSPACE_REQUIRED":
      return "Set UVCS_WORKSPACE to a Plastic SCM / Unity Version Control source-control workspace path.";
    case "MUTATION_REQUIRES_STANDARD_MODE":
    case "POLICY_DENIED":
      return "Read-only mode is active. Set UVCS_MCP_MODE=standard only when write operations are intended.";
    case "REPOSITORY_NOT_ALLOWED":
      return "Check UVCS_ALLOWED_REPOS or point UVCS_WORKSPACE to an allowed repository workspace.";
    case "PROCESS_SPAWN_FAILED":
      return "Check that cm is installed, available in PATH, or set UVCS_CM_PATH.";
    case "CM_COMMAND_FAILED":
      return "Run uvcs-mcp doctor in the same environment and verify workspace login/server access.";
    case "WORKSPACE_CHANGED_SINCE_PREPARE":
      return "Inspect workspace status and run the matching prepare tool again. Do not reuse the consumed token.";
    case "CONFIRM_TOKEN_CONTEXT_MISMATCH":
      return "The token was prepared for another workspace. Prepare the operation again with the intended workspace selector.";
    case "FLEET_WORKSPACE_REQUIRED":
    case "FLEET_WORKSPACE_UNKNOWN":
      return "Pass a workspace name listed by the tool schema and fleet manifest.";
    case "UNDO_WORKSPACE_ROOT_FORBIDDEN":
      return "Choose a specific relative file or directory. Whole-workspace undo is intentionally unavailable.";
    case "WORKSPACE_WRITE_LOCKED":
      return "Another MCP process is writing to this workspace. Wait for it to finish, then inspect status before retrying.";
    case "PROCESS_TIMEOUT":
      return "Inspect workspace status before retrying. Increase UVCS_READ_TIMEOUT_MS or UVCS_WRITE_TIMEOUT_MS only when the command is expected to take longer.";
    case "PROCESS_OUTPUT_TOO_LARGE":
      return "Narrow the requested status, diff, or analytics scope, or explicitly raise UVCS_MAX_OUTPUT_BYTES.";
    case "INVALID_CHECKIN_MESSAGE":
      return "Provide a non-empty one-line checkin message.";
    default:
      return undefined;
  }
}
