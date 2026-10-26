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

  if (command === "diff" && /^(cs|br|lb|sh):/.test(args[1] ?? "")) {
    // Tree diff: status, type, path, srccmpath, dstcmpath, revid, baserevid.
    write([
      ["C", "F", "\"/Assets/Scripts/Player.cs\"", "\"\"", "\"\"", "11", "10"],
      ["A", "B", "\"/Assets/Art/Hero.png\"", "\"\"", "\"\"", "12", "-1"],
      ["M", "F", "\"/Assets/Scripts/Moved.cs\"", "\"/Assets/Old/Moved.cs\"", "\"/Assets/Scripts/Moved.cs\"", "13", "9"],
      ["M", "F", "\"/Assets/Scripts/Moved.cs.meta\"", "\"/Assets/Old/Moved.cs.meta\"", "\"/Assets/Scripts/Moved.cs.meta\"", "14", "8"]
    ].map((row) => row.join(FIELD_SEPARATOR)).concat("").join("\n"));
    return;
  }

  if (command === "diff") {
    write(`--- ${args[1]}\n+++ ${args[1]}\n@@ fake diff @@\n`);
    return;
  }

  if (command === "history") {
    write([
      [99, "/main", "02.01.2026 10:00:00", "agent", "500", "first line\nsecond line"],
      [100, "/main", "03.01.2026 10:00:00", "agent", "501", "latest"]
    ].map((row) => `${row.join(FIELD_SEPARATOR)}\u001e`).concat("").join("\n"));
    return;
  }

  if (command === "annotate") {
    write([
      ["1", "99", "agent", "2026-01-02T10:00:00", "br:/main", "using UnityEngine;"],
      ["2", "100", "agent", "2026-01-03T10:00:00", "br:/main", "public class Player {}"]
    ].map((row) => row.join(FIELD_SEPARATOR)).concat("").join("\n"));
    return;
  }

  if (command === "cat") {
    const revision = String(args[1] ?? "").match(/#cs:(\d+)$/);
    if (!revision) {
      fail(`The specified revision was not found ${args[1]}`);
      return;
    }
    write(`using UnityEngine;\npublic class Player { int version = ${revision[1]}; }\n`);
    return;
  }

  if (command === "merge" && !args.includes("--merge")) {
    if (args.some((arg) => arg.startsWith("--to="))) {
      write(`STATUS${FIELD_SEPARATOR}ALREADY_CONNECTED${FIELD_SEPARATOR}No merges detected\n`);
      return;
    }
    write([
      ["FILE_SRC", "/Assets/Scripts/Player.cs", "99", "100", "500"],
      ["APPLY", "ADD", "/Assets/Scripts/New.cs"]
    ].map((row) => row.join(FIELD_SEPARATOR)).concat("").join("\n"));
    return;
  }

  if (command === "find" && subcommand === "label") {
    write([
      `RELEASE_1${FIELD_SEPARATOR}100${FIELD_SEPARATOR}2026-01-03T10:00:00${FIELD_SEPARATOR}agent${FIELD_SEPARATOR}/main${FIELD_SEPARATOR}first release`,
      ""
    ].join("\n"));
    return;
  }

  if (command === "lock" && subcommand === "list") {
    // Locks held by someone else, seeded in the state file by tests.
    const state = readState();
    const requested = args.slice(2).filter((arg) => !arg.startsWith("-")).map(normalizeItem);
    const rows = state.locks.filter((lock) => requested.length === 0 || requested.includes(lock.item));
    write(rows.map((lock) => ["00000000-0000-0000-0000-000000000001", lock.owner, lock.workspace, `/${lock.item}`].join(FIELD_SEPARATOR)).concat("").join("\n"));
    return;
  }

  if (command === "checkout") {
    const state = readState();
    for (const item of positionalPaths().map(normalizeItem)) {
      if (!(item in state.controlled)) {
        fail(`The item ${item} is not under source control`);
        return;
      }
      if (state.locks.some((lock) => lock.item === item)) {
        fail(`The item ${item} is locked by another user`);
        return;
      }
      if (!state.checkedOut.includes(item)) state.checkedOut.push(item);
    }
    writeState(state);
    write("Checked out\n");
    return;
  }

  if (command === "find" && subcommand === "branch" && args.some((arg) => arg.includes("{parent}"))) {
    write([
      `main/task${FIELD_SEPARATOR}2026-01-02T10:00:00${FIELD_SEPARATOR}agent${FIELD_SEPARATOR}main${FIELD_SEPARATOR}100${FIELD_SEPARATOR}task branch`,
      ""
    ].join("\n"));
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

  if (command === "find" && subcommand === "changeset" && args.includes("--format={parent}")) {
    const id = String(args[2] ?? "").match(/changesetid=(\d+)/);
    write(id ? `${Number(id[1]) - 1}\n` : "");
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

  if (command === "undo" && args.includes("--unchanged")) {
    const state = readState();
    const targets = positionalPaths().map(normalizeItem);
    state.checkedOut = state.checkedOut.filter((item) => !(targets.includes(item) && hashFile(item) === state.controlled[item]));
    writeState(state);
    return;
  }

  if (command === "undo") {
    const state = readState();
    const target = normalizeItem(args[1]);
    const matches = (item) => item === target || item.startsWith(`${target}/`);
    state.added = state.added.filter((item) => !matches(item));
    state.merged = state.merged.filter((item) => !matches(item));
    state.checkedOut = state.checkedOut.filter((item) => !matches(item));
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
    const scope = positionalPaths().map(normalizeItem);
    const inScope = (item) => scope.length === 0 || scope.some((target) => item === target || item.startsWith(`${target}/`));
    const rows = pendingRows(state).filter(({ item }) => inScope(item));
    if (rows.length === 0) {
      fail("There are no changes to check in.");
      return;
    }
    for (const { item } of rows) {
      if (!state.merged.includes(item)) state.controlled[item] = hashFile(item);
    }
    state.added = state.added.filter((item) => !inScope(item));
    state.merged = state.merged.filter((item) => !inScope(item));
    state.checkedOut = state.checkedOut.filter((item) => !inScope(item));
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
    .filter(([item, hash]) => hashFile(item) !== hash || state.checkedOut.includes(item))
    .map(([item]) => ({ status: state.checkedOut.includes(item) ? "CO" : "CH", item }));
  return [
    ...state.added.map((item) => ({ status: "AD", item })),
    ...changed,
    ...state.merged.map((item) => ({ status: "CH", item }))
  ];
}

// Item paths come right after the command, before the first option.
function positionalPaths() {
  const rest = args.slice(1);
  const firstOption = rest.findIndex((arg) => arg.startsWith("-"));
  return firstOption === -1 ? rest : rest.slice(0, firstOption);
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
    checkedOut: [],
    locks: [],
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
