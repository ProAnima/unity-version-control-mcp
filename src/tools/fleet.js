import { createCmBackend } from "../backend/cm.js";
import { UvcsError } from "../backend/errors.js";
import { createTools } from "./index.js";

export function createFleetTools(configs) {
  if (!Array.isArray(configs) || configs.length === 0) {
    throw new UvcsError("Fleet mode requires at least one workspace", { code: "FLEET_EMPTY" });
  }

  const instances = new Map(configs.map((config) => [
    config.workspaceName,
    {
      config,
      tools: createTools({ config, backend: createCmBackend(config) })
    }
  ]));
  if (instances.size !== configs.length) {
    throw new UvcsError("Fleet workspace names must be unique", { code: "FLEET_DUPLICATE_WORKSPACE" });
  }

  const workspaceNames = [...instances.keys()];
  const baseDefinitions = instances.values().next().value.tools.list();

  return {
    list: () => baseDefinitions.map((definition) => ({
      ...definition,
      description: `${definition.description} Fleet mode requires an explicit workspace selector.`,
      inputSchema: {
        ...definition.inputSchema,
        properties: {
          workspace: {
            type: "string",
            enum: workspaceNames,
            description: "Named workspace from the fleet manifest."
          },
          ...definition.inputSchema.properties
        },
        required: ["workspace", ...(definition.inputSchema.required ?? [])]
      }
    })),
    call: async (name, args = {}) => {
      const instance = selectInstance(instances, args.workspace);
      const toolArgs = { ...args };
      delete toolArgs.workspace;
      return await instance.tools.call(name, toolArgs);
    },
    configForArgs: (args = {}) => selectInstance(instances, args.workspace).config,
    workspaceNames
  };
}

function selectInstance(instances, workspaceName) {
  if (typeof workspaceName !== "string" || workspaceName.length === 0) {
    throw new UvcsError("Fleet tool calls require workspace", {
      code: "FLEET_WORKSPACE_REQUIRED",
      details: { availableWorkspaces: [...instances.keys()] }
    });
  }
  const instance = instances.get(workspaceName);
  if (!instance) {
    throw new UvcsError(`Unknown fleet workspace: ${workspaceName}`, {
      code: "FLEET_WORKSPACE_UNKNOWN",
      details: { availableWorkspaces: [...instances.keys()] }
    });
  }
  return instance;
}
