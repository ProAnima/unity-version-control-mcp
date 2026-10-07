// Minimal, dependency-free TOML editing for the Codex config.toml MCP section.

export function normalizeEol(text) {
  return text.replace(/\r\n/g, "\n");
}

const CODEX_MANAGED_KEYS = new Set(["command", "args", "env", "url"]);
const CODEX_STARTUP_KEYS = new Set(["startup_timeout_sec", "startup_timeout_ms"]);

// Replaces [mcp_servers.<name>] and all of its subtables. Keys that init does not
// manage (startup_timeout_sec, enabled_tools, ...) are carried over; every other
// table, array table and comment in the file stays where it was.
export function mergeCodexServer(text, serverName, serverBlock, { startupTimeoutSec } = {}) {
  const eol = text.includes("\r\n") ? "\r\n" : "\n";
  const lines = normalizeEol(text).split("\n");
  const statements = scanToml(lines);
  const removed = new Set();
  const preserved = [];
  let insertAt = -1;
  let table = [];
  let inOurs = false;
  let inOurMain = false;
  let pendingTrivia = [];

  const remove = (statement) => {
    for (let index = statement.start; index < statement.end; index += 1) removed.add(index);
  };

  const takeTrivia = () => {
    for (const trivia of pendingTrivia) {
      remove(trivia);
      if (inOurMain && trivia.kind === "comment") preserved.push(trivia);
    }
    pendingTrivia = [];
  };

  for (const statement of statements) {
    if (statement.kind === "header") {
      const ours = statement.keys[0] === "mcp_servers" && statement.keys[1] === serverName;
      // Trivia before a foreign header belongs to that header and stays in place.
      if (inOurs && ours) takeTrivia();
      pendingTrivia = [];
      table = statement.keys;
      inOurs = ours;
      inOurMain = ours && statement.keys.length === 2 && !statement.array;
      if (ours) {
        if (insertAt < 0) insertAt = statement.start;
        remove(statement);
      }
      continue;
    }
    if (!inOurs) {
      const keys = [...table, ...(statement.keys ?? [])];
      if (statement.kind === "key" && keys[0] === "mcp_servers" && (keys.length === 1 || keys[1] === serverName)) {
        throw new Error(`line ${statement.start + 1} defines ${keys.slice(0, 2).join(".")} with an inline table or dotted keys; only [mcp_servers.${serverName}] tables can be merged`);
      }
      continue;
    }
    if (statement.kind !== "key") {
      pendingTrivia.push(statement);
      continue;
    }
    takeTrivia();
    remove(statement);
    if (inOurMain && !CODEX_MANAGED_KEYS.has(statement.keys[0])) preserved.push(statement);
  }

  const hasStartupTimeout = preserved.some((statement) => statement.kind === "key" && CODEX_STARTUP_KEYS.has(statement.keys[0]));
  const section = renderCodexServer(
    serverName,
    serverBlock,
    preserved.flatMap((statement) => lines.slice(statement.start, statement.end)),
    hasStartupTimeout ? undefined : startupTimeoutSec
  );

  const output = [];
  let needsGap = false;
  for (let index = 0; index < lines.length; index += 1) {
    if (index === insertAt) {
      const previous = output.at(-1)?.trim();
      if (previous && !previous.startsWith("#")) output.push("");
      output.push(...section);
      needsGap = true;
    }
    if (removed.has(index)) continue;
    if (needsGap && lines[index].trim() !== "") output.push("");
    needsGap = false;
    output.push(lines[index]);
  }
  if (insertAt < 0) {
    while (output.length > 0 && output.at(-1).trim() === "") output.pop();
    if (output.length > 0) output.push("");
    output.push(...section);
  }
  while (output.length > 0 && output.at(-1).trim() === "") output.pop();

  return {
    text: `${output.join(eol)}${eol}`,
    section: `${section.join("\n")}\n`
  };
}

export function renderCodexServer(serverName, serverBlock, preservedLines = [], startupTimeoutSec) {
  const lines = [
    `[mcp_servers.${serverName}]`,
    `command = ${tomlString(serverBlock.command)}`,
    `args = ${tomlArray(serverBlock.args)}`,
    ...preservedLines
  ];
  if (startupTimeoutSec) lines.push(`startup_timeout_sec = ${startupTimeoutSec}`);
  lines.push("", `[mcp_servers.${serverName}.env]`);
  for (const [key, value] of Object.entries(serverBlock.env)) {
    lines.push(`${tomlKey(key)} = ${tomlString(value)}`);
  }
  return lines;
}

function scanToml(lines) {
  const statements = [];
  let index = 0;
  while (index < lines.length) {
    const trimmed = lines[index].trim();
    if (trimmed === "" || trimmed.startsWith("#")) {
      statements.push({ kind: trimmed ? "comment" : "blank", start: index, end: index + 1 });
      index += 1;
      continue;
    }
    if (trimmed.startsWith("[")) {
      const header = parseTomlHeader(trimmed);
      if (!header) throw new Error(`line ${index + 1} is not a valid table header: ${trimmed}`);
      statements.push({ kind: "header", start: index, end: index + 1, ...header });
      index += 1;
      continue;
    }
    const key = parseTomlKeyPath(trimmed);
    if (!key || !key.rest.startsWith("=")) throw new Error(`line ${index + 1} is not a key = value pair: ${trimmed}`);
    let state = scanTomlValue(key.rest.slice(1), { depth: 0, multiline: null }, index);
    let end = index + 1;
    while (!state.complete && end < lines.length) {
      state = scanTomlValue(lines[end], state, end);
      end += 1;
    }
    if (!state.complete) throw new Error(`the value starting on line ${index + 1} is not terminated`);
    statements.push({ kind: "key", start: index, end, keys: key.keys });
    index = end;
  }
  return statements;
}

function parseTomlHeader(text) {
  const array = text.startsWith("[[");
  const key = parseTomlKeyPath(text.slice(array ? 2 : 1));
  if (!key) return null;
  const close = array ? "]]" : "]";
  if (!key.rest.startsWith(close)) return null;
  const rest = key.rest.slice(close.length).trim();
  if (rest && !rest.startsWith("#")) return null;
  return { keys: key.keys, array };
}

function parseTomlKeyPath(text) {
  const keys = [];
  let rest = text;
  for (;;) {
    rest = rest.trimStart();
    const match = rest.match(/^(?:([A-Za-z0-9_-]+)|"((?:[^"\\]|\\.)*)"|'([^']*)')/);
    if (!match) return null;
    keys.push(match[1] ?? (match[2] !== undefined ? unescapeTomlString(match[2]) : match[3]));
    rest = rest.slice(match[0].length).trimStart();
    if (!rest.startsWith(".")) return { keys, rest };
    rest = rest.slice(1);
  }
}

function unescapeTomlString(value) {
  try {
    return JSON.parse(`"${value}"`);
  } catch {
    return value;
  }
}

function scanTomlValue(text, state, lineIndex) {
  let { depth, multiline } = state;
  let index = 0;
  while (index < text.length) {
    if (multiline) {
      const close = findTomlDelimiter(text, multiline, index);
      if (close < 0) return { depth, multiline, complete: false };
      index = close + 3;
      while (text[index] === multiline[0]) index += 1;
      multiline = null;
      continue;
    }
    const char = text[index];
    if (char === "#") break;
    if (text.startsWith("\"\"\"", index) || text.startsWith("'''", index)) {
      multiline = text.slice(index, index + 3);
      index += 3;
      continue;
    }
    if (char === "\"" || char === "'") {
      const close = findTomlDelimiter(text, char, index + 1);
      if (close < 0) throw new Error(`line ${lineIndex + 1} has an unterminated string`);
      index = close + 1;
      continue;
    }
    if (char === "[" || char === "{") depth += 1;
    if (char === "]" || char === "}") depth -= 1;
    index += 1;
  }
  return { depth, multiline, complete: depth <= 0 && !multiline };
}

function findTomlDelimiter(text, delimiter, from) {
  for (let index = text.indexOf(delimiter, from); index >= 0; index = text.indexOf(delimiter, index + 1)) {
    if (delimiter.startsWith("'")) return index;
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) backslashes += 1;
    if (backslashes % 2 === 0) return index;
  }
  return -1;
}

function tomlKey(key) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : tomlString(key);
}

function tomlArray(values) {
  return `[${values.map(tomlString).join(", ")}]`;
}

function tomlString(value) {
  return JSON.stringify(String(value));
}
