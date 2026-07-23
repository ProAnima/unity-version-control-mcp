#!/usr/bin/env node
import { runDoctor } from "./cli/doctor.js";

runDoctor(process.argv.slice(2)).catch((error) => {
  process.stderr.write(`[uvcs-mcp] ${error?.stack ?? error}\n`);
  process.exitCode = 1;
});
