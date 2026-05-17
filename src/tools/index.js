import {
  assertRelativeWorkspacePath,
  assertStandardMode,
  assertWorkspaceAllowed,
  consumeConfirmToken,
  createConfirmToken
} from "../policy/policy.js";
import { runDoctorService } from "../services/doctor.js";
import { unityMetaDiagnostics } from "../services/unity-meta.js";
import { UvcsError } from "../backend/errors.js";

export function createTools({ config, backend }) {
  const definitions = [
    tool("uvcs_doctor", "Check cm, workspace, and UVCS MCP configuration.", {}, async () => runDoctorService(config, backend)),
    tool("uvcs_workspace_status", "Return concise workspace status.", {}, async () => {
      assertWorkspaceAllowed(config);
      return await backend.status();
    }),
    tool("uvcs_pending_changes", "Return full pending changes from cm status.", {}, async () => {
      assertWorkspaceAllowed(config);
      return await backend.pendingChanges();
    }),
    tool("uvcs_branch_info", "Return current branch information.", {}, async () => {
      assertWorkspaceAllowed(config);
      return await backend.branchInfo();
    }),
    tool("uvcs_locks", "List workspace/server locks visible to cm.", {}, async () => {
      assertWorkspaceAllowed(config);
      return await backend.locks();
    }),
    tool("uvcs_unity_meta_diagnostics", "Detect common Unity asset/.meta mismatches in the workspace.", {}, async () => {
      assertWorkspaceAllowed(config);
      return await unityMetaDiagnostics(config.workspace);
    }),
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
        assertWorkspaceAllowed(config);
        const safePath = assertRelativeWorkspacePath(config, filePath);
        return await backend.diffFile(safePath);
      },
      ["filePath"]
    ),
    tool("uvcs_update_workspace", "Update the workspace. Requires standard mode.", {}, async () => {
      assertWorkspaceAllowed(config);
      assertStandardMode(config);
      return await backend.update();
    }),
    ...prepareConfirmTool({
      config,
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
        assertWorkspaceAllowed(config);
        assertStandardMode(config);
        const safePath = assertRelativeWorkspacePath(config, itemPath);
        return { itemPath: safePath };
      },
      confirm: async (payload) => await backend.add(payload.itemPath)
    }),
    ...prepareConfirmTool({
      config,
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
        assertWorkspaceAllowed(config);
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
        assertWorkspaceAllowed(config);
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
        assertWorkspaceAllowed(config);
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
        assertWorkspaceAllowed(config);
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
        assertWorkspaceAllowed(config);
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
        assertWorkspaceAllowed(config);
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
    list: () => definitions.map(({ handler, ...definition }) => definition),
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

function prepareConfirmTool({ config, name, description, properties, required, action, confirmPhrase, prepare, confirm }) {
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
        assertWorkspaceAllowed(config);
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
