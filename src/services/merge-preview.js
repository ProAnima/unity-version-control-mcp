import { normalizeBranch, normalizeObjectSpec } from "./history.js";

const FIELD = "\u001f";

// `cm merge <source> --machinereadable` without --merge only reports what the
// merge would do. Known record shapes (cm 10.0.16+):
//   STATUS      <code> <message>             e.g. ALREADY_CONNECTED, No merges detected
//   FILE_SRC    <path> <base> <source> <id>  changed only on source: taken as is
//   FILE_CONFLICT <path> <base> <source> <destination> <id>  changed on both sides
//   APPLY       <ADD|DELETE|MOVE|CHANGE> <path>
//   DIS_OP_WARN <operation> <path>           discarded: same content on both sides
//   *CONFLICT*  ...                          needs resolution in the UVCS client
export async function mergePreview({ backend, source, destination, maxItems = 300 }) {
  const sourceSpec = normalizeObjectSpec(source, "source");
  const destinationSpec = destination ? `br:${normalizeBranch(destination, "destination")}` : undefined;
  const limit = Math.min(Math.max(Number.isInteger(maxItems) ? maxItems : 300, 1), 5_000);
  const result = await backend.mergePreview({ source: sourceSpec, destination: destinationSpec });
  const records = parseMergePreview(result.stdout);

  const byType = {};
  for (const record of records) byType[record.type] = (byType[record.type] ?? 0) + 1;
  const conflicts = records.filter((record) => /CONFLICT/i.test(record.type));
  const status = records.find((record) => record.type === "STATUS");
  const changes = records.filter((record) => record.type !== "STATUS" && !/CONFLICT/i.test(record.type));
  const alreadyMerged = status?.code === "ALREADY_CONNECTED";

  return {
    mode: "read-only",
    source: sourceSpec,
    destination: destinationSpec ?? "workspace",
    ...(status ? { status: { code: status.code, message: status.message } } : {}),
    alreadyMerged,
    conflictCount: conflicts.length,
    changeCount: changes.length,
    byType,
    conflicts: conflicts.slice(0, limit),
    changes: changes.slice(0, limit),
    truncated: conflicts.length > limit || changes.length > limit,
    ...(records.length === 0 && result.stdout ? { output: result.stdout } : {}),
    recommendation: mergeRecommendation({ alreadyMerged, conflicts: conflicts.length, changes: changes.length, destinationSpec })
  };
}

export function parseMergePreview(stdout) {
  return String(stdout ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.includes(FIELD))
    .map((line) => {
      const [type, ...fields] = line.split(FIELD);
      switch (type) {
        case "STATUS":
          return { type, code: fields[0], message: fields.slice(1).join(" ") };
        case "FILE_SRC":
          return { type, path: fields[0], baseChangeset: fields[1], sourceChangeset: fields[2], itemId: fields[3] };
        case "FILE_CONFLICT":
          return {
            type,
            path: fields[0],
            baseChangeset: fields[1],
            sourceChangeset: fields[2],
            destinationChangeset: fields[3],
            itemId: fields[4]
          };
        case "APPLY":
        case "DIS_OP_WARN":
          return { type, operation: fields[0], path: fields.slice(1).join(FIELD) };
        default:
          return { type, fields };
      }
    });
}

function mergeRecommendation({ alreadyMerged, conflicts, changes, destinationSpec }) {
  if (alreadyMerged) return "Nothing to merge: the source is already merged into the destination.";
  if (conflicts > 0) {
    return "The merge has conflicts. Resolve them in the UVCS client (uvcs_merge runs with --nointeractiveresolution and cannot resolve conflicts).";
  }
  if (changes === 0) return "No changes were reported. Verify the source spec before merging.";
  if (destinationSpec) {
    return "No conflicts were reported. uvcs_merge merges into the workspace, so switch the workspace to the destination branch before preparing it.";
  }
  return "No conflicts were reported. Review the changes, then use uvcs_merge_prepare / uvcs_merge_confirm with explicit user approval.";
}
