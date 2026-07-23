#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const packageJson = readJson("package.json");
const version = packageJson.version;

const checks = [
  {
    file: "src/server.js",
    pattern: `version: "${version}"`
  },
  {
    file: "src/cli/init.js",
    pattern: `@proanima/uvcs-mcp@${version}`
  },
  {
    file: "README.md",
    pattern: `Current release: \`${version}\``
  },
  {
    file: "wiki/Home.md",
    pattern: `Current release: \`${version}\``
  },
  {
    file: "CHANGELOG.md",
    pattern: `## ${version} - `
  },
  {
    file: "package-lock.json",
    pattern: `"version": "${version}"`
  }
];

for (const check of checks) {
  const text = readText(check.file);
  if (!text.includes(check.pattern)) {
    fail(`${check.file} does not include expected release marker: ${check.pattern}`);
  }
}

if (!/^(\d+)\.(\d+)\.(\d+)(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  fail(`package version is not valid semver: ${version}`);
}

process.stdout.write(`Release metadata OK for ${version}\n`);

function readText(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exit(1);
}
