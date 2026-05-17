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

export async function loadStyleConfig(workspace) {
  const stylePath = path.join(workspace, ".uvcs-mcp", "style.json");
  try {
    const text = await fs.readFile(stylePath, "utf8");
    const parsed = JSON.parse(text);
    return {
      path: stylePath,
      source: "workspace",
      style: mergeStyle(DEFAULT_STYLE, parsed)
    };
  } catch (error) {
    if (error?.code === "ENOENT") {
      return {
        path: stylePath,
        source: "default",
        style: DEFAULT_STYLE
      };
    }
    if (error instanceof SyntaxError) {
      throw new UvcsError("Invalid .uvcs-mcp/style.json", {
        code: "INVALID_STYLE_CONFIG",
        details: { path: stylePath, reason: error.message }
      });
    }
    throw error;
  }
}

export async function createReleasePlan({ workspace, releaseType, currentVersion }) {
  const loaded = await loadStyleConfig(workspace);
  const style = loaded.style;
  const version = currentVersion ?? await readVersionFromWorkspace(workspace, style.release.versionFile);
  const nextVersion = bumpVersion(version, releaseType);
  const values = {
    baseBranch: style.release.baseBranch,
    version: nextVersion,
    currentVersion: version,
    releaseType
  };

  return {
    styleSource: loaded.source,
    stylePath: loaded.path,
    releaseType,
    currentVersion: version,
    nextVersion,
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
