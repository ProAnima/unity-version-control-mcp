import test from "node:test";
import assert from "node:assert/strict";
import { runProcess } from "../src/backend/process-runner.js";

test("runProcess rejects output larger than the configured bound", async () => {
  await assert.rejects(
    () => runProcess(process.execPath, ["-e", "process.stdout.write('x'.repeat(4096))"], {
      maxOutputBytes: 1024,
      timeoutMs: 5000
    }),
    (error) => error.code === "PROCESS_OUTPUT_TOO_LARGE"
  );
});

test("runProcess reports the configured timeout", async () => {
  await assert.rejects(
    () => runProcess(process.execPath, ["-e", "setTimeout(() => {}, 5000)"], {
      timeoutMs: 50
    }),
    (error) => error.code === "PROCESS_TIMEOUT" && error.details.timeoutMs === 50
  );
});
