import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { UvcsError } from "../backend/errors.js";

const locks = new Map();
const DEFAULT_STALE_MS = 2 * 60_000;
const DEFAULT_HEARTBEAT_MS = 15_000;
const CLEANUP_MARKER_STALE_MS = 30_000;

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
  const staleMs = options.staleMs ?? DEFAULT_STALE_MS;
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const deadline = Date.now() + waitMs;

  while (true) {
    try {
      if (await pathExists(cleanupPath)) {
        if (await removeAbandonedCleanupMarker(cleanupPath)) continue;
        if (Date.now() >= deadline) throw writeLockedError(workspace, lockPath, waitMs);
        await delay(100);
        continue;
      }
      const handle = await fs.open(lockPath, "wx");
      await handle.writeFile(JSON.stringify({
        pid: process.pid,
        hostname: os.hostname(),
        token,
        createdAt: new Date().toISOString()
      }), "utf8");
      await handle.close();
      // Keep the lock fresh while a long cm operation runs so other processes
      // never mistake it for a stale lock.
      const heartbeat = setInterval(() => {
        const now = new Date();
        fs.utimes(lockPath, now, now).catch(() => {});
      }, heartbeatMs);
      heartbeat.unref();
      return {
        path: lockPath,
        release: async () => {
          clearInterval(heartbeat);
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
    const fresh = Date.now() - stat.mtimeMs <= staleMs;
    if (fresh && !(await lockOwnerIsGone(lockPath))) return false;
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

// A lock written on this host by a process that no longer exists is stale
// immediately; locks from other hosts (shared drives) rely on the mtime only.
async function lockOwnerIsGone(lockPath) {
  try {
    const record = JSON.parse(await fs.readFile(lockPath, "utf8"));
    if (record.hostname !== os.hostname() || !Number.isInteger(record.pid)) return false;
    if (record.pid === process.pid) return false;
    process.kill(record.pid, 0);
    return false;
  } catch (error) {
    return error?.code === "ESRCH";
  }
}

async function removeAbandonedCleanupMarker(cleanupPath) {
  try {
    const stat = await fs.stat(cleanupPath);
    if (Date.now() - stat.mtimeMs <= CLEANUP_MARKER_STALE_MS) return false;
    await removeCleanupMarker(cleanupPath);
    return true;
  } catch (error) {
    if (error?.code === "ENOENT") return true;
    throw error;
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
