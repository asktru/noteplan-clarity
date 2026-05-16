// One-shot reorg script:
//   1. Merge sidebar-resize.js → sidebar.js
//   2. Merge view-prefs.js → state.js
//   3. Merge note-meta-modal.js → modals.js
//   4. Move lib/ files under src/webview/lib/
//   5. Move ui/ files under src/webview/ui/
//   6. Rewrite import specifiers in every .js file to match the new layout
//
// The "old → new" map below is the source of truth. After this script runs,
// the matching old files are deleted. Re-running is not safe — keep the file
// in-tree as a record of the reorg, not as a reusable tool.

import { readFileSync, writeFileSync, mkdirSync, unlinkSync, renameSync, readdirSync, existsSync } from 'node:fs';
import { dirname, basename, relative, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../src/webview/', import.meta.url));

// ─── Step 1–3: in-place merges (target file already exists) ─────────────────

function appendMerge(targetRel, sourceRel, importsToDropInTarget) {
  const target = join(ROOT, targetRel);
  const source = join(ROOT, sourceRel);
  let src = readFileSync(source, 'utf8');

  // Strip the source-file leading banner (`/* global ... */` line + first
  // block comment + import lines that would duplicate what's in the target).
  // Drop any `import ... from './state.js'` / './helpers.js' lines — the
  // target either already has them or doesn't need them after merge.
  src = src.replace(/^\/\*\s*global[^*]*\*\/\n/, '');
  src = src.replace(/^\/\/[^\n]*(?:\n\/\/[^\n]*)*\n+/, '');
  for (const drop of importsToDropInTarget) {
    src = src.replace(new RegExp(`^import\\s*\\{[^}]*\\}\\s*from\\s*['"]\\./${drop}\\.js['"];?\\n`, 'm'), '');
  }
  src = src.replace(/^\n+/, '');

  let dst = readFileSync(target, 'utf8');
  if (!dst.endsWith('\n')) dst += '\n';
  dst += '\n// ─── (merged from ' + basename(sourceRel) + ') ─────────────────────────\n\n' + src;
  writeFileSync(target, dst);
  unlinkSync(source);
}

appendMerge('sidebar.js', 'sidebar-resize.js', ['state', 'helpers']);
appendMerge('state.js', 'view-prefs.js', ['state']);
appendMerge('modals.js', 'note-meta-modal.js', ['state', 'helpers']);

// ─── Step 4–5: subfolder moves ─────────────────────────────────────────────

const LIB = ['helpers.js', 'markdown.js', 'review.js', 'icons.js', 'task-categorization.js'];
const UI  = ['sidebar.js', 'views.js', 'task-list.js', 'task-editor.js', 'pickers.js',
             'modals.js', 'quick-jump.js', 'dnd.js'];

mkdirSync(join(ROOT, 'lib'), { recursive: true });
mkdirSync(join(ROOT, 'ui'),  { recursive: true });

const moves = new Map(); // basename -> new subdir ('lib' | 'ui' | '' for root)
for (const f of LIB) moves.set(f, 'lib');
for (const f of UI)  moves.set(f, 'ui');

for (const [f, subdir] of moves) {
  renameSync(join(ROOT, f), join(ROOT, subdir, f));
}

// ─── Step 6: rewrite import specifiers in every .js file ───────────────────

// Old import specifier → new module location, keyed by old (always './<name>.js')
const SPECIFIER_MAP = {
  // Merged-away modules now point at their new homes:
  './sidebar-resize.js': resolveSpecifier('sidebar.js'),
  './view-prefs.js':     resolveSpecifier('state.js'),
  './note-meta-modal.js': resolveSpecifier('modals.js'),
};
function resolveSpecifier(targetBase) {
  // Returns the canonical "new" location relative to the project root (used
  // below to compute a per-file relative specifier).
  const sub = moves.get(targetBase) || '';
  return sub ? `${sub}/${targetBase}` : targetBase;
}

function rewriteFile(absPath) {
  let src = readFileSync(absPath, 'utf8');
  const fromDir = dirname(absPath);

  src = src.replace(/(from\s*['"])\.\/([\w\-]+)\.js(['"])/g, (m, pre, base, post) => {
    // Resolve where the target now lives.
    let target;
    if (SPECIFIER_MAP[`./${base}.js`]) {
      target = SPECIFIER_MAP[`./${base}.js`];
    } else {
      const sub = moves.get(`${base}.js`) || '';
      target = sub ? `${sub}/${base}.js` : `${base}.js`;
    }
    // Convert "lib/foo.js" → relative specifier from fromDir.
    let rel = relative(fromDir, join(ROOT, target));
    if (!rel.startsWith('.')) rel = './' + rel;
    return pre + rel + post;
  });

  writeFileSync(absPath, src);
}

function walk(dir) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) walk(p);
    else if (ent.isFile() && p.endsWith('.js')) rewriteFile(p);
  }
}
walk(ROOT);

console.log('[reorganize] done');
