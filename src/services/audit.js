import fs from "node:fs/promises";
import path from "node:path";

export async function auditToolCall(config, event) {
  if (!config.auditLogPath) return;

  const entry = {
    ts: new Date().toISOString(),
    ...event
  };
  await fs.mkdir(path.dirname(config.auditLogPath), { recursive: true });
  await fs.appendFile(config.auditLogPath, `${JSON.stringify(entry)}\n`, "utf8");
}
