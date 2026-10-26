#!/usr/bin/env node
// Validates the agent skill and packs it as a marketplace ZIP (Agensi and
// similar): SKILL.md at the archive root plus references/ and agents/.
import fs from "node:fs/promises";
import path from "node:path";
import zlib from "node:zlib";
import { SKILL_NAME, SKILL_SOURCE, listFiles } from "../src/cli/skill.js";

const root = path.resolve(import.meta.dirname, "..");
const output = path.resolve(root, process.argv[2] ?? path.join("dist", `${SKILL_NAME}-skill.zip`));

const files = await listFiles(SKILL_SOURCE);
const problems = await validateSkill(files);
if (problems.length > 0) {
  process.stderr.write(`Skill validation failed:\n${problems.map((problem) => `- ${problem}`).join("\n")}\n`);
  process.exit(1);
}

const entries = [];
for (const file of files) entries.push({ name: file, data: await fs.readFile(path.join(SKILL_SOURCE, file)) });
await fs.mkdir(path.dirname(output), { recursive: true });
await fs.writeFile(output, createZip(entries));
process.stdout.write(`Skill ${SKILL_NAME} OK (${files.length} files)\nWritten: ${path.relative(root, output)}\n`);

async function validateSkill(skillFiles) {
  const problems = [];
  if (!skillFiles.includes("SKILL.md")) return ["SKILL.md is missing"];
  const text = await fs.readFile(path.join(SKILL_SOURCE, "SKILL.md"), "utf8");
  const frontmatter = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n/);
  if (!frontmatter) return ["SKILL.md has no YAML frontmatter"];
  const fields = topLevelFields(frontmatter[1]);

  if (fields.name !== SKILL_NAME) problems.push(`name must equal the folder name "${SKILL_NAME}"`);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(fields.name ?? "") || fields.name.length > 64) {
    problems.push("name must be lowercase letters, digits, and single hyphens, at most 64 characters");
  }
  if (!fields.description || fields.description.length > 1024) problems.push("description must be 1 to 1024 characters");
  if (!/\bUse when\b/.test(fields.description ?? "")) problems.push("description should say when to use the skill (\"Use when ...\")");
  if ((fields.compatibility ?? "").length > 500) problems.push("compatibility must be at most 500 characters");
  if (!("external_urls" in fields)) problems.push("external_urls must declare every network endpoint (Agensi)");
  if (text.split(/\r?\n/).length > 500) problems.push("SKILL.md should stay under 500 lines; move detail into references/");

  for (const [, link] of text.matchAll(/\]\(([^)#\s]+)\)/g)) {
    if (/^[a-z]+:/i.test(link)) continue;
    if (!skillFiles.includes(link)) problems.push(`SKILL.md links to a missing file: ${link}`);
  }

  const declared = new Set((frontmatter[1].match(/^\s+-\s+(https?:\/\/\S+)/gm) ?? []).map((line) => origin(line.replace(/^\s+-\s+/, ""))));
  for (const file of skillFiles) {
    const content = await fs.readFile(path.join(SKILL_SOURCE, file), "utf8");
    if (/(?:api[_-]?key|secret|password|token)\s*[:=]\s*["']?[A-Za-z0-9_-]{16,}/i.test(content) || /-----BEGIN [A-Z ]*PRIVATE KEY-----/.test(content)) {
      problems.push(`${file} looks like it contains a secret`);
    }
    for (const [url] of content.matchAll(/https?:\/\/[^\s)"'`>]+/g)) {
      if (!declared.has(origin(url))) problems.push(`${file} references ${url}, which is not declared in external_urls`);
    }
  }
  return problems;
}

function origin(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return url;
  }
}

// Reads `key: value` pairs at indentation 0. Nested blocks are kept as "".
function topLevelFields(yaml) {
  const fields = {};
  for (const line of yaml.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/);
    if (match) fields[match[1]] = match[2].replace(/^["']|["']$/g, "").trim();
  }
  return fields;
}

// Minimal ZIP writer (deflate, no ZIP64): enough for a few small text files.
function createZip(zipEntries) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const { time, date } = dosDateTime(new Date(2026, 0, 1));
  for (const { name, data } of zipEntries) {
    const nameBuffer = Buffer.from(name, "utf8");
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    locals.push(local, nameBuffer, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(8, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + compressed.length;
  }
  const centralSize = centrals.reduce((sum, buffer) => sum + buffer.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(zipEntries.length, 8);
  end.writeUInt16LE(zipEntries.length, 10);
  end.writeUInt32LE(centralSize, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, ...centrals, end]);
}

function dosDateTime(value) {
  return {
    time: (value.getHours() << 11) | (value.getMinutes() << 5) | Math.floor(value.getSeconds() / 2),
    date: ((value.getFullYear() - 1980) << 9) | ((value.getMonth() + 1) << 5) | value.getDate()
  };
}

// The top-level awaits above run before any module-level `let` here would be
// initialized, so the table is cached on the function itself.
function crc32(buffer) {
  crc32.table ??= Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crc32.table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}
