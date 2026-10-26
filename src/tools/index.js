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
import { effectivePolicyReport } from "../services/policy-report.js";
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
import { fileStateFingerprint, pendingItems, summarizePendingChanges } from "../services/pending.js";
import { annotateFile, changesetDiff, fileHistory, listBranches, listLabels, normalizeObjectSpec, pendingFileDiff, revisionDiff } from "../services/history.js";
import { mergePreview } from "../services/merge-preview.js";
import { planScopedCheckin } from "../services/checkin-scope.js";
import { parseLocks, planCheckout, planReleaseCheckout, releaseResult } from "../services/checkout.js";
import { UvcsError } from "../backend/errors.js";

const MAX_DIFF_CHARS = 200_000;
const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true };

export function createTools({ config, backend }) {
  const definitions = [
    tool("uvcs_doctor", "Check cm, workspace, and UVCS MCP configuration.", {}, async () => {
      if (config.workspace) await assertWorkspacePolicy(config, backend);
      return await runDoctorService(config, backend);
    }),
    tool("uvcs_policy_status", "Show the effective workspace identity, safety profile, allowlists, write limits, and mass-work guidance.", {}, async () => {
      await assertWorkspacePolicy(config, backend);
      return effectivePolicyReport(config);
    }),
    tool("uvcs_setup_status", "Show safety policy and branch/checkin/release naming setup in one place.", {}, async () => {
      await assertWorkspacePolicy(config, backend);
      return {
        policy: effectivePolicyReport(config),
        conventions: await styleSetupGuide(config.workspace),
        ready: {
          readWork: true,
          writeWork: config.mode === "standard",
          massWork: config.mode === "readonly" || config.allowedRepos.length > 0
        }
      };
    }),
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
    tool(
      "uvcs_locks",
      "List exclusive locks (cm lock list). Without paths, the list covers every repository on the server; pass paths to check specific files in this workspace.",
      {
        paths: pathListSchema("Optional files relative to UVCS_WORKSPACE to check for locks."),
        scope: {
          type: "string",
          enum: ["all", "user", "workspace"],
          description: "all (default), user (locks taken by the current user), or workspace (locks taken from this workspace)."
        }
      },
      async ({ paths, scope }) => {
        await assertWorkspacePolicy(config, backend);
        const safePaths = (paths ?? []).map((item) => assertRelativeWorkspacePath(config, item));
        const result = await backend.locks({ paths: safePaths, scope: scope ?? "all" });
        return result.rows ? { ...result, locks: parseLocks(result.stdout) } : result;
      }
    ),
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
      destructive: false,
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
          description: "Optional semantic version bump type. Required when releaseVersion is omitted."
        },
        currentVersion: {
          type: "string",
          description: "Optional semantic version. If omitted, the style versionFile is read from the workspace."
        },
        releaseVersion: {
          type: "string",
          description: "Optional explicit release version for styles that use a user-provided version."
        },
        projectName: {
          type: "string",
          description: "Optional safe lowercase project code for release patterns that use {projectName}."
        }
      },
      async ({ releaseType, currentVersion, releaseVersion, projectName }) => {
        await assertWorkspacePolicy(config, backend);
        return await createReleasePlan({ workspace: config.workspace, releaseType, currentVersion, releaseVersion, projectName });
      },
      []
    ),
    tool(
      "uvcs_diff_file",
      `Return a unified line diff of one pending file: the revision loaded in the workspace against the file on disk. Output longer than ${MAX_DIFF_CHARS} characters is truncated. Read-only.`,
      {
        filePath: {
          type: "string",
          description: "Path relative to UVCS_WORKSPACE of a file with a pending change."
        },
        context: {
          type: "integer",
          minimum: 0,
          maximum: 20,
          description: "Unchanged lines around each change, from 0 to 20. Default: 3."
        }
      },
      async ({ filePath, context }) => {
        await assertWorkspacePolicy(config, backend);
        const safePath = assertRelativeWorkspacePath(config, filePath);
        return await pendingFileDiff({
          backend,
          workspace: config.workspace,
          filePath: safePath,
          context: context ?? 3,
          maxChars: MAX_DIFF_CHARS
        });
      },
      ["filePath"]
    ),
    tool(
      "uvcs_changeset_diff",
      "List the items added, changed, moved, or deleted in a changeset, label, shelve, or branch, or between two changesets/labels, with Unity .meta pairing warnings. Read-only.",
      {
        source: {
          type: "string",
          description: "What to inspect: cs:123 (that changeset), lb:LABEL, sh:12, or a branch such as /main/task (all changes made on the branch)."
        },
        compareTo: {
          type: "string",
          description: "Optional second changeset, label, or shelve (cs:130, lb:LABEL, sh:12). When set, source is the older side. Not allowed with a branch source."
        },
        maxItems: {
          type: "integer",
          minimum: 1,
          maximum: 5000,
          description: "Maximum items to return, from 1 to 5000. Default: 500. Counts always cover every item."
        }
      },
      async ({ source, compareTo, maxItems }) => {
        await assertWorkspacePolicy(config, backend);
        return await changesetDiff({ backend, source, compareTo, maxItems: maxItems ?? 500 });
      },
      ["source"]
    ),
    tool(
      "uvcs_revision_diff",
      `Return a unified line diff of one text file between two revisions, or between a revision and the workspace copy. Pass changeset to see what that changeset changed in the file. Output longer than ${MAX_DIFF_CHARS} characters is truncated. Read-only.`,
      {
        filePath: {
          type: "string",
          description: "Path relative to UVCS_WORKSPACE, for example Assets/Scripts/Player.cs."
        },
        changeset: {
          type: "string",
          description: "Changeset spec such as cs:123. Compares the file in that changeset with its parent changeset. Do not combine with from/to."
        },
        from: {
          type: "string",
          description: "Older side: cs:123, lb:LABEL, or a branch such as /main (latest revision on it)."
        },
        to: {
          type: "string",
          description: "Newer side: cs:130, lb:LABEL, or a branch. Omit to compare with the file in the workspace."
        },
        context: {
          type: "integer",
          minimum: 0,
          maximum: 20,
          description: "Unchanged lines around each change, from 0 to 20. Default: 3."
        }
      },
      async ({ filePath, changeset, from, to, context }) => {
        await assertWorkspacePolicy(config, backend);
        const safePath = assertRelativeWorkspacePath(config, filePath);
        return await revisionDiff({
          backend,
          workspace: config.workspace,
          filePath: safePath,
          changeset,
          from,
          to,
          context: context ?? 3,
          maxChars: MAX_DIFF_CHARS
        });
      },
      ["filePath"]
    ),
    tool(
      "uvcs_file_history",
      "List the revisions of a file or directory, newest first, with changeset, branch, date, owner, and comment. Dates use the cm client locale format (cm history has no date format option). Read-only.",
      {
        filePath: {
          type: "string",
          description: "Path relative to UVCS_WORKSPACE."
        },
        maxResults: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Maximum revisions to return, from 1 to 500. Default: 50."
        }
      },
      async ({ filePath, maxResults }) => {
        await assertWorkspacePolicy(config, backend);
        const safePath = assertRelativeWorkspacePath(config, filePath);
        return await fileHistory({ backend, filePath: safePath, maxResults: maxResults ?? 50 });
      },
      ["filePath"]
    ),
    tool(
      "uvcs_annotate",
      "Show who last changed each line of a text file and in which changeset (blame). Binary files cannot be annotated. Read-only.",
      {
        filePath: {
          type: "string",
          description: "Path relative to UVCS_WORKSPACE."
        },
        revision: {
          type: "string",
          description: "Optional cs:123, lb:LABEL, or branch to annotate instead of the workspace revision."
        },
        startLine: {
          type: "integer",
          minimum: 1,
          description: "First line to return. Default: 1."
        },
        maxLines: {
          type: "integer",
          minimum: 1,
          maximum: 5000,
          description: "Maximum lines to return, from 1 to 5000. Default: 500."
        }
      },
      async ({ filePath, revision, startLine, maxLines }) => {
        await assertWorkspacePolicy(config, backend);
        const safePath = assertRelativeWorkspacePath(config, filePath);
        return await annotateFile({ backend, filePath: safePath, revision, startLine: startLine ?? 1, maxLines: maxLines ?? 500 });
      },
      ["filePath"]
    ),
    tool(
      "uvcs_branch_list",
      "List branches, newest first, with owner, parent branch, head changeset, and comment. Read-only.",
      {
        nameLike: {
          type: "string",
          description: "Optional substring of the branch name, for example task or release."
        },
        owner: {
          type: "string",
          description: "Optional branch owner."
        },
        since: {
          type: "string",
          description: "Optional creation date lower bound in YYYY-MM-DD format."
        },
        parent: {
          type: "string",
          description: "Optional parent branch, for example /main, to list its child branches."
        },
        maxResults: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Maximum branches to return, from 1 to 500. Default: 50."
        }
      },
      async (args) => {
        await assertWorkspacePolicy(config, backend);
        return await listBranches({ backend, ...args, maxResults: args.maxResults ?? 50 });
      }
    ),
    tool(
      "uvcs_label_list",
      "List labels, newest first, with labeled changeset, branch, owner, and comment. Read-only.",
      {
        nameLike: {
          type: "string",
          description: "Optional substring of the label name, for example build or RELEASE."
        },
        owner: {
          type: "string",
          description: "Optional label owner."
        },
        since: {
          type: "string",
          description: "Optional creation date lower bound in YYYY-MM-DD format."
        },
        branch: {
          type: "string",
          description: "Optional branch the labeled changeset belongs to, for example /main."
        },
        maxResults: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "Maximum labels to return, from 1 to 500. Default: 50."
        }
      },
      async (args) => {
        await assertWorkspacePolicy(config, backend);
        return await listLabels({ backend, ...args, maxResults: args.maxResults ?? 50 });
      }
    ),
    tool(
      "uvcs_merge_preview",
      "Preview a merge without changing anything: files that would be taken from the source, items added/moved/deleted, and conflicts. Without destination the target is the workspace branch; with destination the preview is computed on the server for that branch. Read-only.",
      {
        source: {
          type: "string",
          description: "Merge source: a branch such as /main/task, cs:94, lb:LABEL, or sh:12."
        },
        destination: {
          type: "string",
          description: "Optional destination branch such as /main. Omit to preview a merge into the current workspace."
        },
        maxItems: {
          type: "integer",
          minimum: 1,
          maximum: 5000,
          description: "Maximum number of conflicts, and separately of changes, to return, from 1 to 5000. Default: 300. Counts always cover everything."
        }
      },
      async ({ source, destination, maxItems }) => {
        await assertWorkspacePolicy(config, backend);
        return await mergePreview({ backend, source, destination, maxItems: maxItems ?? 300 });
      },
      ["source"]
    ),
    ...prepareConfirmTool({
      config,
      backend,
      name: "uvcs_update_workspace",
      description: "Update the workspace to the latest changeset of its branch. Local edits to files changed upstream can produce merge conflicts. Requires prepare/confirm.",
      destructive: true,
      properties: {},
      required: [],
      action: "update_workspace",
      confirmPhrase: "confirm uvcs update",
      prepare: async () => {
        await assertWorkspacePolicy(config, backend);
        assertStandardMode(config);
        const branchInfo = await backend.branchInfo();
        const pending = summarizePendingChanges((await backend.pendingChanges()).stdout);
        return {
          branchLine: branchInfo.branchLine ?? "",
          pendingChangesCount: pending.trackedCount,
          ...(pending.trackedCount > 0
            ? { warning: `The workspace has ${pending.trackedCount} pending changes. Updating over them can create conflicts that must be resolved in the UVCS client. Prefer checking them in first (or shelving them in the UVCS client).` }
            : {})
        };
      },
      revalidate: async (payload) => {
        const branchInfo = await backend.branchInfo();
        if ((branchInfo.branchLine ?? "") !== payload.branchLine) {
          throw workspaceChangedError("branch changed after update preparation");
        }
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
          type: "integer",
          minimum: 1,
          maximum: 500,
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
          type: "integer",
          minimum: 1,
          maximum: 200,
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
          type: "integer",
          minimum: 1,
          maximum: 50,
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
      description: "Add a path to Plastic SCM / UVCS version control recursively. For Unity assets also add the matching .meta file. Requires prepare/confirm.",
      destructive: false,
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
      name: "uvcs_undo",
      description: "Irreversibly undo pending changes for one path inside the selected workspace. Workspace-root undo is forbidden. Requires prepare/confirm.",
      destructive: true,
      properties: {
        itemPath: {
          type: "string",
          description: "Path relative to UVCS_WORKSPACE. Use a specific file or directory; the workspace root is forbidden."
        },
        recursive: {
          type: "boolean",
          description: "Undo pending changes recursively below itemPath. Default: false."
        }
      },
      required: ["itemPath"],
      action: "undo",
      confirmPhrase: "confirm uvcs undo",
      prepare: async ({ itemPath, recursive = false }) => {
        await assertWorkspacePolicy(config, backend);
        assertStandardMode(config);
        const safePath = assertRelativeWorkspacePath(config, itemPath);
        if (safePath === "" || safePath === ".") {
          throw new UvcsError("Undoing the entire workspace is forbidden; choose a specific file or directory", {
            code: "UNDO_WORKSPACE_ROOT_FORBIDDEN"
          });
        }
        const status = await backend.pendingChanges();
        return {
          itemPath: safePath,
          recursive,
          statusFingerprint: summarizePendingChanges(status.stdout).fingerprint,
          warning: "UVCS undo is irreversible. Review pendingChanges before confirming.",
          pendingChanges: status.stdout
        };
      },
      revalidate: async (payload) => {
        const status = await backend.pendingChanges();
        if (summarizePendingChanges(status.stdout).fingerprint !== payload.statusFingerprint) {
          throw workspaceChangedError("pending changes changed after undo preparation");
        }
      },
      confirm: async ({ itemPath, recursive }) => await backend.undo({ itemPath, recursive })
    }),
    ...prepareConfirmTool({
      config,
      backend,
      name: "uvcs_branch_create",
      description: "Create a Plastic SCM / UVCS branch from a changeset or label. Requires prepare/confirm.",
      destructive: false,
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
      destructive: false,
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
      description: "Switch the workspace to a branch, changeset, or label. Refused while tracked pending changes exist. Requires prepare/confirm.",
      destructive: true,
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
        const pending = summarizePendingChanges(status.stdout);
        if (pending.trackedCount > 0) {
          throw new UvcsError("Refusing switch with pending changes", {
            code: "PENDING_CHANGES_BLOCK_SWITCH",
            details: { pendingChangesCount: pending.trackedCount, pendingChanges: status.stdout }
          });
        }
        return { target, statusFingerprint: pending.fingerprint };
      },
      revalidate: async (payload) => {
        const status = await backend.pendingChanges();
        if (summarizePendingChanges(status.stdout).fingerprint !== payload.statusFingerprint) {
          throw workspaceChangedError("pending changes changed after switch preparation");
        }
      },
      confirm: async ({ target }) => await backend.switchTo(target)
    }),
    ...prepareConfirmTool({
      config,
      backend,
      name: "uvcs_merge",
      description: "Merge a branch/changeset/label into the current workspace branch. Refused while tracked pending changes exist or when the merge has conflicts (resolve those in the UVCS client); the merge result stays pending until a checkin. Requires prepare/confirm.",
      destructive: true,
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
        const pending = summarizePendingChanges(status.stdout);
        if (pending.trackedCount > 0) {
          throw new UvcsError("Refusing merge with pending changes", {
            code: "PENDING_CHANGES_BLOCK_MERGE",
            details: { pendingChangesCount: pending.trackedCount, pendingChanges: status.stdout }
          });
        }
        // The merge runs with exactly the spec that was previewed.
        const sourceSpec = normalizeObjectSpec(source, "source");
        const preview = await assertMergeable(backend, sourceSpec);
        return { source: sourceSpec, comment, changeCount: preview.changeCount, statusFingerprint: pending.fingerprint };
      },
      revalidate: async (payload) => {
        const status = await backend.pendingChanges();
        if (summarizePendingChanges(status.stdout).fingerprint !== payload.statusFingerprint) {
          throw workspaceChangedError("pending changes changed after merge preparation");
        }
        // New changesets on the source can bring conflicts after prepare.
        const preview = await assertMergeable(backend, payload.source);
        if (preview.changeCount !== payload.changeCount) {
          throw workspaceChangedError("the merge source changed after merge preparation");
        }
      },
      confirm: async (payload) => await backend.merge(payload)
    }),
    ...prepareConfirmTool({
      config,
      backend,
      name: "uvcs_checkout",
      description: "Check out files before editing them. When the server has a lock rule for them (lock.conf), this takes the exclusive lock so nobody else can check them out or check in changes to them, which is how teams protect scenes, prefabs, and other binary assets. Files locked by someone else are refused. Requires prepare/confirm.",
      destructive: false,
      properties: {
        paths: pathListSchema("Files relative to UVCS_WORKSPACE to check out, for example Assets/Scenes/Main.unity.")
      },
      required: ["paths"],
      action: "checkout",
      confirmPhrase: "confirm uvcs checkout",
      prepare: async ({ paths }) => {
        await assertWorkspacePolicy(config, backend);
        assertStandardMode(config);
        const safePaths = paths.map((item) => assertRelativeWorkspacePath(config, item));
        const plan = await planCheckout({ backend, workspace: config.workspace, paths: safePaths });
        return { paths: plan.paths, alreadyCheckedOut: plan.alreadyCheckedOut, statusFingerprint: plan.fingerprint };
      },
      revalidate: async (payload) => {
        const plan = await planCheckout({ backend, workspace: config.workspace, paths: payload.paths });
        if (plan.fingerprint !== payload.statusFingerprint) {
          throw workspaceChangedError("the pending status of the files changed after checkout preparation");
        }
      },
      confirm: async ({ paths }) => await backend.checkout(paths)
    }),
    ...prepareConfirmTool({
      config,
      backend,
      name: "uvcs_release_checkout",
      description: "Release checkouts (and their locks) of files whose content did not change. Modified files keep their checkout and their edits; check those in or undo them. Requires prepare/confirm.",
      destructive: false,
      properties: {
        paths: pathListSchema("Checked-out files relative to UVCS_WORKSPACE.")
      },
      required: ["paths"],
      action: "release_checkout",
      confirmPhrase: "confirm uvcs release checkout",
      prepare: async ({ paths }) => {
        await assertWorkspacePolicy(config, backend);
        assertStandardMode(config);
        const safePaths = paths.map((item) => assertRelativeWorkspacePath(config, item));
        const plan = await planReleaseCheckout({ backend, workspace: config.workspace, paths: safePaths });
        return { paths: plan.paths, statusFingerprint: plan.fingerprint };
      },
      revalidate: async (payload) => {
        const plan = await planReleaseCheckout({ backend, workspace: config.workspace, paths: payload.paths });
        if (plan.fingerprint !== payload.statusFingerprint) {
          throw workspaceChangedError("the pending status of the files changed after release preparation");
        }
      },
      confirm: async ({ paths }) => await releaseResult({
        backend,
        workspace: config.workspace,
        paths,
        result: await backend.releaseCheckout(paths)
      })
    }),
    tool(
      "uvcs_checkin_prepare",
      "Prepare a checkin and return a short-lived confirmation token. Without paths it takes ALL tracked pending changes in the workspace; with paths only the changes at or below those paths, plus the Unity .meta partner of every selected asset. Private files are never included, except a new parent folder that a selected item needs (listed in dependencies). Review the returned changes with the user before confirming.",
      {
        message: {
          type: "string",
          description: "Checkin comment."
        },
        paths: pathListSchema("Optional files or directories relative to UVCS_WORKSPACE to check in instead of every pending change.")
      },
      async ({ message, paths }) => {
        await assertWorkspacePolicy(config, backend);
        assertStandardMode(config);
        assertCheckinMessage(message);
        if (paths !== undefined) return await prepareScopedCheckin({ config, backend, message, paths });
        const status = await backend.pendingChanges();
        const pending = summarizePendingChanges(status.stdout);
        const changedFiles = pending.trackedCount;
        if (changedFiles === 0) {
          throw new UvcsError("Nothing to check in: the workspace has no tracked pending changes", {
            code: "NOTHING_TO_CHECKIN"
          });
        }
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
          payload: {
            message,
            statusFingerprint: pending.fingerprint,
            fileState: await fileStateFingerprint(config.workspace, trackedItems(config, status.stdout))
          },
          ttlSec: config.tokenTtlSec,
          context: config.workspace
        });
        return {
          action: "checkin",
          confirmPhrase: "confirm uvcs checkin",
          token: confirm.token,
          expiresAt: new Date(confirm.expiresAt).toISOString(),
          changedFiles,
          pendingChanges: status.stdout
        };
      },
      ["message"]
    ),
    tool(
      "uvcs_checkin_confirm",
      `Run a prepared checkin (all tracked pending changes, or the selected paths). ${CONFIRM_GUIDANCE}`,
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
        const payload = consumeConfirmToken({ token, action: "checkin", context: config.workspace });
        if (payload.paths) {
          const plan = planScopedCheckin({
            statusText: (await backend.pendingChanges()).stdout,
            workspace: config.workspace,
            paths: payload.requestedPaths
          });
          if (plan.fingerprint !== payload.statusFingerprint || plan.paths.join("\n") !== payload.paths.join("\n")) {
            throw workspaceChangedError("pending changes under the selected paths changed after checkin preparation");
          }
          if (await fileStateFingerprint(config.workspace, [...plan.items, ...plan.dependencies]) !== payload.fileState) {
            throw workspaceChangedError("files under the selected paths were edited after checkin preparation");
          }
          return await backend.checkin(payload.message, payload.paths, { dependencies: payload.dependencies });
        }
        const status = await backend.pendingChanges();
        const pending = summarizePendingChanges(status.stdout);
        const changedFiles = pending.trackedCount;
        if (pending.fingerprint !== payload.statusFingerprint) {
          throw workspaceChangedError("pending changes changed after checkin preparation");
        }
        if (await fileStateFingerprint(config.workspace, trackedItems(config, status.stdout)) !== payload.fileState) {
          throw workspaceChangedError("pending files were edited after checkin preparation");
        }
        if (changedFiles > config.checkinMaxFiles) {
          throw new UvcsError(`Refusing checkin: ${changedFiles} files exceed UVCS_CHECKIN_MAX_FILES=${config.checkinMaxFiles}`, {
            code: "CHECKIN_TOO_LARGE",
            details: { changedFiles, maxFiles: config.checkinMaxFiles }
          });
        }
        return await backend.checkin(payload.message);
      },
      ["token", "confirmPhrase"],
      confirmAnnotations(false)
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

const MAX_PATHS = 200;

function pathListSchema(description) {
  return {
    type: "array",
    items: { type: "string" },
    minItems: 1,
    maxItems: MAX_PATHS,
    description
  };
}

// cm merge --nointeractiveresolution leaves conflicting items unmerged and the
// merge in progress, which blocks every later checkin, so conflicts are refused.
async function assertMergeable(backend, sourceSpec) {
  const preview = await mergePreview({ backend, source: sourceSpec });
  if (preview.alreadyMerged) {
    throw new UvcsError(`${sourceSpec} is already merged into this workspace branch`, { code: "NOTHING_TO_MERGE" });
  }
  if (preview.conflictCount > 0) {
    throw new UvcsError(`Merging ${sourceSpec} has ${preview.conflictCount} conflict(s); resolve this merge in the UVCS client`, {
      code: "MERGE_HAS_CONFLICTS",
      details: { conflicts: preview.conflicts }
    });
  }
  return preview;
}

function trackedItems(config, statusText) {
  return pendingItems(statusText, config.workspace).filter((item) => item.tracked);
}

async function prepareScopedCheckin({ config, backend, message, paths }) {
  const safePaths = paths.map((item) => assertRelativeWorkspacePath(config, item));
  const status = await backend.pendingChanges();
  const plan = planScopedCheckin({ statusText: status.stdout, workspace: config.workspace, paths: safePaths });
  const changedFiles = plan.items.length + plan.dependencies.length;
  if (changedFiles > config.checkinMaxFiles) {
    throw new UvcsError(`Refusing checkin prepare: ${changedFiles} files exceed UVCS_CHECKIN_MAX_FILES=${config.checkinMaxFiles}`, {
      code: "CHECKIN_TOO_LARGE",
      details: { changedFiles, maxFiles: config.checkinMaxFiles }
    });
  }
  const confirm = createConfirmToken({
    action: "checkin",
    payload: {
      message,
      paths: plan.paths,
      requestedPaths: safePaths,
      dependencies: plan.dependencies.length > 0,
      statusFingerprint: plan.fingerprint,
      fileState: await fileStateFingerprint(config.workspace, [...plan.items, ...plan.dependencies])
    },
    ttlSec: config.tokenTtlSec,
    context: config.workspace
  });
  return {
    action: "checkin",
    confirmPhrase: "confirm uvcs checkin",
    token: confirm.token,
    expiresAt: new Date(confirm.expiresAt).toISOString(),
    scope: "paths",
    paths: plan.paths,
    autoIncludedMeta: plan.autoIncludedMeta,
    changedFiles,
    changes: plan.items,
    dependencies: plan.dependencies,
    unityMetaWarnings: plan.unityMetaWarnings,
    otherPendingChangesLeft: summarizePendingChanges(status.stdout).trackedCount - plan.items.length - plan.trackedDependencyCount
  };
}

const CONFIRM_GUIDANCE = "Call only after the user has reviewed the prepared payload and explicitly approved this exact operation.";

function tool(name, description, properties, handler, required = [], annotations = READ_ONLY) {
  return {
    name,
    description,
    inputSchema: {
      type: "object",
      properties,
      required,
      additionalProperties: false
    },
    annotations,
    handler
  };
}

function confirmAnnotations(destructive) {
  return { readOnlyHint: false, destructiveHint: destructive, idempotentHint: false };
}

function prepareConfirmTool({ config, backend, name, description, destructive, properties, required, action, confirmPhrase, prepare, revalidate, confirm }) {
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
          ttlSec: config.tokenTtlSec,
          context: config.workspace
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
      `${description} Confirms and executes a prepared operation. ${CONFIRM_GUIDANCE}`,
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
        const payload = consumeConfirmToken({ token, action, context: config.workspace });
        if (revalidate) await revalidate(payload);
        return await confirm(payload);
      },
      ["token", "confirmPhrase"],
      confirmAnnotations(destructive)
    )
  ];
}

async function assertWorkspacePolicy(config, backend) {
  assertWorkspaceAllowed(config);
  if (!config.allowedRepos || config.allowedRepos.length === 0) return;
  assertRepoAllowed(config, await backend.workspaceInfo());
}

function workspaceChangedError(reason) {
  return new UvcsError("Workspace changed after prepare; run prepare again before confirming", {
    code: "WORKSPACE_CHANGED_SINCE_PREPARE",
    details: { reason }
  });
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

// Names never start with "-" so cm cannot parse them as options.
function assertBranchSpec(branch) {
  const safeSegment = "[A-Za-z0-9._][A-Za-z0-9._-]*(?: [A-Za-z0-9._-]+)*";
  const safeBranchPath = new RegExp(`^/?${safeSegment}(?:/${safeSegment})*$`);
  const hasDotSegment = typeof branch === "string" && branch.split("/").some((segment) => segment === "." || segment === "..");
  if (typeof branch !== "string" || !safeBranchPath.test(branch) || hasDotSegment) {
    throw new UvcsError("Branch must be a safe branch path such as /main, /main/task-name, or /release-version project-name", {
      code: "INVALID_BRANCH_SPEC",
      details: { branch }
    });
  }
}

function assertLabelName(label) {
  if (typeof label !== "string" || !/^[A-Za-z0-9._][A-Za-z0-9._-]*$/.test(label)) {
    throw new UvcsError("Label must contain only letters, numbers, dot, underscore, or dash, and cannot start with a dash", {
      code: "INVALID_LABEL_NAME",
      details: { label }
    });
  }
}

function assertLabelSpec(labelSpec) {
  if (typeof labelSpec !== "string" || !/^lb:[A-Za-z0-9._][A-Za-z0-9._-]*$/.test(labelSpec)) {
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
  if (/^cs:\d+$/.test(target) || /^lb:[A-Za-z0-9._][A-Za-z0-9._-]*$/.test(target)) return;
  assertBranchSpec(target);
}
