import readline from "node:readline";
import { loadConfig } from "./config/env.js";
import { createCmBackend } from "./backend/cm.js";
import { createTools } from "./tools/index.js";
import { toolFailure, toolSuccess } from "./server/tool-result.js";

const SERVER_INFO = {
  name: "uvcs-mcp",
  version: "0.2.0"
};

export async function startServer({ input = process.stdin, output = process.stdout } = {}) {
  const config = loadConfig(process.env);
  const backend = createCmBackend(config);
  const tools = createTools({ config, backend });

  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  rl.on("line", async (line) => {
    if (!line.trim()) return;

    let request;
    try {
      request = JSON.parse(line);
    } catch (error) {
      writeJson(output, jsonError(null, -32700, "Parse error", error.message));
      return;
    }

    try {
      const response = await handleRequest(request, tools);
      if (response) writeJson(output, response);
    } catch (error) {
      writeJson(output, errorToJsonRpc(request.id ?? null, error));
    }
  });
}

async function handleRequest(request, tools) {
  const { id, method, params } = request;

  if (method === "initialize") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        protocolVersion: params?.protocolVersion ?? "2024-11-05",
        capabilities: {
          tools: {}
        },
        serverInfo: SERVER_INFO
      }
    };
  }

  if (method === "notifications/initialized") {
    return null;
  }

  if (method === "tools/list") {
    return {
      jsonrpc: "2.0",
      id,
      result: {
        tools: tools.list()
      }
    };
  }

  if (method === "tools/call") {
    const toolName = params?.name;
    const toolArgs = params?.arguments ?? {};
    let result;
    try {
      result = toolSuccess(await tools.call(toolName, toolArgs));
    } catch (error) {
      result = toolFailure(error);
    }
    return {
      jsonrpc: "2.0",
      id,
      result
    };
  }

  if (method === "ping") {
    return { jsonrpc: "2.0", id, result: {} };
  }

  return jsonError(id ?? null, -32601, "Method not found", method);
}

function writeJson(output, payload) {
  output.write(`${JSON.stringify(payload)}\n`);
}

function jsonError(id, code, message, details) {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      data: details
    }
  };
}

function errorToJsonRpc(id, error) {
  const knownCode = error?.code;
  if (knownCode) {
    return jsonError(id, -32000, error.message, {
      code: knownCode,
      details: error.details
    });
  }

  return jsonError(id, -32603, "Internal error", error?.message ?? String(error));
}
