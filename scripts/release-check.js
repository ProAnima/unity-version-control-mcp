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

// Every pinned package spec in user-facing docs must point at this release.
// Historical release notes keep the versions they were written for.
const stalePins = [];
for (const file of userFacingDocs()) {
  const lines = readText(file).split(/\r?\n/);
  lines.forEach((line, index) => {
    for (const match of line.matchAll(/@proanima\/uvcs-mcp@(\d+\.\d+\.\d+[0-9A-Za-z.+-]*)/g)) {
      if (match[1] !== version) stalePins.push(`${file}:${index + 1} pins ${match[1]}`);
    }
  });
}
if (stalePins.length > 0) {
  fail(`Stale package version pins (expected ${version}):\n${stalePins.join("\n")}`);
}

process.stdout.write(`Release metadata OK for ${version}\n`);

function userFacingDocs() {
  const files = ["README.md", "SECURITY.md", "SUPPORT.md", "CONTRIBUTING.md"];
  for (const directory of ["docs", "wiki", "templates"]) {
    for (const entry of fs.readdirSync(path.join(root, directory), { recursive: true, withFileTypes: true })) {
      if (!entry.isFile() || !/\.(md|json|toml)$/.test(entry.name)) continue;
      const relative = path.relative(root, path.join(entry.parentPath, entry.name)).replaceAll(path.sep, "/");
      if (!relative.startsWith("docs/releases/")) files.push(relative);
    }
  }
  return files.filter((file) => fs.existsSync(path.join(root, file)));
}

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
