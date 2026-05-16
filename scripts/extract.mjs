// One-shot helper: rewrite src/webview/index.js by deleting line ranges that
// have been moved into sibling modules. Run from a clean checkout of
// b6a4dae; line numbers are 1-based, inclusive, against that revision.

import { readFileSync, writeFileSync } from 'node:fs';

const TARGET = new URL('../src/webview/index.js', import.meta.url);

const REMOVE = [
  [3, 39],      // State + MAX_RECENT_NOTES + pushRecentNote
  [448, 454],   // Helpers (esc, capitalize)
  [532, 598],   // Inline Markdown
  [600, 669],   // Markdown Tables
  [671, 676],   // PAUSED_COLOR + REVIEW_DUE_COLOR
  [678, 743],   // Review Cadence helpers
  [745, 795],   // Status overlays + renderProjectIcon
  [797, 821],   // Progress Pie
  [823, 839],   // parseDateLocal + daysUntilDue
  [841, 870],   // DEADLINE_FLAG_SVG + deadline badges
  [872, 888],   // Area Icon
  [891, 940],   // getViewIcon
  [1459, 1507], // Date formatting
  [2934, 2957], // Date helpers (addDays etc.)
];

const lines = readFileSync(TARGET, 'utf8').split('\n');
const drop = new Set();
for (const [start, end] of REMOVE) {
  for (let i = start; i <= end; i++) drop.add(i - 1);
}
const kept = lines.filter((_, i) => !drop.has(i));
writeFileSync(TARGET, kept.join('\n'));
console.log('[extract] removed', drop.size, 'lines; remaining', kept.length);
