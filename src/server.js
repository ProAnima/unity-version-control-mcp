import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import * as z from "zod/v4";
import { loadConfig } from "./config/env.js";
import { loadFleetConfigs } from "./config/fleet.js";
import { createCmBackend } from "./backend/cm.js";
import { createTools } from "./tools/index.js";
import { createFleetTools } from "./tools/fleet.js";
import { toolFailure, toolSuccess } from "./server/tool-result.js";
import { withWorkspaceWriteLock } from "./server/write-lock.js";
import { auditToolCall } from "./services/audit.js";

const SERVER_INFO = {
  name: "uvcs-mcp",
  version: "1.2.0"
};

export async function startServer({ input = process.stdin, output = process.stdout, env = process.env } = {}) {
  const server = env.UVCS_FLEET_MANIFEST
    ? await createFleetMcpServer(env)
    : createMcpServer(env);
  const transport = new StdioServerTransport(input, output);
  await server.connect(transport);
  return server;
}

export function createMcpServer(env = process.env) {
  const config = loadConfig(env);
  const backend = createCmBackend(config);
  const tools = createTools({ config, backend });
  return createRegisteredServer(tools, config);
}

export async function createFleetMcpServer(env = process.env) {
  const { configs } = await loadFleetConfigs(env.UVCS_FLEET_MANIFEST, env);
  return createRegisteredServer(createFleetTools(configs));
}

function createRegisteredServer(tools, defaultConfig) {
  const server = new McpServer(SERVER_INFO);

  for (const definition of tools.list()) {
    server.registerTool(
      definition.name,
      {
        description: definition.description,
        inputSchema: zodObjectFromJsonSchema(definition.inputSchema)
      },
      async (args) => {
        const startedAt = Date.now();
        let config = defaultConfig;
        try {
          config = tools.configForArgs?.(args ?? {}) ?? defaultConfig;
          const run = async () => toolSuccess(await tools.call(definition.name, args ?? {}));
          const result = isConfirmTool(definition.name)
            ? await withWorkspaceWriteLock(config.workspace, run)
            : await run();
          await safeAudit(config, {
            tool: definition.name,
            ok: !result.isError,
            durationMs: Date.now() - startedAt
          });
          return result;
        } catch (error) {
          const result = toolFailure(error);
          if (config) {
            await safeAudit(config, {
              tool: definition.name,
              ok: false,
              durationMs: Date.now() - startedAt,
              errorCode: error?.code ?? "UNEXPECTED_ERROR"
            });
          }
          return result;
        }
      }
    );
  }

  return server;
}

function isConfirmTool(name) {
  return name.endsWith("_confirm");
}

async function safeAudit(config, event) {
  try {
    await auditToolCall(config, event);
  } catch (error) {
    process.stderr.write(`[uvcs-mcp] audit log failed: ${error?.message ?? error}\n`);
  }
}

function zodObjectFromJsonSchema(schema) {
  const properties = schema?.properties ?? {};
  const required = new Set(schema?.required ?? []);
  const shape = Object.fromEntries(
    Object.entries(properties).map(([name, propertySchema]) => {
      const field = zodFieldFromJsonSchema(propertySchema);
      return [name, required.has(name) ? field : field.optional()];
    })
  );
  return z.object(shape).strict();
}

function zodFieldFromJsonSchema(schema = {}) {
  let field;
  if (schema.enum) {
    field = z.enum(schema.enum);
  } else {
    switch (schema.type) {
      case "number":
        field = z.number();
        break;
      case "boolean":
        field = z.boolean();
        break;
      case "string":
      default:
        field = z.string();
        break;
    }
  }

  return schema.description ? field.describe(schema.description) : field;
}
