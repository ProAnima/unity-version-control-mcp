// Line-based unified diff (Myers O(ND)) for comparing two revisions of a text
// file. cm itself only shows revision diffs in its GUI Diff window.

const DEFAULT_CONTEXT = 3;
const DEFAULT_MAX_EDIT_DISTANCE = 5_000;

export function splitLines(text) {
  const normalized = String(text ?? "").replace(/^\uFEFF/, "");
  if (normalized === "") return [];
  const lines = normalized.split(/\r?\n/);
  if (lines.at(-1) === "") lines.pop();
  return lines;
}

export function isProbablyBinary(text) {
  return String(text ?? "").slice(0, 8_000).includes("\0");
}

export function unifiedDiff(oldText, newText, {
  oldLabel = "a",
  newLabel = "b",
  context = DEFAULT_CONTEXT,
  maxEditDistance = DEFAULT_MAX_EDIT_DISTANCE
} = {}) {
  const oldLines = splitLines(oldText);
  const newLines = splitLines(newText);
  const ops = diffLines(oldLines, newLines, maxEditDistance);
  if (!ops) {
    return { identical: false, tooManyChanges: true, added: undefined, removed: undefined, diff: "" };
  }

  const added = ops.filter(([type]) => type === "+").length;
  const removed = ops.filter(([type]) => type === "-").length;
  if (added === 0 && removed === 0) {
    return { identical: true, tooManyChanges: false, added, removed, diff: "" };
  }

  const hunks = buildHunks(ops, context);
  return {
    identical: false,
    tooManyChanges: false,
    added,
    removed,
    diff: [`--- ${oldLabel}`, `+++ ${newLabel}`, ...hunks].join("\n")
  };
}

// Returns [type, line] pairs where type is " ", "-", or "+", or null when the
// files differ by more than maxEditDistance lines.
export function diffLines(a, b, maxEditDistance = DEFAULT_MAX_EDIT_DISTANCE) {
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }

  const middle = myers(a.slice(start, endA), b.slice(start, endB), maxEditDistance);
  if (!middle) return null;
  return [
    ...a.slice(0, start).map((line) => [" ", line]),
    ...middle,
    ...a.slice(endA).map((line) => [" ", line])
  ];
}

function myers(a, b, maxEditDistance) {
  const n = a.length;
  const m = b.length;
  if (n === 0 && m === 0) return [];
  const limit = Math.min(n + m, maxEditDistance);

  // trace[d] holds the furthest x for each diagonal k in [-d-1, d+1] at offset d+1.
  const trace = [];
  let previous = new Int32Array(3);
  for (let d = 0; d <= limit; d += 1) {
    const current = new Int32Array(2 * d + 3);
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && previous[k - 1 + d] < previous[k + 1 + d])
        ? previous[k + 1 + d]
        : previous[k - 1 + d] + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x += 1;
        y += 1;
      }
      current[k + d + 1] = x;
      if (x >= n && y >= m) {
        trace.push(current);
        return backtrack(trace, a, b);
      }
    }
    trace.push(current);
    previous = current;
  }
  return null;
}

function backtrack(trace, a, b) {
  let x = a.length;
  let y = b.length;
  const ops = [];
  for (let d = trace.length - 1; d > 0; d -= 1) {
    const v = trace[d - 1];
    const k = x - y;
    const previousK = k === -d || (k !== d && v[k - 1 + d] < v[k + 1 + d]) ? k + 1 : k - 1;
    const previousX = v[previousK + d];
    const previousY = previousX - previousK;
    while (x > previousX && y > previousY) {
      ops.push([" ", a[x - 1]]);
      x -= 1;
      y -= 1;
    }
    if (x === previousX) ops.push(["+", b[y - 1]]);
    else ops.push(["-", a[x - 1]]);
    x = previousX;
    y = previousY;
  }
  while (x > 0 && y > 0) {
    ops.push([" ", a[x - 1]]);
    x -= 1;
    y -= 1;
  }
  return ops.reverse();
}

function buildHunks(ops, context) {
  const changed = ops.map(([type], index) => (type === " " ? -1 : index)).filter((index) => index >= 0);
  const ranges = [];
  for (const index of changed) {
    const from = Math.max(0, index - context);
    const to = Math.min(ops.length - 1, index + context);
    const last = ranges.at(-1);
    if (last && from <= last.to + 1) last.to = Math.max(last.to, to);
    else ranges.push({ from, to });
  }

  // Line numbers before each op, so hunk headers can be computed directly.
  const oldLineAt = [];
  const newLineAt = [];
  let oldLine = 1;
  let newLine = 1;
  for (const [type] of ops) {
    oldLineAt.push(oldLine);
    newLineAt.push(newLine);
    if (type !== "+") oldLine += 1;
    if (type !== "-") newLine += 1;
  }

  const output = [];
  for (const { from, to } of ranges) {
    const slice = ops.slice(from, to + 1);
    const oldCount = slice.filter(([type]) => type !== "+").length;
    const newCount = slice.filter(([type]) => type !== "-").length;
    const oldStart = oldCount === 0 ? oldLineAt[from] - 1 : oldLineAt[from];
    const newStart = newCount === 0 ? newLineAt[from] - 1 : newLineAt[from];
    output.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const [type, line] of slice) output.push(`${type}${line}`);
  }
  return output;
}
