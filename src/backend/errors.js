export class UvcsError extends Error {
  constructor(message, { code = "UVCS_ERROR", details = undefined } = {}) {
    super(message);
    this.name = "UvcsError";
    this.code = code;
    this.details = details;
  }
}

const MAX_ERROR_OUTPUT_CHARS = 16 * 1024;

export class CmCommandError extends UvcsError {
  constructor(result) {
    const details = truncateText(result.stderr || result.stdout || `exit code ${result.code}`, 2_000);
    super(`${result.displayCommand} failed: ${details}`, {
      code: "CM_COMMAND_FAILED",
      details: {
        ...result,
        stdout: truncateText(result.stdout, MAX_ERROR_OUTPUT_CHARS),
        stderr: truncateText(result.stderr, MAX_ERROR_OUTPUT_CHARS)
      }
    });
    this.name = "CmCommandError";
  }
}

export function truncateText(value, maxChars) {
  const text = String(value ?? "");
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n… [truncated ${text.length - maxChars} characters]`;
}

export class PolicyError extends UvcsError {
  constructor(message, details) {
    const { code = "POLICY_DENIED", ...rest } = details ?? {};
    super(message, {
      code,
      details: Object.keys(rest).length > 0 ? rest : undefined
    });
    this.name = "PolicyError";
  }
}
