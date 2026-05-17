import { detectProduct } from "../backend/detect-product.js";

export async function runDoctorService(config, backend) {
  const report = {
    node: process.version,
    mode: config.mode,
    workspace: config.workspace || null,
    cmPath: config.cmPath,
    cmAvailable: false,
    cmVersion: null,
    product: null,
    apiAvailable: false,
    workspaceInfo: {},
    statusOk: false,
    capabilities: {
      machineReadableStatus: false,
      machineReadableLocks: false,
      includeRevisionIdStatus: false
    },
    errors: []
  };

  let showCommandsText = "";

  try {
    const showCommands = await backend.showCommands();
    report.cmAvailable = true;
    showCommandsText = showCommands.stdout;
    report.product = detectProduct(config.cmPath, showCommandsText);
  } catch (error) {
    report.errors.push(error.message);
  }

  try {
    const version = await backend.version();
    report.cmVersion = version.stdout || version.stderr || null;
  } catch (error) {
    report.errors.push(error.message);
  }

  try {
    const apiHelp = await backend.apiHelp();
    report.apiAvailable = apiHelp.ok || /api/i.test(apiHelp.stdout) || /api/i.test(apiHelp.stderr);
  } catch (error) {
    report.errors.push(error.message);
  }

  try {
    report.workspaceInfo = await backend.workspaceInfo();
  } catch (error) {
    report.errors.push(error.message);
  }

  if (config.workspace) {
    try {
      await backend.status();
      report.statusOk = true;
    } catch (error) {
      report.errors.push(error.message);
    }

    try {
      const pending = await backend.pendingChanges();
      report.capabilities.machineReadableStatus = pending.format === "machinereadable";
      report.capabilities.includeRevisionIdStatus = Boolean(pending.includeRevisionId);
    } catch {
      // statusOk already carries the workspace failure. Keep doctor readable.
    }

    try {
      const locks = await backend.locks();
      report.capabilities.machineReadableLocks = locks.format === "machinereadable";
    } catch {
      // Locks may fail on older servers or disconnected clients; it is non-fatal.
    }
  }

  report.commandDiscovery = summarizeCommandDiscovery(showCommandsText);
  return report;
}

function summarizeCommandDiscovery(showCommandsText) {
  const lower = showCommandsText.toLowerCase();
  return {
    status: lower.includes("status"),
    update: lower.includes("update"),
    checkin: lower.includes("checkin"),
    lock: lower.includes("lock"),
    api: lower.includes("api")
  };
}
