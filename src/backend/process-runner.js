import { spawn } from "node:child_process";
import { CmCommandError, UvcsError } from "./errors.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;

export async function runProcess(command, args, options = {}) {
  validateArgs(args);

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
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
    let outputBytes = 0;
    let settled = false;
    const rejectOnce = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      rejectOnce(new UvcsError(`${command} ${args[0] ?? ""} timed out after ${timeoutMs}ms`, {
        code: "PROCESS_TIMEOUT",
        details: { timeoutMs }
      }));
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      if (settled) return;
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        child.kill("SIGTERM");
        rejectOnce(new UvcsError(`${command} output exceeded ${maxOutputBytes} bytes`, {
          code: "PROCESS_OUTPUT_TOO_LARGE",
          details: { maxOutputBytes }
        }));
        return;
      }
      stdout += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk) => {
      if (settled) return;
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        child.kill("SIGTERM");
        rejectOnce(new UvcsError(`${command} output exceeded ${maxOutputBytes} bytes`, {
          code: "PROCESS_OUTPUT_TOO_LARGE",
          details: { maxOutputBytes }
        }));
        return;
      }
      stderr += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectOnce(new UvcsError(error.message, { code: "PROCESS_SPAWN_FAILED", details: { command, args } }));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
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
