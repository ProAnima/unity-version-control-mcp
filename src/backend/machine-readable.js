const FIELD_SEPARATOR = "\u001f";

export function parseMachineReadableTable(text) {
  if (!text?.trim()) return [];

  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.split(FIELD_SEPARATOR));
}

export function toRawResult(result, extra = {}) {
  return {
    ok: result.code === 0,
    command: result.displayCommand,
    stdout: result.stdout,
    stderr: result.stderr,
    ...extra
  };
}
