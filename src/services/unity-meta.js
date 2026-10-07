import fs from "node:fs/promises";
import path from "node:path";

const MAX_FINDINGS = 500;
const SKIPPED_DIRECTORIES = new Set(["Library", "Temp", "Obj", "Logs", "Build", "Builds", "node_modules"]);

export async function unityMetaDiagnostics(workspace, { maxFindings = MAX_FINDINGS } = {}) {
  const findings = [];

  const assets = path.join(workspace, "Assets");
  if (await isDirectory(assets)) {
    await scanUnityTree(assets, findings, workspace);
  }

  // Packages/ itself holds manifest.json and packages-lock.json without .meta
  // files; only the contents of embedded package folders are imported assets.
  const packages = path.join(workspace, "Packages");
  if (await isDirectory(packages)) {
    for (const entry of await fs.readdir(packages, { withFileTypes: true })) {
      if (entry.isDirectory() && !isIgnoredByUnity(entry.name)) {
        await scanUnityTree(path.join(packages, entry.name), findings, workspace);
      }
    }
  }

  return {
    workspace,
    findings: findings.slice(0, maxFindings),
    truncated: findings.length > maxFindings,
    summary: {
      missingMeta: findings.filter((item) => item.type === "missing-meta").length,
      orphanMeta: findings.filter((item) => item.type === "orphan-meta").length
    }
  };
}

async function scanUnityTree(directory, findings, workspace) {
  const entries = (await fs.readdir(directory, { withFileTypes: true }))
    .filter((entry) => !isIgnoredByUnity(entry.name));
  const names = new Set(entries.map((entry) => entry.name));

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(workspace, absolute);

    if (entry.isDirectory()) {
      if (SKIPPED_DIRECTORIES.has(entry.name)) continue;
      if (!names.has(`${entry.name}.meta`)) {
        findings.push({
          type: "missing-meta",
          path: normalizeSlash(relative),
          expected: normalizeSlash(`${relative}.meta`)
        });
      }
      await scanUnityTree(absolute, findings, workspace);
      continue;
    }

    if (!entry.isFile()) continue;

    if (entry.name.endsWith(".meta")) {
      const assetName = entry.name.slice(0, -5);
      if (!names.has(assetName)) {
        findings.push({
          type: "orphan-meta",
          path: normalizeSlash(relative),
          expectedAsset: normalizeSlash(path.relative(workspace, path.join(directory, assetName)))
        });
      }
      continue;
    }

    if (!names.has(`${entry.name}.meta`)) {
      findings.push({
        type: "missing-meta",
        path: normalizeSlash(relative),
        expected: normalizeSlash(`${relative}.meta`)
      });
    }
  }
}

// Unity skips hidden items, names ending with "~", "cvs" folders, and *.tmp
// files during import, so they never get .meta files.
function isIgnoredByUnity(name) {
  return name.startsWith(".")
    || name.endsWith("~")
    || name.toLowerCase() === "cvs"
    || name.toLowerCase().endsWith(".tmp");
}

function normalizeSlash(value) {
  return value.replaceAll(path.sep, "/");
}

async function isDirectory(filePath) {
  try {
    return (await fs.stat(filePath)).isDirectory();
  } catch {
    return false;
  }
}
