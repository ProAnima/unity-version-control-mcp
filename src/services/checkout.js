import fs from "node:fs/promises";
import path from "node:path";
import { UvcsError } from "../backend/errors.js";
import { fingerprintItems, itemsUnderPaths, pathKey, pendingItems } from "./pending.js";

const FIELD_SEPARATOR = "\u001f";

// Checkout marks files as being edited; when the server has a lock rule for
// them (lock.conf) it also takes the exclusive lock. Only controlled files
// can be checked out, and files locked by someone else are refused up front.
export async function planCheckout({ backend, workspace, paths }) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new UvcsError("paths must list at least one file", { code: "INVALID_PATH" });
  }
  const status = await backend.pendingChanges();
  const items = pendingItems(status.stdout, workspace);
  const toCheckout = [];
  const alreadyCheckedOut = [];
  for (const itemPath of paths) {
    const stat = await fs.stat(path.join(workspace, itemPath)).catch(() => null);
    if (!stat) {
      throw new UvcsError(`${itemPath} does not exist in the workspace`, { code: "ITEM_NOT_FOUND", details: { path: itemPath } });
    }
    if (!stat.isFile()) {
      throw new UvcsError(`${itemPath} is a directory; check out individual files`, { code: "CHECKOUT_FILES_ONLY", details: { path: itemPath } });
    }
    const pending = items.find((item) => pathKey(item.path) === pathKey(itemPath));
    const privateParent = items.find((item) => !item.tracked && itemsUnderPaths([{ path: itemPath }], [item.path]).length > 0);
    if (privateParent || pending?.code === "AD") {
      throw new UvcsError(`${itemPath} is not in the repository yet, so there is nothing to check out or lock`, {
        code: "ITEM_NOT_CONTROLLED",
        details: { path: itemPath, status: (pending ?? privateParent).code }
      });
    }
    if (pending?.code === "CO") alreadyCheckedOut.push(itemPath);
    else toCheckout.push(itemPath);
  }

  const lockList = toCheckout.length > 0 ? await backend.locks({ paths: toCheckout }) : null;
  // The plain-text fallback cannot be parsed reliably; refuse rather than
  // report "no locks".
  if (lockList && lockList.format !== "machinereadable") {
    throw new UvcsError("cm lock list did not return machine-readable output, so locks cannot be checked", {
      code: "LOCK_CHECK_FAILED",
      details: { stdout: lockList.stdout, stderr: lockList.stderr }
    });
  }
  const locks = lockList ? parseLocks(lockList.stdout) : [];
  if (locks.length > 0) {
    throw new UvcsError("Some files are locked by another checkout", {
      code: "ITEM_LOCKED",
      details: { locks }
    });
  }
  if (toCheckout.length === 0) {
    throw new UvcsError("Every requested file is already checked out in this workspace", {
      code: "ALREADY_CHECKED_OUT",
      details: { paths: alreadyCheckedOut }
    });
  }

  return {
    paths: toCheckout,
    alreadyCheckedOut,
    fingerprint: fingerprintItems(status.stdout, itemsUnderPaths(items, toCheckout))
  };
}

// Releasing runs `cm undo --unchanged`: checkouts of files whose content did
// not change are undone (which releases their locks); modified files keep
// their checkout and their edits.
export async function planReleaseCheckout({ backend, workspace, paths }) {
  if (!Array.isArray(paths) || paths.length === 0) {
    throw new UvcsError("paths must list at least one file", { code: "INVALID_PATH" });
  }
  const status = await backend.pendingChanges();
  const items = pendingItems(status.stdout, workspace);
  const checkedOut = [];
  for (const itemPath of paths) {
    const pending = items.find((item) => pathKey(item.path) === pathKey(itemPath));
    if (pending?.code !== "CO") {
      throw new UvcsError(`${itemPath} is not checked out in this workspace`, {
        code: "NOT_CHECKED_OUT",
        details: { path: itemPath, status: pending?.code ?? "unchanged" }
      });
    }
    checkedOut.push(itemPath);
  }
  return {
    paths: checkedOut,
    fingerprint: fingerprintItems(status.stdout, itemsUnderPaths(items, checkedOut))
  };
}

export async function releaseResult({ backend, workspace, paths, result }) {
  const items = pendingItems((await backend.pendingChanges()).stdout, workspace);
  const stillCheckedOut = paths.filter((itemPath) => items.some((item) => item.code === "CO" && pathKey(item.path) === pathKey(itemPath)));
  return {
    ...result,
    released: paths.filter((itemPath) => !stillCheckedOut.includes(itemPath)),
    stillCheckedOut,
    ...(stillCheckedOut.length > 0
      ? { note: "Files with changed content stay checked out (and locked). Check them in, or undo them with uvcs_undo to discard the edits." }
      : {})
  };
}

export function parseLocks(stdout) {
  return String(stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes(FIELD_SEPARATOR))
    .map((line) => {
      const [itemId, owner, workspaceName, ...pathParts] = line.split(FIELD_SEPARATOR);
      return { itemId, owner, workspace: workspaceName, path: pathParts.join(FIELD_SEPARATOR) };
    });
}
