#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const FIELD_SEPARATOR = "\u001f";
const statePath = path.join(process.cwd(), ".plastic", "fake-cm-state.json");
const args = process.argv.slice(2);

function main() {
  const [command, subcommand] = args;

  if (command === "showcommands") {
    write("status\nupdate\ncheckin\nbranch\nlabel\nswitch\nmerge\nlock\napi\n");
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
      write(`STATUS${FIELD_SEPARATOR}PATH${FIELD_SEPARATOR}REVISIONID\n`);
      return;
    }
    write(`cs:${state.changeset}@${state.branch}\n`);
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
    if (target?.startsWith("/")) state.branch = target;
    const changeset = String(target ?? "").match(/^cs:(\d+)$/);
    if (changeset) state.changeset = Number(changeset[1]);
    writeState(state);
    write(`Switched to ${target}\n`);
    return;
  }

  if (command === "add") {
    write(`Added ${args.at(-1)}\n`);
    return;
  }

  if (command === "merge") {
    write(`Merged ${args[1]}\n`);
    return;
  }

  if (command === "update") {
    write("Workspace updated\n");
    return;
  }

  if (command === "checkin") {
    const state = readState();
    state.changeset += 1;
    writeState(state);
    write(`Created changeset cs:${state.changeset}\n`);
    return;
  }

  fail(`Unsupported fake cm command: ${args.join(" ")}`);
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, "utf8"));
  } catch {
    return {
      branch: "/main",
      changeset: 100
    };
  }
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
