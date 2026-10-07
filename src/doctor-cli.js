#!/usr/bin/env node
import { runDoctor } from "./cli/doctor.js";

runDoctor(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`[uvcs-mcp] ${error?.exitCode ? error.message : error?.stack ?? error}\n`);
  process.exitCode = error?.exitCode ?? 1;
});
