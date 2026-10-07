import crypto from "node:crypto";

const FIELD_SEPARATOR = "\u001f";
// Header rows and items that `cm checkin --applychanged`, switch, and merge do
// not act on. Private and ignored items stay visible in raw status output.
const HEADER_STATUSES = new Set(["STATUS", "STAGE"]);
const UNTRACKED_STATUSES = new Set(["PR", "IG"]);

export function summarizePendingChanges(statusText) {
  const lines = statusLines(statusText);
  const header = lines.filter((line) => HEADER_STATUSES.has(statusCode(line)));
  const tracked = [];
  let untracked = 0;
  for (const line of lines) {
    const code = statusCode(line);
    if (HEADER_STATUSES.has(code)) continue;
    if (UNTRACKED_STATUSES.has(code)) {
      untracked += 1;
      continue;
    }
    tracked.push(line);
  }

  return {
    trackedCount: tracked.length,
    untrackedCount: untracked,
    fingerprint: crypto
      .createHash("sha256")
      .update([...header, ...tracked].join("\n"), "utf8")
      .digest("hex")
  };
}

export function countTrackedChanges(statusText) {
  return summarizePendingChanges(statusText).trackedCount;
}

export function fingerprintPendingChanges(statusText) {
  return summarizePendingChanges(statusText).fingerprint;
}

function statusLines(statusText) {
  return String(statusText ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith("Total:"));
}

function statusCode(line) {
  const separator = line.indexOf(FIELD_SEPARATOR);
  return separator === -1 ? "" : line.slice(0, separator);
}
