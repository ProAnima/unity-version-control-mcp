#!/usr/bin/env node
// Runs `node --check` on every JavaScript file shipped in src/ and scripts/.
import { spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const files = [];
for (const directory of ["src", "scripts"]) {
  for (const entry of await fs.readdir(path.join(root, directory), { recursive: true, withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".js")) files.push(path.join(entry.parentPath, entry.name));
  }
}

let failed = 0;
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (result.status !== 0) {
    failed += 1;
    process.stderr.write(result.stderr);
  }
}

if (failed > 0) {
  process.stderr.write(`Syntax check failed for ${failed} file(s)\n`);
  process.exit(1);
}
process.stdout.write(`Syntax OK for ${files.length} files\n`);
