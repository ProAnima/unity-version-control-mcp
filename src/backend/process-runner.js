import { spawn } from "node:child_process";
import { CmCommandError, UvcsError } from "./errors.js";
import { decodeProcessOutput } from "./output-encoding.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const KILL_GRACE_MS = 10_000;

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
      // cm must never wait for interactive input; a closed stdin makes prompts fail fast.
      stdio: ["ignore", "pipe", "pipe"],
      // On POSIX a separate process group lets a timeout terminate cm and its children together.
      detached: process.platform !== "win32",
      env: options.env ?? process.env
    });

    const stdoutChunks = [];
    const stderrChunks = [];
    let outputBytes = 0;
    let settled = false;
    let pendingError;
    let graceTimer;

    const settle = (fn, value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(graceTimer);
      fn(value);
    };
    // Terminate the whole process tree and report the error only after the
    // process has exited, so callers (and write locks) never outlive cm.
    const abort = (error) => {
      if (pendingError || settled) return;
      pendingError = error;
      killProcessTree(child);
      graceTimer = setTimeout(() => settle(reject, error), KILL_GRACE_MS);
    };

    const timer = setTimeout(() => {
      abort(new UvcsError(`${command} ${args[0] ?? ""} timed out after ${timeoutMs}ms`, {
        code: "PROCESS_TIMEOUT",
        details: { timeoutMs }
      }));
    }, timeoutMs);

    const collect = (chunks) => (chunk) => {
      if (pendingError) return;
      outputBytes += chunk.length;
      if (outputBytes > maxOutputBytes) {
        abort(new UvcsError(`${command} output exceeded ${maxOutputBytes} bytes`, {
          code: "PROCESS_OUTPUT_TOO_LARGE",
          details: { maxOutputBytes }
        }));
        return;
      }
      chunks.push(chunk);
    };
    child.stdout.on("data", collect(stdoutChunks));
    child.stderr.on("data", collect(stderrChunks));

    child.on("error", (error) => {
      settle(reject, pendingError ?? new UvcsError(error.message, {
        code: "PROCESS_SPAWN_FAILED",
        details: { command, args, cwd }
      }));
    });
    child.on("close", (code) => {
      if (pendingError) {
        settle(reject, pendingError);
        return;
      }
      const decode = (chunks) => decodeProcessOutput(Buffer.concat(chunks), { encoding: options.outputEncoding }).trim();
      const result = {
        command,
        args,
        displayCommand: [command, ...args].join(" "),
        code,
        stdout: decode(stdoutChunks),
        stderr: decode(stderrChunks)
      };

      if (code === 0 || options.allowFailure) {
        settle(resolve, result);
      } else {
        settle(reject, new CmCommandError(result));
      }
    });
  });
}

function killProcessTree(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  if (process.platform === "win32" && child.pid) {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/T", "/F"], {
      shell: false,
      windowsHide: true,
      stdio: "ignore"
    });
    killer.on("error", () => child.kill());
    return;
  }
  signalProcessGroup(child, "SIGTERM");
  setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) signalProcessGroup(child, "SIGKILL");
  }, 2_000).unref();
}

function signalProcessGroup(child, signal) {
  try {
    process.kill(-child.pid, signal);
  } catch {
    child.kill(signal);
  }
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
