import fs from "node:fs/promises";

export async function auditToolCall(config, event) {
  if (!config.auditLogPath) return;

  const entry = {
    ts: new Date().toISOString(),
    ...event
  };
  await fs.appendFile(config.auditLogPath, `${JSON.stringify(entry)}\n`, "utf8");
}
