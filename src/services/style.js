import fs from "node:fs/promises";
import path from "node:path";
import { UvcsError } from "../backend/errors.js";

export const DEFAULT_STYLE = {
  version: 1,
  release: {
    baseBranch: "/main",
    branchPattern: "{baseBranch}/release/v{version}",
    labelPattern: "v{version}",
    branchCommentPattern: "Release {version}",
    labelCommentPattern: "Release {version}",
    checkinMessagePattern: "release: prepare v{version}",
    versionFile: "package.json"
  },
  branches: {
    allowedTypes: ["feature", "fix", "release", "hotfix", "refactor", "docs", "test", "chore"],
    branchPattern: "{baseBranch}/{type}/{slug}",
    slugMaxLength: 60
  },
  checkins: {
    allowedTypes: ["feat", "fix", "refactor", "docs", "test", "chore", "release"],
    messagePattern: "{type}: {summary}",
    summaryMaxLength: 120
  }
};

export async function styleSetupGuide(workspace) {
  const loaded = await loadStyleConfig(workspace);
  const configured = loaded.source === "workspace";
  return {
    configured,
    source: loaded.source,
    path: loaded.path,
    style: loaded.style,
    recommendedNextStep: configured
      ? "Use uvcs_name_preview before creating branches or checkins."
      : "Ask the user whether to create workspace style rules, then call uvcs_style_init_prepare if they agree.",
    suggestedQuestion: configured
      ? null
      : "I do not see workspace style rules yet. Should I create .uvcs-mcp/style.json with branch naming, checkin message, and release conventions for this project?",
    setupTool: configured ? null : "uvcs_style_init_prepare",
    presets: ["unity", "conventional", "minimal"]
  };
}

export async function createStyleInitPlan({ workspace, preset = "unity", baseBranch, branchPrefix, versionFile, overwrite = false }) {
  const loaded = await loadStyleConfig(workspace);
  if (loaded.source === "workspace" && !overwrite) {
    throw new UvcsError("Workspace style rules already exist. Pass overwrite=true to replace them.", {
      code: "STYLE_CONFIG_EXISTS",
      details: { path: loaded.path }
    });
  }

  const style = createStylePreset({
    preset,
    baseBranch,
    branchPrefix,
    versionFile
  });
  const primaryBranchType = style.branches.allowedTypes[0];
  const secondaryBranchType = style.branches.allowedTypes.includes("fix") ? "fix" : primaryBranchType;
  const primaryCheckinType = style.checkins.allowedTypes[0];

  return {
    path: loaded.path,
    overwrite,
    style,
    preview: {
      primaryBranch: previewBranchName({ style, type: primaryBranchType, title: "Add Inventory UI" }),
      fixBranch: previewBranchName({ style, type: secondaryBranchType, title: "Repair Save Flow" }),
      checkinMessage: previewCheckinMessage({ style, type: primaryCheckinType, summary: "add inventory UI" }),
      releaseBranch: renderPattern(style.release.branchPattern, {
        baseBranch: style.release.baseBranch,
        version: "1.2.3"
      }),
      releaseLabel: renderPattern(style.release.labelPattern, { version: "1.2.3" })
    },
    suggestedUserConfirmation: "These rules will be written to .uvcs-mcp/style.json and used by UVCS MCP naming tools."
  };
}

export async function writeStyleConfig({ workspace, style, overwrite }) {
  const stylePath = path.join(workspace, ".uvcs-mcp", "style.json");
  await fs.mkdir(path.dirname(stylePath), { recursive: true });
  if (!overwrite) {
    try {
      await fs.stat(stylePath);
      throw new UvcsError("Workspace style rules already exist", {
        code: "STYLE_CONFIG_EXISTS",
        details: { path: stylePath }
      });
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
  await fs.writeFile(stylePath, `${JSON.stringify(style, null, 2)}\n`, "utf8");
  return {
    path: stylePath,
    source: "workspace",
    style
  };
}

export async function loadStyleConfig(workspace) {
  const stylePath = path.join(workspace, ".uvcs-mcp", "style.json");
  try {
    const loaded = await loadStyleConfigFile(stylePath, new Set());
    return {
      path: stylePath,
      source: "workspace",
      extendsPath: loaded.extendsPath,
      style: loaded.style
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        path: stylePath,
        source: "default",
        style: DEFAULT_STYLE
      };
    }
    throw error;
  }
}

async function loadStyleConfigFile(stylePath, seen) {
  const normalizedPath = path.resolve(stylePath);
  if (seen.has(normalizedPath)) {
    throw new UvcsError("Style config extends cycle detected", {
      code: "INVALID_STYLE_CONFIG",
      details: { path: normalizedPath }
    });
  }
  seen.add(normalizedPath);

  const parsed = await readStyleJson(normalizedPath);
  const extendsPath = parsed.extends ? resolveExtendsPath(normalizedPath, parsed.extends) : null;
  const base = extendsPath ? (await loadStyleConfigFile(extendsPath, seen)).style : DEFAULT_STYLE;
  const override = { ...parsed };
  delete override.extends;

  return {
    extendsPath,
    style: mergeStyle(base, override)
  };
}

async function readStyleJson(stylePath) {
  try {
    const text = await fs.readFile(stylePath, "utf8");
    return JSON.parse(text);
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new UvcsError("Invalid style config JSON", {
        code: "INVALID_STYLE_CONFIG",
        details: { path: stylePath, reason: error.message }
      });
    }
    throw error;
  }
}

function resolveExtendsPath(stylePath, value) {
  if (typeof value !== "string" || value.trim().length === 0 || /[\0\r\n]/.test(value)) {
    throw new UvcsError("style extends must be a non-empty JSON file path", {
      code: "INVALID_STYLE_CONFIG",
      details: { path: stylePath, extends: value }
    });
  }

  const candidate = path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(path.dirname(stylePath), value);
  if (path.extname(candidate).toLowerCase() !== ".json") {
    throw new UvcsError("style extends must point to a JSON file", {
      code: "INVALID_STYLE_CONFIG",
      details: { path: stylePath, extends: value }
    });
  }
  return candidate;
}

function createStylePreset({ preset, baseBranch, branchPrefix, versionFile }) {
  const releaseBaseBranch = normalizeBaseBranch(baseBranch ?? DEFAULT_STYLE.release.baseBranch);
  const safeBranchPrefix = normalizeBranchPrefix(branchPrefix ?? "");
  const safeVersionFile = normalizeVersionFile(versionFile ?? DEFAULT_STYLE.release.versionFile);
  const branchPattern = safeBranchPrefix
    ? "{baseBranch}/{type}/{branchPrefix}{slug}"
    : "{baseBranch}/{type}/{slug}";

  const base = {
    ...DEFAULT_STYLE,
    release: {
      ...DEFAULT_STYLE.release,
      baseBranch: releaseBaseBranch,
      versionFile: safeVersionFile
    },
    branches: {
      ...DEFAULT_STYLE.branches,
      branchPattern
    }
  };

  if (preset === "unity") {
    return {
      ...base,
      branches: {
        ...base.branches,
        branchPrefix: safeBranchPrefix
      }
    };
  }

  if (preset === "conventional") {
    return {
      ...base,
      branches: {
        ...base.branches,
        branchPrefix: safeBranchPrefix,
        allowedTypes: ["feat", "fix", "refactor", "docs", "test", "chore", "release", "hotfix"]
      },
      checkins: {
        ...base.checkins,
        allowedTypes: ["feat", "fix", "refactor", "docs", "test", "chore", "release"]
      }
    };
  }

  if (preset === "minimal") {
    return {
      ...base,
      branches: {
        ...base.branches,
        branchPrefix: safeBranchPrefix,
        allowedTypes: ["work", "fix", "release"],
        branchPattern: safeBranchPrefix ? "{baseBranch}/{branchPrefix}{slug}" : "{baseBranch}/{slug}"
      },
      checkins: {
        ...base.checkins,
        allowedTypes: ["change", "fix", "release"],
        messagePattern: "{summary}"
      }
    };
  }

  throw new UvcsError("preset must be unity, conventional, or minimal", {
    code: "INVALID_STYLE_PRESET",
    details: { preset }
  });
}

export async function createReleasePlan({ workspace, releaseType, currentVersion, releaseVersion, projectName }) {
  const loaded = await loadStyleConfig(workspace);
  const style = loaded.style;
  const explicitReleaseVersion = normalizeReleaseVersion(releaseVersion);
  const version = explicitReleaseVersion
    ? currentVersion
    : currentVersion ?? await readVersionFromWorkspace(workspace, style.release.versionFile);
  const nextVersion = explicitReleaseVersion ?? bumpVersion(version, releaseType);
  const safeProjectName = normalizeProjectName(projectName);
  const values = {
    baseBranch: style.release.baseBranch,
    version: nextVersion,
    releaseVersion: nextVersion,
    ...(version ? { currentVersion: version } : {}),
    ...(releaseType ? { releaseType } : {}),
    ...(safeProjectName ? { projectName: safeProjectName } : {})
  };

  return {
    styleSource: loaded.source,
    stylePath: loaded.path,
    releaseType,
    currentVersion: version,
    releaseVersion: nextVersion,
    nextVersion,
    projectName: safeProjectName,
    branch: renderPattern(style.release.branchPattern, values),
    label: renderPattern(style.release.labelPattern, values),
    branchComment: renderPattern(style.release.branchCommentPattern, values),
    labelComment: renderPattern(style.release.labelCommentPattern, values),
    checkinMessage: renderPattern(style.release.checkinMessagePattern, values),
    suggestedFlow: [
      "uvcs_branch_create_prepare",
      "uvcs_branch_create_confirm",
      "uvcs_switch_workspace_prepare",
      "uvcs_switch_workspace_confirm",
      "edit version files if needed",
      "uvcs_checkin_prepare",
      "uvcs_checkin_confirm",
      "uvcs_label_create_prepare",
      "uvcs_label_create_confirm"
    ]
  };
}

export function previewBranchName({ style, baseBranch, type, title }) {
  const branchType = assertAllowed(type, style.branches.allowedTypes, "branch type");
  const slug = makeSlug(title, style.branches.slugMaxLength);
  return renderPattern(style.branches.branchPattern, {
    baseBranch: baseBranch ?? style.release.baseBranch,
    type: branchType,
    branchPrefix: style.branches.branchPrefix ?? "",
    slug
  });
}

export function previewCheckinMessage({ style, type, summary }) {
  const checkinType = assertAllowed(type, style.checkins.allowedTypes, "checkin type");
  const cleanSummary = normalizeSummary(summary, style.checkins.summaryMaxLength);
  return renderPattern(style.checkins.messagePattern, {
    type: checkinType,
    summary: cleanSummary
  });
}

function mergeStyle(base, override) {
  return {
    ...base,
    ...override,
    release: { ...base.release, ...override.release },
    branches: { ...base.branches, ...override.branches },
    checkins: { ...base.checkins, ...override.checkins }
  };
}

async function readVersionFromWorkspace(workspace, versionFile) {
  const safeRelative = typeof versionFile === "string" && !path.isAbsolute(versionFile) && !versionFile.includes("..");
  if (!safeRelative) {
    throw new UvcsError("Style versionFile must be a safe relative path", { code: "INVALID_STYLE_CONFIG" });
  }

  const filePath = path.join(workspace, versionFile);
  try {
    const text = await fs.readFile(filePath, "utf8");
    if (versionFile.endsWith(".json")) {
      const parsed = JSON.parse(text);
      if (typeof parsed.version === "string") return parsed.version;
    }
    const match = text.match(/\bversion\s*[:=]\s*["']?(\d+\.\d+\.\d+)["']?/i);
    if (match) return match[1];
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }

  throw new UvcsError("currentVersion is required when no version can be read from the configured versionFile", {
    code: "VERSION_REQUIRED",
    details: { versionFile }
  });
}

function bumpVersion(version, releaseType) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version ?? "");
  if (!match) {
    throw new UvcsError("Version must use semantic version format MAJOR.MINOR.PATCH", {
      code: "INVALID_VERSION",
      details: { version }
    });
  }
  if (!releaseType) {
    throw new UvcsError("releaseType is required when releaseVersion is not provided", {
      code: "INVALID_RELEASE_TYPE"
    });
  }
  let [, major, minor, patch] = match.map(Number);
  if (releaseType === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (releaseType === "minor") {
    minor += 1;
    patch = 0;
  } else if (releaseType === "patch") {
    patch += 1;
  } else {
    throw new UvcsError("releaseType must be major, minor, or patch", {
      code: "INVALID_RELEASE_TYPE",
      details: { releaseType }
    });
  }
  return `${major}.${minor}.${patch}`;
}

function renderPattern(pattern, values) {
  return pattern.replace(/\{([A-Za-z0-9_]+)\}/g, (_, key) => {
    if (!(key in values)) {
      throw new UvcsError(`Unknown style placeholder: ${key}`, {
        code: "INVALID_STYLE_CONFIG",
        details: { pattern, key }
      });
    }
    return String(values[key]);
  });
}

function normalizeBaseBranch(value) {
  if (typeof value !== "string" || !/^\/?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(value)) {
    throw new UvcsError("baseBranch must be a safe branch path such as /main", {
      code: "INVALID_STYLE_INPUT",
      details: { baseBranch: value }
    });
  }
  return value.startsWith("/") ? value : `/${value}`;
}

function normalizeBranchPrefix(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9._-]*$/.test(value)) {
    throw new UvcsError("branchPrefix may contain only letters, numbers, dot, underscore, or dash", {
      code: "INVALID_STYLE_INPUT",
      details: { branchPrefix: value }
    });
  }
  return value;
}

function normalizeVersionFile(value) {
  const safeRelative = typeof value === "string" && value.length > 0 && !path.isAbsolute(value) && !value.includes("..");
  if (!safeRelative) {
    throw new UvcsError("versionFile must be a safe relative path", {
      code: "INVALID_STYLE_INPUT",
      details: { versionFile: value }
    });
  }
  return value;
}

function normalizeReleaseVersion(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^\d+\.\d+(?:\.\d+)?(?:[-+][A-Za-z0-9._-]+)?$/.test(value)) {
    throw new UvcsError("releaseVersion must use version format MAJOR.MINOR or MAJOR.MINOR.PATCH", {
      code: "INVALID_VERSION",
      details: { releaseVersion: value }
    });
  }
  return value;
}

function normalizeProjectName(value) {
  if (value === undefined || value === null || value === "") return undefined;
  if (typeof value !== "string" || !/^[a-z0-9]+(?:[a-z0-9_-]*[a-z0-9])?$/.test(value)) {
    throw new UvcsError("projectName may contain only lowercase latin letters, numbers, underscore, or dash", {
      code: "INVALID_STYLE_INPUT",
      details: { projectName: value }
    });
  }
  return value;
}

function assertAllowed(value, allowed, name) {
  if (typeof value !== "string" || !allowed.includes(value)) {
    throw new UvcsError(`Invalid ${name}`, {
      code: "STYLE_VALUE_NOT_ALLOWED",
      details: { value, allowed }
    });
  }
  return value;
}

function makeSlug(value, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new UvcsError("Title must be a non-empty string", { code: "INVALID_STYLE_INPUT" });
  }
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, maxLength)
    .replace(/-+$/g, "");
  if (!slug) {
    throw new UvcsError("Title cannot be converted to a safe branch slug", { code: "INVALID_STYLE_INPUT" });
  }
  return slug;
}

function normalizeSummary(value, maxLength) {
  if (typeof value !== "string" || value.trim().length === 0 || /[\r\n]/.test(value)) {
    throw new UvcsError("Summary must be a non-empty single line", { code: "INVALID_STYLE_INPUT" });
  }
  return value.trim().slice(0, maxLength);
}
