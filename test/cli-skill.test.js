import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { SKILL_NAME, SKILL_SOURCE, runSkill } from "../src/cli/skill.js";

async function withTemp(fn) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-skill-"));
  try {
    return await fn(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function capture() {
  let text = "";
  return { stdout: { write: (chunk) => { text += chunk; } }, text: () => text };
}

test("bundled skill has SKILL.md with a matching name", async () => {
  const skill = await fs.readFile(path.join(SKILL_SOURCE, "SKILL.md"), "utf8");
  assert.match(skill, new RegExp(`^---\\r?\\nname: ${SKILL_NAME}\\r?\\n`));
});

test("skill install writes Claude Code and .agents copies in the user scope and is idempotent", async () => {
  await withTemp(async (homeDir) => {
    const first = capture();
    await runSkill(["install"], { homeDir, env: {}, stdout: first.stdout });
    for (const root of [".claude", ".agents"]) {
      const installed = await fs.readFile(path.join(homeDir, root, "skills", SKILL_NAME, "SKILL.md"), "utf8");
      assert.match(installed, /name: uvcs-version-control/);
    }
    assert.match(first.text(), /Installed:/);

    const second = capture();
    await runSkill(["install"], { homeDir, env: {}, stdout: second.stdout });
    assert.doesNotMatch(second.text(), /Installed:/);
    assert.match(second.text(), /Up to date:/);
  });
});

test("skill install refuses to replace a different copy without --force and backs it up with --force", async () => {
  await withTemp(async (homeDir) => {
    const target = path.join(homeDir, ".claude", "skills", SKILL_NAME);
    await fs.mkdir(target, { recursive: true });
    await fs.writeFile(path.join(target, "SKILL.md"), "old", "utf8");

    await assert.rejects(
      () => runSkill(["install", "--agent=claude"], { homeDir, env: {}, stdout: capture().stdout }),
      /--force/
    );

    const out = capture();
    await runSkill(["install", "--agent=claude", "--force"], { homeDir, env: {}, stdout: out.stdout, now: () => new Date(2026, 0, 2, 3, 4, 5) });
    const backup = path.join(homeDir, ".claude", `${SKILL_NAME}.20260102030405.bak`);
    assert.equal(await fs.readFile(path.join(backup, "SKILL.md"), "utf8"), "old");
    assert.match(await fs.readFile(path.join(target, "SKILL.md"), "utf8"), /name: uvcs-version-control/);
  });
});

test("project scope needs --project-dir and maps every agent to its folder", async () => {
  await withTemp(async (projectDir) => {
    await assert.rejects(() => runSkill(["install", "--scope=project"], { stdout: capture().stdout }), /--project-dir/);

    const out = capture();
    await runSkill(["install", "--scope=project", `--project-dir=${projectDir}`, "--agent=all", "--print-only"], { stdout: out.stdout });
    for (const folder of [".claude", ".agents", ".cursor", ".opencode"]) {
      assert.match(out.text(), new RegExp(`Would install: .*\\${folder}[\\\\/]skills[\\\\/]${SKILL_NAME}`));
    }
    await assert.rejects(fs.stat(path.join(projectDir, ".claude")), /ENOENT/);
  });
});

test("skill install rejects unknown agents", async () => {
  await assert.rejects(() => runSkill(["install", "--agent=vim"], { stdout: capture().stdout }), /Unknown agent: vim/);
});
