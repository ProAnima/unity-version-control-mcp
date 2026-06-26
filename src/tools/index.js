import {
  assertRelativeWorkspacePath,
  assertRepoAllowed,
  assertStandardMode,
  assertWorkspaceAllowed,
  consumeConfirmToken,
  createConfirmToken
} from "../policy/policy.js";
import { runDoctorService } from "../services/doctor.js";
import { unityMetaDiagnostics } from "../services/unity-meta.js";
import { changesetAnalytics } from "../services/analytics.js";
import { branchSafetyReport, cleanupCandidates } from "../services/safety.js";
import {
  createReleasePlan,
  createStyleInitPlan,
  loadStyleConfig,
  previewBranchName,
  previewCheckinMessage,
  styleSetupGuide,
  writeStyleConfig
} from "../services/style.js";
import { UvcsError } from "../backend/errors.js";

export function createTools({ config, backend }) {
  const definitions = [
    tool("uvcs_doctor", "Check cm, workspace, and UVCS MCP configuration.", {}, async () => runDoctorService(config, backend)),
    tool("uvcs_workspace_status", "Return concise workspace status.", {}, async () => {
      await assertWorkspacePolicy(config, backend);
      return await backend.status();
    }),
    tool("uvcs_pending_changes", "Return full pending changes from cm status.", {}, async () => {
      await assertWorkspacePolicy(config, backend);
      return await backend.pendingChanges();
    }),
    tool("uvcs_branch_info", "Return current branch information.", {}, async () => {
      await assertWorkspacePolicy(config, backend);
      return await backend.branchInfo();
    }),
    tool("uvcs_locks", "List workspace/server locks visible to cm.", {}, async () => {
      await assertWorkspacePolicy(config, backend);
      return await backend.locks();
    }),
    tool("uvcs_unity_meta_diagnostics", "Detect common Unity asset/.meta mismatches in the workspace.", {}, async () => {
      await assertWorkspacePolicy(config, backend);
      return await unityMetaDiagnostics(config.workspace);
    }),
    tool("uvcs_style_rules", "Return workspace naming and release style rules.", {}, async () => {
      await assertWorkspacePolicy(config, backend);
      return await loadStyleConfig(config.workspace);
    }),
    tool(
      "uvcs_style_setup_check",
      "Check whether workspace naming/checkin/release style rules exist. If missing, guide the model to ask the user to create them before branch work.",
      {},
      async () => {
        await assertWorkspacePolicy(config, backend);
        return await styleSetupGuide(config.workspace);
      }
    ),
    ...prepareConfirmTool({
      config,
      backend,
      name: "uvcs_style_init",
      description: "Create .uvcs-mcp/style.json with branch naming, checkin message, and release conventions. Requires prepare/confirm.",
      properties: {
        preset: {
          type: "string",
          enum: ["unity", "conventional", "minimal"],
          description: "Style preset. unity is recommended for Unity teams."
        },
        baseBranch: {
          type: "string",
          description: "Base branch for generated branches, for example /main or /main/dev."
        },
        branchPrefix: {
          type: "string",
          description: "Optional safe prefix before branch slugs, for example PROJ-."
        },
        versionFile: {
          type: "string",
          description: "Optional relative version file used by release planning, for example ProjectSettings/ProjectVersion.txt."
        },
        overwrite: {
          type: "boolean",
          description: "Set true only when replacing an existing .uvcs-mcp/style.json."
        }
      },
      required: [],
      action: "style_init",
      confirmPhrase: "confirm uvcs style init",
      prepare: async (args) => {
        await assertWorkspacePolicy(config, backend);
        assertStandardMode(config);
        return await createStyleInitPlan({ workspace: config.workspace, ...args });
      },
      confirm: async (payload) => await writeStyleConfig({
        workspace: config.workspace,
        style: payload.style,
        overwrite: payload.overwrite
      })
    }),
    tool(
      "uvcs_name_preview",
      "Preview a branch name or checkin message from workspace style rules.",
      {
        kind: {
          type: "string",
          enum: ["branch", "checkin"],
          description: "Preview kind."
        },
        type: {
          type: "string",
          description: "Branch or checkin type, such as feature, fix, feat, or release."
        },
        title: {
          type: "string",
          description: "Human title used for branch slug previews."
        },
        summary: {
          type: "string",
          description: "Single-line summary used for checkin message previews."
        },
        baseBranch: {
          type: "string",
          description: "Optional base branch for branch previews, such as /main."
        }
      },
      async ({ kind, type, title, summary, baseBranch }) => {
        await assertWorkspacePolicy(config, backend);
        const { style, source, path } = await loadStyleConfig(config.workspace);
        if (kind === "branch") {
          return {
            kind,
            source,
            path,
            value: previewBranchName({ style, baseBranch, type, title })
          };
        }
        if (kind === "checkin") {
          return {
            kind,
            source,
            path,
            value: previewCheckinMessage({ style, type, summary })
          };
        }
        throw new UvcsError("kind must be branch or checkin", { code: "INVALID_STYLE_INPUT" });
      },
      ["kind", "type"]
    ),
    tool(
      "uvcs_release_plan",
      "Plan a major, minor, or patch release branch, label, and comments from workspace style rules. Read-only.",
      {
        releaseType: {
          type: "string",
          enum: ["major", "minor", "patch"],
          description: "Semantic version bump type."
        },
        currentVersion: {
          type: "string",
          description: "Optional semantic version. If omitted, the style versionFile is read from the workspace."
        }
      },
      async ({ releaseType, currentVersion }) => {
        await assertWorkspacePolicy(config, backend);
        return await createReleasePlan({ workspace: config.workspace, releaseType, currentVersion });
      },
      ["releaseType"]
    ),
    tool(
      "uvcs_diff_file",
      "Return cm diff output for a file inside the workspace.",
      {
        filePath: {
          type: "string",
          description: "Path relative to UVCS_WORKSPACE."
        }
      },
      async ({ filePath }) => {
        await assertWorkspacePolicy(config, backend);
        const safePath = assertRelativeWorkspacePath(config, filePath);
        return await backend.diffFile(safePath);
      },
      ["filePath"]
    ),
    ...prepareConfirmTool({
      config,
      backend,
      name: "uvcs_update_workspace",
      description: "Update the workspace. Requires prepare/confirm.",
      properties: {},
      required: [],
      action: "update_workspace",
      confirmPhrase: "confirm uvcs update",
      prepare: async () => {
        await assertWorkspacePolicy(config, backend);
        assertStandardMode(config);
        const branchInfo = await backend.branchInfo();
        return { branchLine: branchInfo.branchLine ?? "" };
      },
      confirm: async () => await backend.update()
    }),
    tool(
      "uvcs_changeset_analytics",
      "Analyze changesets over an optional date, branch, owner, or comment filter. Read-only.",
      {
        since: {
          type: "string",
          description: "Optional start date in YYYY-MM-DD format."
        },
        until: {
          type: "string",
          description: "Optional end date in YYYY-MM-DD format."
        },
        branch: {
          type: "string",
          description: "Optional branch path, for example /main or /main/release."
        },
        owner: {
          type: "string",
          description: "Optional changeset owner."
        },
        commentLike: {
          type: "string",
          description: "Optional substring to match in changeset comments."
        },
        maxResults: {
          type: "number",
          description: "Maximum changesets to return, from 1 to 500. Default: 100."
        }
      },
      async (args) => {
        await assertWorkspacePolicy(config, backend);
        return await changesetAnalytics({ backend, ...args });
      }
    ),
    tool(
      "uvcs_cleanup_candidates",
      "Read-only helper that lists temporary/agent branch cleanup candidates for manual review. It never deletes branches or changesets.",
      {
        patterns: {
          type: "string",
          description: "Optional semicolon-separated branch prefixes to inspect, for example /main/tmp;/main/agent."
        },
        maxResults: {
          type: "number",
          description: "Maximum branches to return, from 1 to 200. Default: 50."
        }
      },
      async ({ patterns, maxResults }) => {
        await assertWorkspacePolicy(config, backend);
        return await cleanupCandidates({
          backend,
          patterns: patterns ? patterns.split(";") : undefined,
          maxResults: maxResults ?? 50
        });
      }
    ),
    tool(
      "uvcs_branch_safety_report",
      "Read-only helper that reports current branch, pending changes, and recent changesets before risky branch, merge, or cleanup work.",
      {
        branch: {
          type: "string",
          description: "Optional branch to inspect. Defaults to the current workspace branch."
        },
        recentChangesets: {
          type: "number",
          description: "Recent changesets to include, from 1 to 50. Default: 10."
        }
      },
      async ({ branch, recentChangesets }) => {
        await assertWorkspacePolicy(config, backend);
        return await branchSafetyReport({
          backend,
          branch,
          recentChangesets: recentChangesets ?? 10
        });
      }
    ),
    ...prepareConfirmTool({
      config,
      backend,
      name: "uvcs_add",
      description: "Add a path to Plastic SCM / UVCS version control recursively. Requires prepare/confirm.",
      properties: {
        itemPath: {
          type: "string",
          description: "Path relative to UVCS_WORKSPACE."
        }
      },
      required: ["itemPath"],
      action: "add",
      confirmPhrase: "confirm uvcs add",
      prepare: async ({ itemPath }) => {
        await assertWorkspacePolicy(config, backend);
        assertStandardMode(config);
        const safePath = assertRelativeWorkspacePath(config, itemPath);
        return { itemPath: safePath };
      },
      confirm: async (payload) => await backend.add(payload.itemPath)
    }),
    ...prepareConfirmTool({
      config,
      backend,
      name: "uvcs_branch_create",
      description: "Create a Plastic SCM / UVCS branch from a changeset or label. Requires prepare/confirm.",
      properties: {
        branch: {
          type: "string",
          description: "Branch path, for example /main/task."
        },
        fromChangeset: {
          type: "string",
          description: "Optional changeset spec, for example cs:92."
        },
        fromLabel: {
          type: "string",
          description: "Optional label spec, for example lb:RELEASE_1."
        },
        comment: {
          type: "string",
          description: "Optional branch comment."
        }
      },
      required: ["branch"],
      action: "branch_create",
      confirmPhrase: "confirm uvcs branch create",
      prepare: async ({ branch, fromChangeset, fromLabel, comment }) => {
        await assertWorkspacePolicy(config, backend);
        assertStandardMode(config);
        assertBranchSpec(branch);
        assertOptionalSingleLine(comment, "comment");
        if (!fromChangeset && !fromLabel) {
          throw new UvcsError("Branch creation requires fromChangeset or fromLabel", { code: "INVALID_BRANCH_SOURCE" });
        }
        if (fromChangeset && fromLabel) {
          throw new UvcsError("Use only one branch source: fromChangeset or fromLabel", { code: "INVALID_BRANCH_SOURCE" });
        }
        if (fromChangeset) assertChangesetSpec(fromChangeset);
        if (fromLabel) assertLabelSpec(fromLabel);
        return { branch, fromChangeset, fromLabel, comment };
      },
      confirm: async (payload) => await backend.createBranch(payload)
    }),
    ...prepareConfirmTool({
      config,
      backend,
      name: "uvcs_label_create",
      description: "Create a Plastic SCM / UVCS label on a changeset. Requires prepare/confirm.",
      properties: {
        label: {
          type: "string",
          description: "Label name, for example UVCS_MCP_SMOKE_1."
        },
        target: {
          type: "string",
          description: "Changeset spec, for example cs:93."
        },
        comment: {
          type: "string",
          description: "Optional label comment."
        }
      },
      required: ["label", "target"],
      action: "label_create",
      confirmPhrase: "confirm uvcs label create",
      prepare: async ({ label, target, comment }) => {
        await assertWorkspacePolicy(config, backend);
        assertStandardMode(config);
        assertLabelName(label);
        assertChangesetSpec(target);
        assertOptionalSingleLine(comment, "comment");
        return { label, target, comment };
      },
      confirm: async (payload) => await backend.createLabel(payload)
    }),
    ...prepareConfirmTool({
      config,
      backend,
      name: "uvcs_switch_workspace",
      description: "Switch the workspace to a branch, changeset, or label. Requires prepare/confirm.",
      properties: {
        target: {
          type: "string",
          description: "Target spec, for example /main/task, cs:92, or lb:LABEL."
        }
      },
      required: ["target"],
      action: "switch_workspace",
      confirmPhrase: "confirm uvcs switch",
      prepare: async ({ target }) => {
        await assertWorkspacePolicy(config, backend);
        assertStandardMode(config);
        assertSwitchTarget(target);
        const status = await backend.pendingChanges();
        const changedFiles = countLikelyChangedFiles(status.stdout);
        if (changedFiles > 0) {
          throw new UvcsError("Refusing switch with pending changes", {
            code: "PENDING_CHANGES_BLOCK_SWITCH",
            details: { pendingChanges: status.stdout }
          });
        }
        return { target };
      },
      confirm: async ({ target }) => await backend.switchTo(target)
    }),
    ...prepareConfirmTool({
      config,
      backend,
      name: "uvcs_merge",
      description: "Merge a branch/changeset/label into the current workspace branch. Requires prepare/confirm.",
      properties: {
        source: {
          type: "string",
          description: "Merge source spec, for example /main/task, cs:94, or lb:LABEL."
        },
        comment: {
          type: "string",
          description: "Optional merge comment; Plastic may still require a follow-up checkin."
        }
      },
      required: ["source"],
      action: "merge",
      confirmPhrase: "confirm uvcs merge",
      prepare: async ({ source, comment }) => {
        await assertWorkspacePolicy(config, backend);
        assertStandardMode(config);
        assertSwitchTarget(source);
        assertOptionalSingleLine(comment, "comment");
        const status = await backend.pendingChanges();
        const changedFiles = countLikelyChangedFiles(status.stdout);
        if (changedFiles > 0) {
          throw new UvcsError("Refusing merge with pending changes", {
            code: "PENDING_CHANGES_BLOCK_MERGE",
            details: { pendingChanges: status.stdout }
          });
        }
        return { source, comment };
      },
      confirm: async (payload) => await backend.merge(payload)
    }),
    tool(
      "uvcs_checkin_prepare",
      "Prepare a checkin and return a short-lived confirmation token.",
      {
        message: {
          type: "string",
          description: "Checkin comment."
        }
      },
      async ({ message }) => {
        await assertWorkspacePolicy(config, backend);
        assertStandardMode(config);
        assertCheckinMessage(message);
        const status = await backend.pendingChanges();
        const changedFiles = countLikelyChangedFiles(status.stdout);
        if (changedFiles > config.checkinMaxFiles) {
          throw new UvcsError(`Refusing checkin prepare: ${changedFiles} files exceed UVCS_CHECKIN_MAX_FILES=${config.checkinMaxFiles}`, {
            code: "CHECKIN_TOO_LARGE",
            details: {
              changedFiles,
              maxFiles: config.checkinMaxFiles
            }
          });
        }
        const confirm = createConfirmToken({
          action: "checkin",
          payload: { message },
          ttlSec: config.tokenTtlSec
        });
        return {
          action: "checkin",
          confirmPhrase: "confirm uvcs checkin",
          token: confirm.token,
          expiresAt: new Date(confirm.expiresAt).toISOString(),
          pendingChanges: status.stdout
        };
      },
      ["message"]
    ),
    tool(
      "uvcs_checkin_confirm",
      "Confirm and run a prepared checkin.",
      {
        token: {
          type: "string",
          description: "Token returned by uvcs_checkin_prepare."
        },
        confirmPhrase: {
          type: "string",
          description: "Must be exactly: confirm uvcs checkin"
        }
      },
      async ({ token, confirmPhrase }) => {
        await assertWorkspacePolicy(config, backend);
        assertStandardMode(config);
        if (confirmPhrase !== "confirm uvcs checkin") {
          throw new UvcsError("Invalid confirmPhrase", { code: "INVALID_CONFIRM_PHRASE" });
        }
        const payload = consumeConfirmToken({ token, action: "checkin" });
        return await backend.checkin(payload.message);
      },
      ["token", "confirmPhrase"]
    )
  ];

  const byName = new Map(definitions.map((definition) => [definition.name, definition]));

  return {
    list: () => definitions.map(({ handler: _handler, ...definition }) => definition),
    call: async (name, args) => {
      const definition = byName.get(name);
      if (!definition) throw new UvcsError(`Unknown tool: ${name}`, { code: "UNKNOWN_TOOL" });
      return await definition.handler(args);
    }
  };
}

function tool(name, description, properties, handler, required = []) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties,
      required,
      additionalProperties: false
    },
    handler
  };
}

function prepareConfirmTool({ config, backend, name, description, properties, required, action, confirmPhrase, prepare, confirm }) {
  return [
    tool(
      `${name}_prepare`,
      `${description} Returns a short-lived confirmation token.`,
      properties,
      async (args) => {
        const payload = await prepare(args);
        const token = createConfirmToken({
          action,
          payload,
          ttlSec: config.tokenTtlSec
        });
        return {
          action,
          confirmPhrase,
          token: token.token,
          expiresAt: new Date(token.expiresAt).toISOString(),
          payload
        };
      },
      required
    ),
    tool(
      `${name}_confirm`,
      `${description} Confirms and executes a prepared operation.`,
      {
        token: {
          type: "string",
          description: `Token returned by ${name}_prepare.`
        },
        confirmPhrase: {
          type: "string",
          description: `Must be exactly: ${confirmPhrase}`
        }
      },
      async ({ token, confirmPhrase: providedPhrase }) => {
        await assertWorkspacePolicy(config, backend);
        assertStandardMode(config);
        if (providedPhrase !== confirmPhrase) {
          throw new UvcsError("Invalid confirmPhrase", { code: "INVALID_CONFIRM_PHRASE" });
        }
        const payload = consumeConfirmToken({ token, action });
        return await confirm(payload);
      },
      ["token", "confirmPhrase"]
    )
  ];
}

async function assertWorkspacePolicy(config, backend) {
  assertWorkspaceAllowed(config);
  if (!config.allowedRepos || config.allowedRepos.length === 0) return;
  assertRepoAllowed(config, await backend.workspaceInfo());
}

function countLikelyChangedFiles(statusText) {
  if (!statusText.trim()) return 0;
  return statusText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("Total:"))
    .filter((line) => !line.startsWith("STATUS\u001f"))
    .filter((line) => !line.startsWith("STAGE\u001f"))
    .length;
}

function assertCheckinMessage(message) {
  if (typeof message !== "string" || message.trim().length === 0 || /[\r\n]/.test(message)) {
    throw new UvcsError("Checkin message must be a non-empty single line", {
      code: "INVALID_CHECKIN_MESSAGE"
    });
  }
}

function assertOptionalSingleLine(value, name) {
  if (value === undefined || value === null || value === "") return;
  if (typeof value !== "string" || /[\r\n]/.test(value)) {
    throw new UvcsError(`${name} must be a single line string`, {
      code: "INVALID_SINGLE_LINE",
      details: { name }
    });
  }
}

function assertBranchSpec(branch) {
  if (typeof branch !== "string" || !/^\/?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(branch)) {
    throw new UvcsError("Branch must be a safe branch path such as /main or /main/task-name", {
      code: "INVALID_BRANCH_SPEC",
      details: { branch }
    });
  }
}

function assertLabelName(label) {
  if (typeof label !== "string" || !/^[A-Za-z0-9._-]+$/.test(label)) {
    throw new UvcsError("Label must contain only letters, numbers, dot, underscore, or dash", {
      code: "INVALID_LABEL_NAME",
      details: { label }
    });
  }
}

function assertLabelSpec(labelSpec) {
  if (typeof labelSpec !== "string" || !/^lb:[A-Za-z0-9._-]+$/.test(labelSpec)) {
    throw new UvcsError("Label spec must look like lb:LABEL_NAME", {
      code: "INVALID_LABEL_SPEC",
      details: { labelSpec }
    });
  }
}

function assertChangesetSpec(changesetSpec) {
  if (typeof changesetSpec !== "string" || !/^cs:\d+$/.test(changesetSpec)) {
    throw new UvcsError("Changeset spec must look like cs:123", {
      code: "INVALID_CHANGESET_SPEC",
      details: { changesetSpec }
    });
  }
}

function assertSwitchTarget(target) {
  if (typeof target !== "string") {
    throw new UvcsError("Target must be a string", { code: "INVALID_TARGET" });
  }
  if (/^cs:\d+$/.test(target) || /^lb:[A-Za-z0-9._-]+$/.test(target)) return;
  assertBranchSpec(target);
}
