import { spawn } from "node:child_process";
import { CmCommandError, UvcsError } from "./errors.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export async function runProcess(command, args, options = {}) {
  validateArgs(args);

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const cwd = options.cwd ?? process.cwd();

  return await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      windowsHide: true,
      env: options.env ?? process.env
    });

    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new UvcsError(`${command} ${args[0] ?? ""} timed out after ${timeoutMs}ms`, { code: "PROCESS_TIMEOUT" }));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(new UvcsError(error.message, { code: "PROCESS_SPAWN_FAILED", details: { command, args } }));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const result = {
        command,
        args,
        displayCommand: [command, ...args].join(" "),
        code,
        stdout: stdout.trim(),
        stderr: stderr.trim()
      };

      if (code === 0 || options.allowFailure) {
        resolve(result);
      } else {
        reject(new CmCommandError(result));
      }
    });
  });
}

function validateArgs(args) {
  if (!Array.isArray(args) || args.length === 0) {
    throw new UvcsError("Process args must be a non-empty array", { code: "INVALID_ARGUMENTS" });
  }

  for (const arg of args) {
    if (typeof arg !== "string" || arg.length === 0) {
      throw new UvcsError("Process args must be non-empty strings", { code: "INVALID_ARGUMENTS" });
    }
    if (arg.includes("\0") || /[\r\n]/.test(arg)) {
      throw new UvcsError("Process args cannot contain control line separators", { code: "INVALID_ARGUMENTS" });
    }
  }
}
