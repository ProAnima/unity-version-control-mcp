import fs from "node:fs/promises";
import path from "node:path";

export async function unityMetaDiagnostics(workspace) {
  const roots = ["Assets", "Packages"];
  const findings = [];

  for (const root of roots) {
    const absoluteRoot = path.join(workspace, root);
    if (!(await exists(absoluteRoot))) continue;
    await scanUnityTree(absoluteRoot, findings, workspace);
  }

  return {
    workspace,
    findings,
    summary: {
      missingMeta: findings.filter((item) => item.type === "missing-meta").length,
      orphanMeta: findings.filter((item) => item.type === "orphan-meta").length
    }
  };
}

async function scanUnityTree(directory, findings, workspace) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const names = new Set(entries.map((entry) => entry.name));

  for (const entry of entries) {
    const absolute = path.join(directory, entry.name);
    const relative = path.relative(workspace, absolute);

    if (entry.isDirectory()) {
      if (shouldSkipUnityDir(entry.name)) continue;
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

function shouldSkipUnityDir(name) {
  return new Set(["Library", "Temp", "Obj", "Logs", "Build", "Builds", ".git", ".plastic", "node_modules"]).has(name);
}

function normalizeSlash(value) {
  return value.replaceAll(path.sep, "/");
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}
