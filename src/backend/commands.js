export const MACHINE_READABLE_FLAGS = [
  "--machinereadable",
  "--fieldseparator=\u001f"
];

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
  locksMachine: {
    args: ["lock", "list", ...MACHINE_READABLE_FLAGS],
    requireWorkspace: true,
    mutation: false,
    allowFailure: true
  },
  locksText: {
    args: ["lock", "list"],
    requireWorkspace: true,
    mutation: false
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

export function diffFileCommand(filePath) {
  return {
    args: ["diff", filePath],
    requireWorkspace: true,
    mutation: false
  };
}

export function checkinCommand(message) {
  return {
    args: ["checkin", `-c=${message}`, "--applychanged", ...MACHINE_READABLE_FLAGS],
    requireWorkspace: true,
    mutation: true
  };
}

export function addCommand(itemPath) {
  return {
    args: ["add", "-R", itemPath],
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
