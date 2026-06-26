import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  createStyleInitPlan,
  createReleasePlan,
  loadStyleConfig,
  previewBranchName,
  previewCheckinMessage,
  styleSetupGuide,
  writeStyleConfig
} from "../src/services/style.js";

test("release plan uses default style and explicit current version", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-style-"));
  const plan = await createReleasePlan({
    workspace,
    releaseType: "minor",
    currentVersion: "1.2.3"
  });

  assert.equal(plan.nextVersion, "1.3.0");
  assert.equal(plan.branch, "/main/release/v1.3.0");
  assert.equal(plan.label, "v1.3.0");
  assert.equal(plan.checkinMessage, "release: prepare v1.3.0");
});

test("style config customizes branch and checkin previews", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-style-"));
  await fs.mkdir(path.join(workspace, ".uvcs-mcp"));
  await fs.writeFile(path.join(workspace, ".uvcs-mcp", "style.json"), JSON.stringify({
    release: {
      baseBranch: "/main/stable"
    },
    branches: {
      branchPattern: "{baseBranch}/{type}/pa-{slug}",
      allowedTypes: ["feature"]
    },
    checkins: {
      messagePattern: "[{type}] {summary}",
      allowedTypes: ["feat"]
    }
  }), "utf8");

  const loaded = await loadStyleConfig(workspace);
  assert.equal(loaded.source, "workspace");
  assert.equal(previewBranchName({
    style: loaded.style,
    type: "feature",
    title: "Add Release Automation"
  }), "/main/stable/feature/pa-add-release-automation");
  assert.equal(previewCheckinMessage({
    style: loaded.style,
    type: "feat",
    summary: "add release automation"
  }), "[feat] add release automation");
});

test("style setup guide asks the model to propose workspace rules when missing", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-style-"));
  const guide = await styleSetupGuide(workspace);

  assert.equal(guide.configured, false);
  assert.equal(guide.setupTool, "uvcs_style_init_prepare");
  assert.match(guide.suggestedQuestion, /style rules/i);
});

test("style init plan creates previewable workspace rules", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-style-"));
  const plan = await createStyleInitPlan({
    workspace,
    preset: "unity",
    baseBranch: "/main/dev",
    branchPrefix: "PROJ-",
    versionFile: "ProjectSettings/ProjectVersion.txt"
  });

  assert.equal(plan.style.release.baseBranch, "/main/dev");
  assert.equal(plan.style.release.versionFile, "ProjectSettings/ProjectVersion.txt");
  assert.equal(plan.style.branches.branchPrefix, "PROJ-");
  assert.equal(plan.preview.primaryBranch, "/main/dev/feature/PROJ-add-inventory-ui");
  assert.equal(plan.preview.checkinMessage, "feat: add inventory UI");
});

test("style init write refuses to overwrite existing rules unless requested", async () => {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), "uvcs-mcp-style-"));
  const plan = await createStyleInitPlan({ workspace });

  const written = await writeStyleConfig({
    workspace,
    style: plan.style,
    overwrite: false
  });
  assert.equal(written.source, "workspace");

  await assert.rejects(
    () => writeStyleConfig({ workspace, style: plan.style, overwrite: false }),
    /already exist/
  );

  await assert.doesNotReject(
    () => writeStyleConfig({ workspace, style: plan.style, overwrite: true })
  );
});
