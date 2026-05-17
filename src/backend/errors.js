export class UvcsError extends Error {
  constructor(message, { code = "UVCS_ERROR", details = undefined } = {}) {
    super(message);
    this.name = "UvcsError";
    this.code = code;
    this.details = details;
  }
}

export class CmCommandError extends UvcsError {
  constructor(result) {
    const details = result.stderr || result.stdout || `exit code ${result.code}`;
    super(`${result.displayCommand} failed: ${details}`, {
      code: "CM_COMMAND_FAILED",
      details: result
    });
    this.name = "CmCommandError";
  }
}

export class PolicyError extends UvcsError {
  constructor(message, details) {
    super(message, {
      code: "POLICY_DENIED",
      details
    });
    this.name = "PolicyError";
  }
}
