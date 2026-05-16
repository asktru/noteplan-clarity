// One-shot helper: rewrite src/webview/index.js by deleting line ranges that
// have been moved into sibling modules. Run from a clean checkout of
// b6a4dae; line numbers are 1-based, inclusive, against that revision.

import { readFileSync, writeFileSync } from 'node:fs';

const TARGET = new URL('../src/webview/index.js', import.meta.url);

// Ranges target the CURRENT state of index.js, not the original — the
// previous round's ranges were dropped from this list once they merged.
// Treat REMOVE as a one-shot checkpoint, not a permanent ledger.
const REMOVE = [
  [95, 289],    // Drag & Drop (moved to dnd.js + attached via attachDragListeners)
  [2249, 2386], // Project/Area Metadata Modal (moved to note-meta-modal.js)
];

const lines = readFileSync(TARGET, 'utf8').split('\n');
const drop = new Set();
for (const [start, end] of REMOVE) {
  for (let i = start; i <= end; i++) drop.add(i - 1);
}
const kept = lines.filter((_, i) => !drop.has(i));
writeFileSync(TARGET, kept.join('\n'));
console.log('[extract] removed', drop.size, 'lines; remaining', kept.length);
