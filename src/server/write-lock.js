const locks = new Map();

export async function withWorkspaceWriteLock(workspace, action) {
  const key = workspace || process.cwd();
  const previous = locks.get(key) ?? Promise.resolve();
  let release;
  const current = new Promise((resolve) => {
    release = resolve;
  });
  const tail = previous.then(() => current, () => current);
  locks.set(key, tail);

  await previous.catch(() => {});
  try {
    return await action();
  } finally {
    release();
    if (locks.get(key) === tail) {
      locks.delete(key);
    }
  }
}
