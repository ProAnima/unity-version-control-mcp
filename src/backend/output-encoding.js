import { spawnSync } from "node:child_process";

// Windows `cm` writes redirected output in the console code page: OEM (for
// example cp866) when a console is attached, ANSI (for example cp1251) when it
// is not, and UTF-8 only after `chcp 65001`. Decode UTF-8 strictly first and
// fall back to whichever system code page yields readable text.

const CODE_PAGE_LABELS = new Map([
  [65001, "utf-8"],
  [866, "ibm866"],
  [874, "windows-874"],
  [932, "shift_jis"],
  [936, "gbk"],
  [949, "euc-kr"],
  [950, "big5"],
  [1250, "windows-1250"],
  [1251, "windows-1251"],
  [1252, "windows-1252"],
  [1253, "windows-1253"],
  [1254, "windows-1254"],
  [1255, "windows-1255"],
  [1256, "windows-1256"],
  [1257, "windows-1257"],
  [1258, "windows-1258"]
]);

let cachedSystemEncodings;

export function decodeProcessOutput(buffer, { encoding = "auto", platform = process.platform, systemEncodings } = {}) {
  if (buffer.length === 0) return "";

  if (encoding && encoding !== "auto") {
    return createDecoder(encoding)?.decode(buffer) ?? buffer.toString("utf8");
  }

  const strictUtf8 = tryDecode(buffer, "utf-8", true);
  if (strictUtf8 !== undefined || platform !== "win32") {
    return strictUtf8 ?? buffer.toString("utf8");
  }

  const candidates = systemEncodings ?? getWindowsSystemEncodings();
  let best;
  for (const label of candidates) {
    const text = tryDecode(buffer, label, false);
    if (text === undefined) continue;
    const score = readabilityScore(text);
    if (!best || score > best.score) best = { text, score };
  }
  return best?.text ?? buffer.toString("utf8");
}

export function codePageLabel(codePage) {
  return CODE_PAGE_LABELS.get(Number(codePage));
}

export function getWindowsSystemEncodings() {
  if (cachedSystemEncodings) return cachedSystemEncodings;

  const codePages = [];
  try {
    const result = spawnSync("reg", ["query", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Nls\\CodePage", "/v", "OEMCP"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5_000
    });
    codePages.push(readRegistryValue(result.stdout, "OEMCP"));
    const ansi = spawnSync("reg", ["query", "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Nls\\CodePage", "/v", "ACP"], {
      encoding: "utf8",
      windowsHide: true,
      timeout: 5_000
    });
    codePages.push(readRegistryValue(ansi.stdout, "ACP"));
  } catch {
    // Registry lookup is best effort; UTF-8 decoding remains the fallback.
  }

  cachedSystemEncodings = [...new Set(codePages.map(codePageLabel).filter((label) => label && createDecoder(label)))];
  return cachedSystemEncodings;
}

function readRegistryValue(stdout, name) {
  const match = String(stdout ?? "").match(new RegExp(`${name}\\s+REG_SZ\\s+(\\d+)`));
  return match ? Number(match[1]) : undefined;
}

function tryDecode(buffer, label, fatal) {
  const decoder = createDecoder(label, fatal);
  if (!decoder) return undefined;
  try {
    return decoder.decode(buffer);
  } catch {
    return undefined;
  }
}

function createDecoder(label, fatal = false) {
  try {
    return new TextDecoder(label, { fatal });
  } catch {
    return undefined;
  }
}

function readabilityScore(text) {
  let score = 0;
  for (const char of text) {
    if (char === "�") score -= 10;
    else if (/\p{L}/u.test(char)) score += 1;
    else if (/[─-▟]/u.test(char)) score -= 2;
  }
  return score;
}
