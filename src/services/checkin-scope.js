import fs from "node:fs";
import path from "node:path";
import { UvcsError } from "../backend/errors.js";
import { fingerprintItems, itemsUnderPaths, pathKey, pendingItems } from "./pending.js";

// Plans a checkin limited to the given workspace-relative paths. Unity keeps
// each asset's GUID in its .meta file, so the .meta partner of every selected
// asset (and the asset of every selected .meta) is added when it is pending,
// and an asset whose .meta is still private blocks the checkin.
export function planScopedCheckin({ statusText, workspace, paths }) {
  const allItems = pendingItems(statusText, workspace);
  const tracked = allItems.filter((item) => item.tracked);
  const byKey = new Map(allItems.map((item) => [pathKey(item.path), item]));

  const selectedPaths = uniquePaths(paths);
  if (selectedPaths.length === 0) {
    throw new UvcsError("paths must list at least one file or folder; omit paths for a full checkin", {
      code: "INVALID_PATH"
    });
  }
  for (const requested of selectedPaths) {
    if (itemsUnderPaths(tracked, [requested]).length === 0) {
      throw new UvcsError(`No tracked pending changes under ${requested}`, {
        code: "NOTHING_TO_CHECKIN",
        details: { path: requested }
      });
    }
  }

  const autoIncludedMeta = [];
  const warnings = [];
  for (;;) {
    const selected = itemsUnderPaths(tracked, selectedPaths);
    const candidates = [...selectedPaths, ...selected.flatMap((item) => [item.path, item.from].filter(Boolean))];
    const additions = [];
    for (const candidate of candidates) {
      const partner = unityPartner(candidate);
      if (!partner) continue;
      const partnerItem = byKey.get(pathKey(partner));
      if (!partnerItem?.tracked) continue;
      if (itemsUnderPaths([partnerItem], selectedPaths).length > 0) continue;
      if (additions.some((item) => pathKey(item) === pathKey(partner))) continue;
      // A folder's .meta must never widen the selection to the whole folder,
      // because cm checks in directories recursively.
      if (isDirectory(path.join(workspace, partner))) {
        if (!warnings.some((warning) => warning.path === partner)) {
          warnings.push({ path: partner, meta: `${partner}.meta`, issue: "the folder has pending changes; select it explicitly to check them in" });
        }
        continue;
      }
      additions.push(partner);
    }
    if (additions.length === 0) break;
    selectedPaths.push(...additions);
    autoIncludedMeta.push(...additions);
  }

  const items = itemsUnderPaths(tracked, selectedPaths);

  // cm refuses a path-scoped checkin when a selected item depends on a pending
  // parent directory outside the selection (for example a file moved into a
  // new, still private folder). Those parents are listed here and checked in
  // with --dependencies, which adds only the directory items themselves.
  const selectedKeys = new Set(items.map((item) => pathKey(item.path)));
  const dependencies = [];
  for (const item of items) {
    for (const itemPath of [item.path, item.from].filter(Boolean)) {
      for (const ancestor of ancestors(itemPath)) {
        const parentItem = byKey.get(pathKey(ancestor));
        if (!parentItem || selectedKeys.has(pathKey(ancestor))) continue;
        if (dependencies.some((dependency) => pathKey(dependency.path) === pathKey(ancestor))) continue;
        dependencies.push(parentItem);
      }
    }
  }

  const blockers = [];
  for (const item of items) {
    if (item.code !== "AD" || item.path.endsWith(".meta")) continue;
    const partner = unityPartner(item.path);
    if (!partner) continue;
    const partnerItem = byKey.get(pathKey(partner));
    if (partnerItem && !partnerItem.tracked) {
      blockers.push({ path: item.path, meta: partner, issue: "the .meta file is private; add it with uvcs_add before checking in" });
    } else if (!partnerItem && !fs.existsSync(path.join(workspace, partner))) {
      warnings.push({ path: item.path, meta: partner, issue: "no .meta file exists; open the project in Unity to generate it, unless Unity ignores this item" });
    }
  }
  if (blockers.length > 0) {
    throw new UvcsError("Unity assets would be checked in without their .meta files", {
      code: "UNITY_META_NOT_ADDED",
      details: { blockers }
    });
  }

  return {
    paths: selectedPaths.map(toNative),
    autoIncludedMeta,
    items: items.map(describe),
    dependencies: dependencies.map(describe),
    trackedDependencyCount: dependencies.filter((dependency) => dependency.tracked).length,
    fingerprint: fingerprintItems(statusText, [...items, ...dependencies]),
    unityMetaWarnings: warnings
  };
}

function isDirectory(fullPath) {
  try {
    return fs.statSync(fullPath).isDirectory();
  } catch {
    return false;
  }
}

function describe({ code, path: itemPath, from }) {
  return from ? { code, path: itemPath, from } : { code, path: itemPath };
}

function ancestors(itemPath) {
  const segments = String(itemPath).split("/");
  return segments.slice(0, -1).map((_, index) => segments.slice(0, index + 1).join("/"));
}

export function unityPartner(itemPath) {
  const normalized = String(itemPath).replaceAll("\\", "/").replace(/\/+$/, "");
  if (!/^Assets\/./i.test(normalized)) return null;
  return normalized.endsWith(".meta") ? normalized.slice(0, -".meta".length) : `${normalized}.meta`;
}

function uniquePaths(paths) {
  const seen = new Set();
  const result = [];
  for (const item of paths) {
    const normalized = String(item).replaceAll("\\", "/").replace(/\/+$/, "");
    if (normalized === "" || normalized === ".") {
      throw new UvcsError("Selecting the workspace root is the same as a full checkin; omit paths instead", {
        code: "INVALID_PATH",
        details: { path: item }
      });
    }
    if (seen.has(pathKey(normalized))) continue;
    seen.add(pathKey(normalized));
    result.push(normalized);
  }
  return result;
}

function toNative(itemPath) {
  return itemPath.split("/").join(path.sep);
}
