import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { UvcsError } from "../backend/errors.js";

const locks = new Map();

export async function withWorkspaceWriteLock(workspace, action, options = {}) {
  const key = workspace || process.cwd();
  const previous = locks.get(key) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current, () => current);
  locks.set(key, tail);

  await previous.catch(() => {});
  let fileLock;
  try {
    fileLock = await acquireFileLock(workspace, options);
    return await action();
  } finally {
    try {
      await fileLock?.release();
    } finally {
      release();
      if (locks.get(key) === tail) {
        locks.delete(key);
      }
    }
  }
}

async function acquireFileLock(workspace, options) {
  if (!workspace || !path.isAbsolute(workspace)) return null;

  const plasticDir = path.join(workspace, ".plastic");
  try {
    if (!(await fs.stat(plasticDir)).isDirectory()) return null;
  } catch {
    return null;
  }

  const lockPath = path.join(plasticDir, "uvcs-mcp.write.lock");
  const cleanupPath = `${lockPath}.cleanup`;
  const token = crypto.randomUUID();
  const waitMs = options.waitMs ?? 10_000;
  const staleMs = options.staleMs ?? 15 * 60_000;
  const deadline = Date.now() + waitMs;

  while (true) {
    try {
      if (await pathExists(cleanupPath)) {
        if (Date.now() >= deadline) throw writeLockedError(workspace, lockPath, waitMs);
        await delay(100);
        continue;
      }
      const handle = await fs.open(lockPath, "wx");
      await handle.writeFile(JSON.stringify({
        pid: process.pid,
        token,
        createdAt: new Date().toISOString()
      }), "utf8");
      await handle.close();
      return {
        path: lockPath,
        release: async () => {
          try {
            const record = JSON.parse(await fs.readFile(lockPath, "utf8"));
            if (record.token === token) await fs.unlink(lockPath);
          } catch (error) {
            if (error?.code !== "ENOENT") throw error;
          }
        }
      };
    } catch (error) {
      if (error?.code !== "EEXIST") throw error;
      if (await removeStaleLock(lockPath, cleanupPath, staleMs)) continue;
      if (Date.now() >= deadline) {
        throw writeLockedError(workspace, lockPath, waitMs);
      }
      await delay(100);
    }
  }
}

async function removeStaleLock(lockPath, cleanupPath, staleMs) {
  let cleanupHandle;
  try {
    cleanupHandle = await fs.open(cleanupPath, "wx");
    const stat = await fs.stat(lockPath);
    if (Date.now() - stat.mtimeMs <= staleMs) return false;
    await fs.unlink(lockPath);
    return true;
  } catch (error) {
    if (error?.code === "EEXIST") return false;
    if (error?.code === "ENOENT") return true;
    throw error;
  } finally {
    await cleanupHandle?.close();
    if (cleanupHandle) await removeCleanupMarker(cleanupPath);
  }
}

async function removeCleanupMarker(cleanupPath) {
  try {
    await fs.unlink(cleanupPath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

function writeLockedError(workspace, lockPath, waitMs) {
  return new UvcsError("Another UVCS MCP process is writing to this workspace", {
    code: "WORKSPACE_WRITE_LOCKED",
    details: { workspace, lockPath, waitMs }
  });
}

function delay(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
