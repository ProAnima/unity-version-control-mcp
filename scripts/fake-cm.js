#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const FIELD_SEPARATOR = "\u001f";
const IDENTITY = "fake-repo@fake-server:8087";
const statePath = path.join(process.cwd(), ".plastic", "fake-cm-state.json");
const args = process.argv.slice(2);

function main() {
  const [command, subcommand] = args;

  if (command === "showcommands") {
    write("status\nupdate\ncheckin\nbranch\nlabel\nswitch\nmerge\nundo\nlock\napi\n");
    return;
  }

  if (command === "version") {
    write("Unity Version Control fake cm 11.0.0\n");
    return;
  }

  if (command === "api" && subcommand === "--help") {
    write("api help\n");
    return;
  }

  if (command === "status") {
    const state = readState();
    if (args.includes("--machinereadable")) {
      const rows = pendingRows(state).map(({ status, item }) => [
        status,
        path.join(process.cwd(), item),
        "False",
        "NO_MERGES"
      ].join(FIELD_SEPARATOR));
      write([`STATUS${FIELD_SEPARATOR}${state.changeset}${FIELD_SEPARATOR}fake-repo${FIELD_SEPARATOR}fake-server:8087`, ...rows, ""].join("\n"));
      return;
    }
    // Same header shapes as real cm: branch-loaded or changeset-loaded workspace.
    write(state.loaded === "changeset"
      ? `cs:${state.changeset}@${IDENTITY} (head)\n`
      : `${state.branch}@${IDENTITY} (cs:${state.changeset} - head)\n`);
    return;
  }

  if (command === "wi") {
    const state = readState();
    write(state.loaded === "changeset"
      ? `CS ${state.changeset} ${IDENTITY}\n`
      : `BR ${state.branch} ${IDENTITY}\n`);
    return;
  }

  if (command === "diff") {
    write(`--- ${args[1]}\n+++ ${args[1]}\n@@ fake diff @@\n`);
    return;
  }

  if (command === "lock" && subcommand === "list") {
    if (args.includes("--machinereadable")) {
      write(`LOCK${FIELD_SEPARATOR}PATH\n`);
      return;
    }
    write("No locks\n");
    return;
  }

  if (command === "find" && subcommand === "branch") {
    write([
      `main/tmp/old-cleanup${FIELD_SEPARATOR}2026-01-01${FIELD_SEPARATOR}agent${FIELD_SEPARATOR}temporary branch`,
      `main/agent/e2e-work${FIELD_SEPARATOR}2026-01-02${FIELD_SEPARATOR}agent${FIELD_SEPARATOR}agent branch`,
      ""
    ].join("\n"));
    return;
  }

  if (command === "find" && subcommand === "changeset") {
    const state = readState();
    write([
      `${state.changeset}${FIELD_SEPARATOR}${state.branch}${FIELD_SEPARATOR}2026-01-03${FIELD_SEPARATOR}agent${FIELD_SEPARATOR}fake changeset`,
      ""
    ].join("\n"));
    return;
  }

  if (command === "branch" && subcommand === "create") {
    write(`Created branch ${args[2]}\n`);
    return;
  }

  if (command === "label" && subcommand === "create") {
    write(`Created label ${args[2]} on ${args[3]}\n`);
    return;
  }

  if (command === "switch") {
    const state = readState();
    const target = args[1];
    if (target?.startsWith("/")) {
      state.branch = target;
      state.loaded = "branch";
    }
    const changeset = String(target ?? "").match(/^cs:(\d+)$/);
    if (changeset) {
      state.changeset = Number(changeset[1]);
      state.loaded = "changeset";
    }
    writeState(state);
    write(`Switched to ${target}\n`);
    return;
  }

  if (command === "add") {
    const state = readState();
    for (const item of listFiles(args.at(-1))) {
      if (!(item in state.controlled) && !state.added.includes(item)) state.added.push(item);
    }
    writeState(state);
    write(`Added ${args.at(-1)}\n`);
    return;
  }

  if (command === "undo") {
    const state = readState();
    const target = normalizeItem(args[1]);
    const matches = (item) => item === target || item.startsWith(`${target}/`);
    state.added = state.added.filter((item) => !matches(item));
    state.merged = state.merged.filter((item) => !matches(item));
    writeState(state);
    write(`Undid pending changes for ${args[1]}\n`);
    return;
  }

  if (command === "merge") {
    const state = readState();
    state.merged.push(`merge-from${args[1].replace(/[^A-Za-z0-9._-]+/g, "-")}`);
    writeState(state);
    write(`Merged ${args[1]}\n`);
    return;
  }

  if (command === "update") {
    write("Workspace updated\n");
    return;
  }

  if (command === "checkin") {
    const state = readState();
    const rows = pendingRows(state);
    if (rows.length === 0) {
      fail("There are no changes to check in.");
      return;
    }
    for (const { item } of rows) {
      if (!state.merged.includes(item)) state.controlled[item] = hashFile(item);
    }
    state.added = [];
    state.merged = [];
    state.changeset += 1;
    writeState(state);
    write(`Created changeset cs:${state.changeset}\n`);
    return;
  }

  fail(`Unsupported fake cm command: ${args.join(" ")}`);
}

// Pending rows mimic `cm status --machinereadable`: added items, controlled
// files whose content changed since the last checkin, and merge results.
function pendingRows(state) {
  const changed = Object.entries(state.controlled)
    .filter(([item, hash]) => hashFile(item) !== hash)
    .map(([item]) => ({ status: "CH", item }));
  return [
    ...state.added.map((item) => ({ status: "AD", item })),
    ...changed,
    ...state.merged.map((item) => ({ status: "CH", item }))
  ];
}

function listFiles(target) {
  const item = normalizeItem(target);
  const absolute = path.join(process.cwd(), item);
  if (!fs.existsSync(absolute)) return [];
  if (!fs.statSync(absolute).isDirectory()) return [item];
  return fs.readdirSync(absolute).flatMap((name) => listFiles(`${item}/${name}`));
}

function normalizeItem(target) {
  return path.relative(process.cwd(), path.resolve(process.cwd(), String(target ?? ""))).replaceAll(path.sep, "/");
}

function hashFile(item) {
  try {
    return crypto.createHash("sha256").update(fs.readFileSync(path.join(process.cwd(), item))).digest("hex");
  } catch {
    return "missing";
  }
}

function readState() {
  let state = {};
  try {
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    // A fresh fake workspace starts on /main at cs:100.
  }
  return {
    branch: "/main",
    changeset: 100,
    controlled: {},
    added: [],
    merged: [],
    ...state
  };
}

function writeState(state) {
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  fs.writeFileSync(statePath, JSON.stringify(state, null, 2), "utf8");
}

function write(text) {
  process.stdout.write(text);
}

function fail(message) {
  process.stderr.write(`${message}\n`);
  process.exitCode = 2;
}

main();
