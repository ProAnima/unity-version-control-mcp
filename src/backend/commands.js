export const MACHINE_READABLE_FLAGS = [
  "--machinereadable",
  "--fieldseparator=\u001f"
];

// Locale-independent dates for find, annotate, and diff output.
export const ISO_DATE_FORMAT = "yyyy-MM-ddTHH:mm:ss";

export const CM_COMMANDS = {
  showCommands: {
    args: ["showcommands"],
    requireWorkspace: false,
    mutation: false
  },
  version: {
    args: ["version"],
    requireWorkspace: false,
    mutation: false,
    allowFailure: true
  },
  apiHelp: {
    args: ["api", "--help"],
    requireWorkspace: false,
    mutation: false,
    allowFailure: true
  },
  statusShort: {
    args: ["status", "--short"],
    requireWorkspace: true,
    mutation: false
  },
  statusText: {
    args: ["status"],
    requireWorkspace: true,
    mutation: false
  },
  statusHeader: {
    args: ["status", "--header", "--nochanges"],
    requireWorkspace: true,
    mutation: false
  },
  // Reads local workspace metadata only, so it works while the server is unreachable.
  workspaceSelector: {
    args: ["wi", "--machinereadable"],
    requireWorkspace: true,
    mutation: false
  },
  statusMachine: {
    args: ["status", ...MACHINE_READABLE_FLAGS],
    requireWorkspace: true,
    mutation: false
  },
  statusMachineWithRevisionId: {
    args: ["status", "--includeRevId", ...MACHINE_READABLE_FLAGS],
    requireWorkspace: true,
    mutation: false,
    allowFailure: true
  },
  updateMachine: {
    args: ["update", "--noinput", ...MACHINE_READABLE_FLAGS],
    requireWorkspace: true,
    mutation: true
  }
};

export function findChangesetsCommand({ query, format }) {
  const args = ["find", "changeset", query, `--format=${format}`, "--nototal"];
  return {
    args,
    requireWorkspace: true,
    mutation: false
  };
}

export function findBranchesCommand({ query, format, isoDates = false }) {
  const args = ["find", "branch", query, `--format=${format}`];
  if (isoDates) args.push(`--dateformat=${ISO_DATE_FORMAT}`);
  args.push("--nototal");
  return {
    args,
    requireWorkspace: true,
    mutation: false
  };
}

export function findLabelsCommand({ query, format }) {
  return {
    args: ["find", "label", query, `--format=${format}`, `--dateformat=${ISO_DATE_FORMAT}`, "--nototal"],
    requireWorkspace: true,
    mutation: false
  };
}

// Without a path argument cm prints the changed items instead of opening the
// Diff window, so this command never takes an item path.
export function treeDiffCommand({ source, destination, format }) {
  const args = ["diff", source];
  if (destination) args.push(destination);
  args.push(`--format=${format}`, "--repositorypaths");
  return {
    args,
    requireWorkspace: true,
    mutation: false
  };
}

export function historyCommand({ filePath, format }) {
  return {
    args: ["history", filePath, `--format=${format}`],
    requireWorkspace: true,
    mutation: false
  };
}

export function annotateCommand({ spec, format }) {
  return {
    args: ["annotate", spec, `--format=${format}`, `--dateformat=${ISO_DATE_FORMAT}`],
    requireWorkspace: true,
    mutation: false
  };
}

export function catCommand(revisionSpec) {
  return {
    args: ["cat", revisionSpec],
    requireWorkspace: true,
    mutation: false,
    // A missing revision (an added or deleted file) is reported, not thrown.
    allowFailure: true,
    trimOutput: false,
    // File bytes, not console text: UVCS_CM_OUTPUT_ENCODING does not apply.
    outputEncoding: "auto"
  };
}

// Without --merge, cm only reports what a merge would do.
export function mergePreviewCommand({ source, destination }) {
  const args = ["merge", source];
  if (destination) args.push(`--to=${destination}`);
  args.push(...MACHINE_READABLE_FLAGS);
  return {
    args,
    requireWorkspace: true,
    mutation: false
  };
}

// Without paths cm checks in every tracked pending change. With paths it
// checks in only those items (recursively for directories); --all adds items
// deleted or moved locally below them and --applychanged picks up changed
// files that are not checked out.
export function checkinCommand(message, paths = [], { dependencies = false } = {}) {
  const args = ["checkin", ...paths, `-c=${message}`];
  if (paths.length > 0) args.push("--all");
  if (dependencies) args.push("--dependencies");
  args.push("--applychanged", ...MACHINE_READABLE_FLAGS);
  return {
    args,
    requireWorkspace: true,
    mutation: true
  };
}

// With a lock rule on the server (lock.conf), checkout takes the exclusive lock.
export function checkoutCommand(paths) {
  return {
    args: ["checkout", ...paths, ...MACHINE_READABLE_FLAGS],
    requireWorkspace: true,
    mutation: true
  };
}

// --unchanged undoes only checkouts whose content did not change, so the lock
// is released without losing edits; modified files stay checked out.
export function releaseCheckoutCommand(paths) {
  return {
    args: ["undo", ...paths, "--unchanged", ...MACHINE_READABLE_FLAGS],
    requireWorkspace: true,
    mutation: true
  };
}

export function lockListCommand({ paths = [], scope = "all", machineReadable = true } = {}) {
  const args = ["lock", "list", ...paths];
  if (scope === "user") args.push("--onlycurrentuser");
  if (scope === "workspace") args.push("--onlycurrentworkspace");
  if (machineReadable) args.push(...MACHINE_READABLE_FLAGS);
  return {
    args,
    requireWorkspace: true,
    mutation: false,
    allowFailure: machineReadable
  };
}

export function addCommand(itemPath) {
  return {
    args: ["add", "-R", itemPath],
    requireWorkspace: true,
    mutation: true
  };
}

export function undoCommand({ itemPath, recursive = false }) {
  const args = ["undo", itemPath];
  if (recursive) args.push("--recursive");
  args.push(...MACHINE_READABLE_FLAGS);
  return {
    args,
    requireWorkspace: true,
    mutation: true
  };
}

export function branchCreateCommand({ branch, fromChangeset, fromLabel, comment }) {
  const args = ["branch", "create", branch];
  if (fromChangeset) args.push(`--changeset=${fromChangeset}`);
  if (fromLabel) args.push(`--label=${fromLabel}`);
  if (comment) args.push(`-c=${comment}`);
  return {
    args,
    requireWorkspace: true,
    mutation: true
  };
}

export function labelCreateCommand({ label, target, comment }) {
  const args = ["label", "create", label, target];
  if (comment) args.push(`-c=${comment}`);
  return {
    args,
    requireWorkspace: true,
    mutation: true
  };
}

export function switchCommand(target) {
  return {
    args: ["switch", target],
    requireWorkspace: true,
    mutation: true
  };
}

export function mergeCommand({ source, comment }) {
  const args = [
    "merge",
    source,
    "--merge",
    "--nointeractiveresolution",
    ...MACHINE_READABLE_FLAGS
  ];
  if (comment) args.push(`-c=${comment}`);
  return {
    args,
    requireWorkspace: true,
    mutation: true
  };
}
