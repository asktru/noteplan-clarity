# Clarity TOC / Indent / Focus / Progress — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add four optional, per-note view enhancements to the Clarity project (note) view, opt-in via a single `clarity:` front-matter key: TOC sidebar, heading colors + section indent, focus mode with eye icons, and heading progress pies. Focus mode is wire-compatible with the Donote plugin via the shared `👀` heading marker.

**Architecture:** Pure-function helpers in `src/webview/lib/` (`clarity-flags.js`, `heading-progress.js`). UI feature modules in `src/webview/ui/` (`toc.js`, `focus-mode.js`). `renderNoteView` reads parsed flags from front-matter and conditionally injects DOM (right sidebar, eye icons, progress pies, root class). New action cases in `attachMainEventListeners` plus a TOC-sidebar listener. Host side (`script.js`) gains a `toggleHeadingFocus` handler modeled on the existing `toggleHeadingCollapse`. CSS additions to `clarity.css`.

**Tech Stack:** Vanilla JS (ES2017), esbuild IIFE bundler, NotePlan plugin HTML window. No test framework — verification is `npm run build` followed by reloading the Clarity window in NotePlan and exercising the feature.

**Reference spec:** `docs/superpowers/specs/2026-05-17-clarity-toc-indent-focus-design.md`

**Note on verification:** This codebase has no test runner. Each task ends with a build + a brief manual check, and a commit. Build command (run from plugin root):

```
npm run build
```

Reload steps: in NotePlan, run the **Clarity** command (or `cmd-r` in the Clarity window if it's already open) to reload the HTML view against the rebuilt bundle.

---

### Task 1: Front-matter flag parser

**Files:**
- Create: `src/webview/lib/clarity-flags.js`

- [ ] **Step 1: Create the parser module**

Create `src/webview/lib/clarity-flags.js` with the following content:

```javascript
// Parses the optional `clarity:` front-matter key. Value is a comma-separated
// list of tokens. Recognized tokens: toc, indent, focus, progress. Tokens are
// case-insensitive, whitespace-tolerant. Unknown tokens are ignored.
//
// Returns an object: { toc: bool, indent: bool, focus: bool, progress: bool }.

export function parseClarityFlags(frontmatter) {
  var flags = { toc: false, indent: false, focus: false, progress: false };
  if (!frontmatter) return flags;
  var raw = frontmatter.clarity;
  if (typeof raw !== 'string' || !raw) return flags;
  var tokens = raw.split(',');
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i].trim().toLowerCase();
    if (t === 'toc') flags.toc = true;
    else if (t === 'indent') flags.indent = true;
    else if (t === 'focus') flags.focus = true;
    else if (t === 'progress') flags.progress = true;
  }
  return flags;
}

// Inverse: given a flags object, build the canonical comma-separated string.
// Order: toc, indent, focus, progress. Returns null when no flags set, which
// signals applyFrontmatterUpdates() to remove the key entirely.
export function serializeClarityFlags(flags) {
  if (!flags) return null;
  var out = [];
  if (flags.toc) out.push('toc');
  if (flags.indent) out.push('indent');
  if (flags.focus) out.push('focus');
  if (flags.progress) out.push('progress');
  return out.length ? out.join(', ') : null;
}
```

- [ ] **Step 2: Sanity-check the parser**

Add a temporary scratch check (delete before commit). From the plugin root:

```bash
node -e "
  const { parseClarityFlags, serializeClarityFlags } = require('./src/webview/lib/clarity-flags.js');
  console.log(parseClarityFlags({ clarity: 'toc, indent' }));
  console.log(parseClarityFlags({ clarity: 'TOC,FOCUS' }));
  console.log(parseClarityFlags({ clarity: '' }));
  console.log(parseClarityFlags({}));
  console.log(serializeClarityFlags({ toc: true, focus: true }));
  console.log(serializeClarityFlags({}));
"
```

Expected output:
```
{ toc: true, indent: true, focus: false, progress: false }
{ toc: true, indent: false, focus: true, progress: false }
{ toc: false, indent: false, focus: false, progress: false }
{ toc: false, indent: false, focus: false, progress: false }
toc, focus
null
```

(Node CommonJS won't import an ES module that uses `export`. If the command above complains about `Unexpected token 'export'`, skip this scratch check — esbuild will compile the file fine. The build run in later tasks will catch syntax errors.)

- [ ] **Step 3: Commit**

```bash
git add src/webview/lib/clarity-flags.js
git commit -m "feat(clarity-view): add clarity front-matter flag parser"
```

---

### Task 2: Heading-progress compute + SVG builder

**Files:**
- Create: `src/webview/lib/heading-progress.js`

- [ ] **Step 1: Create the module**

This is a direct port of Donote's `computeHeadingTaskStats` and `buildHeadingProgressSVG`, adapted to consume Clarity's parsed `paragraphs` array (which already has `type`, `content`, `headingLevel`) instead of re-tokenizing raw lines.

Create `src/webview/lib/heading-progress.js`:

```javascript
// Per-heading task completion stats for use by the `progress` token.
// Returns a Map keyed by heading paragraph's `lineIndex` → { total, done }.
//
// Counting rules (kept in sync with Donote's computeHeadingTaskStats):
//   - Every task counts toward every ancestor heading on the level stack,
//     so an H1 pie reflects completion across its whole section.
//   - Cancelled tasks (type === 'cancelled' / 'checklistCancelled') are
//     excluded from both total and done.
//   - Done tasks (type === 'done' / 'checklistDone') add to done.
//   - Separator headings (text matches /^[-*_]{3,}$/) are ignored.

export function computeHeadingTaskStats(paragraphs) {
  var stats = new Map();
  var stack = []; // each entry: { level, lineIndex }
  for (var i = 0; i < (paragraphs || []).length; i++) {
    var p = paragraphs[i];
    if (p.type === 'title') {
      var hText = (p.content || '').trim().replace(/\s*…\s*$/, '').replace(/\s*👀\s*$/, '');
      if (/^[-*_]{3,}$/.test(hText)) continue;
      var level = p.headingLevel || 1;
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      stats.set(p.lineIndex, { total: 0, done: 0 });
      stack.push({ level: level, lineIndex: p.lineIndex });
      continue;
    }
    var isOpen = (p.type === 'open' || p.type === 'checklist');
    var isDone = (p.type === 'done' || p.type === 'checklistDone');
    if (!isOpen && !isDone) continue;
    for (var s = 0; s < stack.length; s++) {
      var entry = stats.get(stack[s].lineIndex);
      if (!entry) continue;
      entry.total++;
      if (isDone) entry.done++;
    }
  }
  return stats;
}

// Things-3 style heading progress pie. Returns an HTML string or '' when total is 0.
// 18×18 SVG; uses currentColor so the pie inherits the heading's color (incl.
// the indent palette in `cl-note-indented`). At 100% complete, switches to a
// filled disk with a checkmark punched through in the page background.
export function buildHeadingProgressSVG(done, total) {
  if (!total) return '';
  var pct = done / total;
  var size = 18, cx = 9, cy = 9, r = 7, sw = 2.25;
  var html = '<svg class="cl-h-progress" viewBox="0 0 ' + size + ' ' + size +
    '" width="' + size + '" height="' + size + '" aria-hidden="true">';
  html += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
    '" fill="none" stroke="currentColor" stroke-width="' + sw + '" opacity="0.4"/>';
  if (pct >= 1) {
    html += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r + sw / 2) + '" fill="currentColor"/>';
    html += '<path d="M 5.5 9.2 L 8 11.6 L 12.7 6.6" fill="none" stroke="var(--cl-bg)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  } else if (pct > 0) {
    var angle = 2 * Math.PI * pct;
    var endX = cx + r * Math.sin(angle);
    var endY = cy - r * Math.cos(angle);
    var largeArc = pct > 0.5 ? 1 : 0;
    var d = 'M ' + cx + ' ' + cy + ' L ' + cx + ' ' + (cy - r) +
            ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' +
            endX.toFixed(3) + ' ' + endY.toFixed(3) + ' Z';
    html += '<path d="' + d + '" fill="currentColor"/>';
  }
  html += '</svg>';
  return html;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/webview/lib/heading-progress.js
git commit -m "feat(clarity-view): add per-heading task stats + pie SVG builder"
```

---

### Task 3: CSS — TOC, indent palette, dimming, eye icon, progress pie, right sidebar

**Files:**
- Modify: `clarity.css` (append at end of file)

- [ ] **Step 1: Append the new rules**

Append the following block at the end of `clarity.css`. The block is self-contained, prefixed with `/* ── Clarity view enhancements ── */`, so it's easy to find/audit later.

```css
/* ── Clarity view enhancements (toc, indent, focus, progress) ── */

/* New variables for the indent palette. --cl-orange / --cl-green / --cl-blue
   are already defined in :root above. We only need --cl-gold. */
:root { --cl-gold: #F5A524; }

/* Right sidebar — only rendered when toc is enabled and the note has subheadings. */
#cl-right-sidebar {
  width: 220px;
  min-width: 220px;
  background: var(--cl-bg);
  border-left: 1px solid var(--cl-border, rgba(255,255,255,0.08));
  overflow-y: auto;
  padding: 16px 0;
  box-sizing: border-box;
  font-size: 12px;
}
.cl-toc-title {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--cl-text-muted, rgba(255,255,255,0.4));
  padding: 0 12px 8px;
}
.cl-toc-list { display: flex; flex-direction: column; }
.cl-toc-item {
  display: block;
  text-align: left;
  background: none;
  border: 0;
  color: inherit;
  padding: 4px 8px;
  font: inherit;
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: color 0.1s, opacity 0.1s;
  opacity: 0.7;
}
.cl-toc-item:hover { opacity: 1; }
.cl-toc-item.active { color: var(--cl-accent); font-weight: 600; opacity: 1; }
.cl-toc-level-1 { padding-left: 8px; font-weight: 600; }
.cl-toc-level-2 { padding-left: 16px; }
.cl-toc-level-3 { padding-left: 24px; font-size: 11px; }
.cl-toc-level-4, .cl-toc-level-5, .cl-toc-level-6 { padding-left: 32px; font-size: 11px; }

/* Visual hierarchy: heading colors + section-body indent. Scoped to
   .cl-note-indented so this is fully opt-in. */
.cl-note-indented .cl-note-h1 { color: var(--cl-gold); }
.cl-note-indented .cl-note-h2 { color: var(--cl-blue); }
.cl-note-indented .cl-note-h3 { color: var(--cl-orange); }
.cl-note-indented .cl-note-h4 { color: var(--cl-green); }
.cl-note-indented .cl-section-body { padding-left: 20px; }

/* Focus mode: dimming + eye toggle. The eye icon is rendered next to the
   heading text whenever the focus token is on. */
.cl-heading-focus {
  display: inline-flex;
  align-items: center;
  margin-left: 6px;
  opacity: 0;
  transition: opacity 0.1s;
  cursor: pointer;
  color: inherit;
  font-size: 11px;
}
.cl-note-heading:hover .cl-heading-focus { opacity: 0.55; }
.cl-note-heading[data-focused="true"] .cl-heading-focus { opacity: 1; }
.cl-heading-focus:hover { opacity: 1 !important; }
.cl-dimmed { opacity: 0.22; transition: opacity 0.2s; }
.cl-dimmed .cl-heading-focus { opacity: 0 !important; }

/* Progress pie placement on headings. The SVG uses currentColor so it
   inherits the heading color from the indent palette when active. */
.cl-h-progress {
  display: inline-block;
  vertical-align: -3px;
  margin-right: 8px;
  flex-shrink: 0;
}

/* Project-meta modal: clarity chips row. */
.cl-meta-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.cl-meta-chip {
  display: inline-flex;
  align-items: center;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid var(--cl-border, rgba(255,255,255,0.15));
  background: transparent;
  color: inherit;
  cursor: pointer;
  font-size: 12px;
  line-height: 1.2;
  user-select: none;
  transition: all 0.1s;
}
.cl-meta-chip:hover { border-color: var(--cl-accent); }
.cl-meta-chip.cl-meta-chip-active {
  background: var(--cl-accent);
  border-color: var(--cl-accent);
  color: #fff;
}
```

- [ ] **Step 2: Build and visually sanity-check that nothing broke**

```bash
npm run build
```

Expected: `[clarity] built clarityEvents.js`. No esbuild errors. (No DOM changes yet, so the existing view should look identical after reload.)

- [ ] **Step 3: Commit**

```bash
git add clarity.css
git commit -m "feat(clarity-view): add CSS for toc, indent palette, focus dimming, progress pie"
```

---

### Task 4: Layout shell — add `#cl-right-sidebar` element

**Files:**
- Modify: `script.js:115` (the host-side HTML template that NotePlan injects into the HTML window)

- [ ] **Step 1: Add the right-sidebar element to the root layout**

In `script.js`, find the line that builds the root layout (around line 115):

```javascript
'  <div id="cl-root"><div id="cl-sidebar"></div><div id="cl-resizer"></div><div id="cl-main"></div></div>\n' +
```

Replace it with:

```javascript
'  <div id="cl-root"><div id="cl-sidebar"></div><div id="cl-resizer"></div><div id="cl-main"></div><div id="cl-right-sidebar" hidden></div></div>\n' +
```

The element is always present in the DOM (so render code can populate it without re-creating it) but starts hidden. The webview-side TOC renderer toggles the `hidden` attribute.

- [ ] **Step 2: Build + reload, confirm nothing visibly changed**

```bash
npm run build
```

Reload the Clarity window in NotePlan. The layout should look unchanged (the new sidebar is hidden).

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "feat(clarity-view): add hidden right-sidebar placeholder to layout"
```

---

### Task 5: TOC builder + scroll spy + click handler

**Files:**
- Create: `src/webview/ui/toc.js`

- [ ] **Step 1: Create the TOC module**

Create `src/webview/ui/toc.js`:

```javascript
// Right-sidebar Table of Contents for the note view. Activated when the note's
// front-matter has `clarity: toc, ...`. Hidden + DOM-empty otherwise so layout
// is unaffected.

import { renderInlineMarkdown } from '../lib/markdown.js';

// Build TOC items from a paragraphs array. Filters out the leading H1 that
// duplicates the note title (matching renderNoteView's `firstH1Skipped`).
// Returns a list of { lineIndex, level, text } in document order.
export function collectTocHeadings(paragraphs) {
  var out = [];
  var firstH1Skipped = false;
  for (var i = 0; i < (paragraphs || []).length; i++) {
    var p = paragraphs[i];
    if (p.type !== 'title') continue;
    var level = p.headingLevel || 1;
    if (!firstH1Skipped && level === 1) { firstH1Skipped = true; continue; }
    var text = (p.content || '').replace(/\s*…\s*$/, '').replace(/\s*👀\s*$/, '');
    if (/^[-*_]{3,}$/.test(text.trim())) continue; // separator
    out.push({ lineIndex: p.lineIndex, level: level, text: text });
  }
  return out;
}

// Render the right sidebar into the (always-present) #cl-right-sidebar element.
// If there are no subheadings, the sidebar is hidden and its contents cleared.
export function renderToc(paragraphs) {
  var el = document.getElementById('cl-right-sidebar');
  if (!el) return;
  var headings = collectTocHeadings(paragraphs);
  if (headings.length === 0) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  var html = '<div class="cl-toc-title">Contents</div><div class="cl-toc-list">';
  for (var i = 0; i < headings.length; i++) {
    var h = headings[i];
    html += '<button class="cl-toc-item cl-toc-level-' + h.level +
      '" data-action="scrollToHeading" data-line-index="' + h.lineIndex + '">' +
      renderInlineMarkdown(h.text) + '</button>';
  }
  html += '</div>';
  el.innerHTML = html;
  el.hidden = false;
}

// Hide the TOC (used when the toc token is off or we're not in note view).
export function hideToc() {
  var el = document.getElementById('cl-right-sidebar');
  if (!el) return;
  el.hidden = true;
  el.innerHTML = '';
}

// Smooth-scroll #cl-main to a heading by lineIndex.
export function scrollToHeading(lineIndex) {
  var main = document.getElementById('cl-main');
  if (!main) return;
  var heading = main.querySelector('.cl-note-heading[data-line-index="' + lineIndex + '"]');
  if (!heading) return;
  main.scrollTo({ top: heading.offsetTop - 20, behavior: 'smooth' });
}

// Scroll-spy: highlights the TOC item matching the topmost visible heading.
// Idempotent — calling repeatedly only attaches the listener once per main element.
var _spyAttached = false;
export function attachTocScrollSpy() {
  if (_spyAttached) return;
  var main = document.getElementById('cl-main');
  if (!main) return;
  _spyAttached = true;
  var debounce = null;
  main.addEventListener('scroll', function() {
    if (debounce) return;
    debounce = setTimeout(function() {
      debounce = null;
      updateActiveTocItem();
    }, 50);
  });
}

function updateActiveTocItem() {
  var sidebar = document.getElementById('cl-right-sidebar');
  if (!sidebar || sidebar.hidden) return;
  var main = document.getElementById('cl-main');
  if (!main) return;
  var headings = main.querySelectorAll('.cl-note-heading');
  var scrollTop = main.scrollTop;
  var activeLineIndex = null;
  for (var i = 0; i < headings.length; i++) {
    if (headings[i].offsetTop <= scrollTop + 60) {
      activeLineIndex = headings[i].dataset.lineIndex;
    } else {
      break;
    }
  }
  var items = sidebar.querySelectorAll('.cl-toc-item');
  for (var j = 0; j < items.length; j++) {
    if (items[j].dataset.lineIndex === activeLineIndex) items[j].classList.add('active');
    else items[j].classList.remove('active');
  }
}
```

- [ ] **Step 2: Wire TOC clicks into the sidebar (attach once)**

Append this exported initializer to `src/webview/ui/toc.js`:

```javascript
// One-time click delegation on the right sidebar. Called from init.js.
var _clickAttached = false;
export function attachTocClickHandler() {
  if (_clickAttached) return;
  var el = document.getElementById('cl-right-sidebar');
  if (!el) return;
  _clickAttached = true;
  el.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action="scrollToHeading"]');
    if (!btn) return;
    var idx = parseInt(btn.dataset.lineIndex, 10);
    if (isNaN(idx)) return;
    scrollToHeading(idx);
  });
}
```

- [ ] **Step 3: Hook up the click handler on init**

Modify `src/webview/init.js` to call `attachTocClickHandler` once after the layout exists. Add the import and call near the existing setup:

```javascript
import { attachTocClickHandler } from './ui/toc.js';
```

Find the function that runs on `DOMContentLoaded` (in `init.js`) and add this line near the other listener attachments (after `attachDragListeners(document.getElementById('cl-main'))`):

```javascript
  attachTocClickHandler();
```

- [ ] **Step 4: Commit**

```bash
git add src/webview/ui/toc.js src/webview/init.js
git commit -m "feat(clarity-view): TOC builder, scroll spy, click handler"
```

---

### Task 6: Focus-mode module

**Files:**
- Create: `src/webview/ui/focus-mode.js`

- [ ] **Step 1: Create the module**

Create `src/webview/ui/focus-mode.js`:

```javascript
// Focus mode for the note view: dims everything outside the focused section(s).
// State lives on the DOM (data-focused="true" on .cl-note-heading) and is
// mirrored on disk by appending/stripping a trailing 👀 on the heading line,
// so it survives reload and is shared with the Donote plugin.

// Recompute dimming based on which headings have data-focused="true".
// Builds the "spared set" = focused headings + their following section-body +
// all ancestor headings + their section-bodies. Everything else inside #cl-main
// gets `.cl-dimmed`.
export function applyFocusMode() {
  var main = document.getElementById('cl-main');
  if (!main) return;
  var focused = main.querySelectorAll('.cl-note-heading[data-focused="true"]');
  // Clear any previous dimming up front.
  var prev = main.querySelectorAll('.cl-dimmed');
  for (var p = 0; p < prev.length; p++) prev[p].classList.remove('cl-dimmed');
  if (focused.length === 0) return;

  // Build an ordered list of (headingEl, level) for ancestor lookup.
  var allHeadings = Array.prototype.slice.call(main.querySelectorAll('.cl-note-heading'));
  function levelOf(el) {
    var cls = el.className.match(/cl-note-h(\d+)/);
    return cls ? parseInt(cls[1], 10) : 1;
  }

  var spared = new Set();
  for (var f = 0; f < focused.length; f++) {
    var fh = focused[f];
    spared.add(fh);
    // The section body is the next sibling .cl-section-body in document order.
    var sib = fh.nextElementSibling;
    if (sib && sib.classList.contains('cl-section-body')) spared.add(sib);
    // Find ancestor headings (any earlier heading with a strictly smaller level).
    var fhLevel = levelOf(fh);
    var fhIdx = allHeadings.indexOf(fh);
    for (var k = fhIdx - 1; k >= 0 && fhLevel > 1; k--) {
      var anc = allHeadings[k];
      var ancLevel = levelOf(anc);
      if (ancLevel < fhLevel) {
        spared.add(anc);
        var ancSib = anc.nextElementSibling;
        if (ancSib && ancSib.classList.contains('cl-section-body')) spared.add(ancSib);
        fhLevel = ancLevel; // walk up to the next shallower level
      }
    }
  }

  // Everything in cl-note-content that isn't in the spared set gets dimmed.
  // We dim at the level of direct children of `.cl-note-content` plus headings
  // inside section-bodies (so nested headings outside the spared chain dim too).
  var contentRoot = main.querySelector('.cl-note-content');
  if (!contentRoot) return;
  var direct = contentRoot.children;
  for (var d = 0; d < direct.length; d++) {
    if (!spared.has(direct[d])) direct[d].classList.add('cl-dimmed');
  }
}

// Click-handler entry point. Optimistically flips data-focused + the eye icon
// on the heading, then notifies the host to persist the 👀 marker. Called from
// the main click delegator in index.js.
//
// `headingEl` is the .cl-note-heading element clicked.
export function toggleHeadingFocusUI(headingEl) {
  if (!headingEl) return false;
  var now = headingEl.getAttribute('data-focused') === 'true';
  headingEl.setAttribute('data-focused', now ? 'false' : 'true');
  var icon = headingEl.querySelector('.cl-heading-focus i');
  if (icon) {
    icon.classList.toggle('fa-regular', now);
    icon.classList.toggle('fa-solid', !now);
  }
  applyFocusMode();
  return true;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/webview/ui/focus-mode.js
git commit -m "feat(clarity-view): focus-mode dimming + UI toggle helper"
```

---

### Task 7: Wire all four features into `renderNoteView`

**Files:**
- Modify: `src/webview/ui/views.js`

The note-view renderer needs to (a) compute `flags` from front-matter, (b) wrap the rendered note in `.cl-note-indented` when `indent` is on, (c) inject the progress-pie SVG before each heading text when `progress` is on, (d) strip `👀` and add the eye icon when `focus` is on, (e) call `renderToc` + `attachTocScrollSpy` + `applyFocusMode` after the HTML is in the DOM.

- [ ] **Step 1: Add imports at the top of `views.js`**

Find the existing import block at the top of `src/webview/ui/views.js`. Add:

```javascript
import { parseClarityFlags } from '../lib/clarity-flags.js';
import { computeHeadingTaskStats, buildHeadingProgressSVG } from '../lib/heading-progress.js';
import { renderToc, hideToc, attachTocScrollSpy } from './toc.js';
import { applyFocusMode } from './focus-mode.js';
```

- [ ] **Step 2: Replace the inner body of `renderNoteView` to thread flags through**

In `renderNoteView` (around `src/webview/ui/views.js:271`), make the following edits.

Just after `var fm = nc.frontmatter || {};` (around line 276), add:

```javascript
  var flags = parseClarityFlags(fm);
  var headingStats = flags.progress ? computeHeadingTaskStats(paras) : null;
```

Find the `.cl-task-list cl-note-content` container opening (around line 324):

```javascript
  html += '<div class="cl-task-list cl-note-content">';
```

Replace it with a version that adds the indent class conditionally:

```javascript
  html += '<div class="cl-task-list cl-note-content' + (flags.indent ? ' cl-note-indented' : '') + '">';
```

Find the heading-rendering block (around lines 385–405). The current block starts with:

```javascript
    if (isHeading) {
      var hLevel = p.headingLevel || 1;
      // Close open section-bodies at same or deeper heading level
      while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].level >= hLevel) {
        html += '</div>';
        sectionStack.pop();
      }
      // NotePlan convention: trailing "…" (U+2026) marks a collapsed heading
      var hRawContent = p.content || '';
      var hCollapsed = /…\s*$/.test(hRawContent);
      var hDisplay = hRawContent.replace(/\s*…\s*$/, '');
      var hClass = State.tasksOnly ? 'cl-section-heading' : 'cl-note-heading cl-note-h' + hLevel;
      var chevronDir = hCollapsed ? 'right' : 'down';
      html += '<div class="' + hClass + '" data-line-index="' + p.lineIndex + '">';
      html += '<span class="cl-heading-text">' + renderInlineMarkdown(hDisplay) + '</span>';
      html += '<span class="cl-heading-toggle' + (hCollapsed ? ' cl-always-visible' : '') + '" data-action="toggleHeadingCollapse" data-line-index="' + p.lineIndex + '" title="Toggle collapse">';
      html += '<svg width="10" height="10" viewBox="0 0 10 10" class="cl-heading-chevron cl-chevron-' + chevronDir + '"><polyline points="2,3 5,7 8,3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      html += '</span>';
      html += '</div>';
      html += '<div class="cl-section-body"' + (hCollapsed ? ' style="display:none"' : '') + ' data-heading-line="' + p.lineIndex + '">';
      sectionStack.push({ level: hLevel, collapsed: hCollapsed });
    }
```

Replace it with:

```javascript
    if (isHeading) {
      var hLevel = p.headingLevel || 1;
      while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].level >= hLevel) {
        html += '</div>';
        sectionStack.pop();
      }
      // Strip NotePlan's collapse marker (…) and Donote's focus marker (👀).
      var hRawContent = p.content || '';
      var hCollapsed = /…\s*$/.test(hRawContent);
      var hFocused = flags.focus && /👀/.test(hRawContent);
      var hDisplay = hRawContent.replace(/\s*…\s*$/, '').replace(/\s*👀\s*$/, '');
      var hClass = State.tasksOnly ? 'cl-section-heading' : 'cl-note-heading cl-note-h' + hLevel;
      var chevronDir = hCollapsed ? 'right' : 'down';
      var focusedAttr = hFocused ? ' data-focused="true"' : '';
      html += '<div class="' + hClass + '" data-line-index="' + p.lineIndex + '"' + focusedAttr + '>';
      // Progress pie (before the heading text). currentColor inherits heading color.
      if (flags.progress && headingStats) {
        var st = headingStats.get(p.lineIndex);
        if (st) html += buildHeadingProgressSVG(st.done, st.total);
      }
      html += '<span class="cl-heading-text">' + renderInlineMarkdown(hDisplay) + '</span>';
      // Eye icon (focus toggle). data-action handled in index.js.
      if (flags.focus) {
        html += '<span class="cl-heading-focus" data-action="toggleHeadingFocus" data-line-index="' +
          p.lineIndex + '" title="Focus on this section">' +
          '<i class="' + (hFocused ? 'fa-solid' : 'fa-regular') + ' fa-eye"></i></span>';
      }
      html += '<span class="cl-heading-toggle' + (hCollapsed ? ' cl-always-visible' : '') + '" data-action="toggleHeadingCollapse" data-line-index="' + p.lineIndex + '" title="Toggle collapse">';
      html += '<svg width="10" height="10" viewBox="0 0 10 10" class="cl-heading-chevron cl-chevron-' + chevronDir + '"><polyline points="2,3 5,7 8,3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      html += '</span>';
      html += '</div>';
      html += '<div class="cl-section-body"' + (hCollapsed ? ' style="display:none"' : '') + ' data-heading-line="' + p.lineIndex + '">';
      sectionStack.push({ level: hLevel, collapsed: hCollapsed });
    }
```

- [ ] **Step 3: Render the TOC + apply focus dimming after the note view is in the DOM**

`renderNoteView` returns an HTML string that the caller (`renderCurrentView` in the same file) injects into `#cl-main.innerHTML`. We need a post-mount hook. The simplest path: do the post-render work at the top of `renderCurrentView` after it writes the HTML, gated on the note view.

Find `renderCurrentView` (around `src/webview/ui/views.js:21`). It looks like:

```javascript
export function renderCurrentView() {
  var el = document.getElementById('cl-main');
  if (!el) return;
  // ... dispatch by State.currentView, writing to el.innerHTML ...
}
```

Locate the case that handles `'note'` (it will call `renderNoteView()` and write the result). Immediately after `el.innerHTML = renderNoteView();` (or however that line reads — the exact phrasing varies; do not rewrite the surrounding code, only add the lines below right after the assignment), add:

```javascript
    // Post-mount: TOC + focus dimming, gated by clarity flags.
    var __fm = (State.noteContent && State.noteContent.frontmatter) || {};
    var __flags = parseClarityFlags(__fm);
    if (__flags.toc) {
      renderToc((State.noteContent && State.noteContent.paragraphs) || []);
      attachTocScrollSpy();
    } else {
      hideToc();
    }
    if (__flags.focus) {
      applyFocusMode();
    }
```

For non-`note` views, also call `hideToc()` so the right sidebar is hidden when leaving the note view. The simplest place is right before the `return` of `renderCurrentView` — add:

```javascript
  // Ensure the right sidebar is hidden in non-note views.
  if (State.currentView !== 'note') hideToc();
```

- [ ] **Step 4: Build and reload**

```bash
npm run build
```

Reload Clarity in NotePlan. Open a project note with no front-matter changes — should look identical to before.

Then add this front-matter to a test project note:

```yaml
clarity: toc, indent, focus, progress
```

Reload. Expected:
- Right sidebar appears with subheadings listed at indented levels (if note has ≥1 subheading).
- H1/H2/H3/H4 headings are colored gold/blue/orange/green.
- `.cl-section-body` is indented 20px.
- Each heading shows an eye icon on hover; eye toggles dim everything else.
- Headings containing tasks show a small pie-slice SVG before the text.

- [ ] **Step 5: Commit**

```bash
git add src/webview/ui/views.js
git commit -m "feat(clarity-view): render toc, indent, focus, progress from clarity flags"
```

---

### Task 8: Action dispatch — `scrollToHeading` and `toggleHeadingFocus`

**Files:**
- Modify: `src/webview/index.js` (the `attachMainEventListeners` switch around line 122)

The TOC clicks are dispatched from `toc.js`'s own listener (Task 5). What we still need: the eye-icon click inside `#cl-main` (`data-action="toggleHeadingFocus"`).

- [ ] **Step 1: Add imports**

At the top of `src/webview/index.js`, near the other ui imports, add:

```javascript
import { toggleHeadingFocusUI } from './ui/focus-mode.js';
```

- [ ] **Step 2: Add the action case**

Inside the `switch (action) { ... }` block in `attachMainEventListeners` (around line 122), add a new case after `toggleHeadingCollapse`:

```javascript
      case 'toggleHeadingFocus': {
        var fLine = parseInt(target.dataset.lineIndex, 10);
        if (isNaN(fLine) || !State.currentNoteFilename) break;
        var heading = target.closest('.cl-note-heading');
        if (!heading) break;
        toggleHeadingFocusUI(heading);
        sendMessageToPlugin('toggleHeadingFocus', JSON.stringify({
          filename: State.currentNoteFilename,
          lineIndex: fLine,
        }));
        break;
      }
```

- [ ] **Step 3: Build**

```bash
npm run build
```

Manual check: with `clarity: focus` set on a note, clicking the eye icon on a heading should immediately dim everything else and persist a `👀` marker on that heading in the note file (verify by reloading — focus state should survive).

(The persistence half of this depends on Task 9; until then, focus toggles work for the current session only.)

- [ ] **Step 4: Commit**

```bash
git add src/webview/index.js
git commit -m "feat(clarity-view): dispatch toggleHeadingFocus action"
```

---

### Task 9: Host-side `toggleHeadingFocus` handler

**Files:**
- Modify: `script.js` (add a new `case` right after `case 'toggleHeadingCollapse'` at line 256–269)

Same shape as `toggleHeadingCollapse`: locate the paragraph, mutate the content to add/remove the `👀` marker, write it back. No echo to the webview — the optimistic UI already reflects the change.

- [ ] **Step 1: Add the case**

Insert this case after the closing `}` of the `toggleHeadingCollapse` case (line ~269) and before `case 'toggleTask': {`:

```javascript
      case 'toggleHeadingFocus': {
        var fNote = findNoteByFilename(msg.filename);
        if (!fNote) break;
        var fPara = findParagraph(fNote, msg.lineIndex);
        if (!fPara) break;
        var fContent = (fPara.content || '');
        // Donote/Clarity convention: trailing 👀 (U+1F440) marks a focused heading.
        // Strip if present, append before any existing collapse marker (…) otherwise.
        var hasCollapse = /…\s*$/.test(fContent);
        var withoutMarkers = fContent.replace(/\s*…\s*$/, '').replace(/\s*👀\s*$/, '');
        var hadFocus = /👀/.test(fContent);
        var rebuilt;
        if (hadFocus) {
          rebuilt = hasCollapse ? (withoutMarkers + ' …') : withoutMarkers;
        } else {
          rebuilt = hasCollapse ? (withoutMarkers + ' 👀 …') : (withoutMarkers + ' 👀');
        }
        fPara.content = rebuilt;
        fNote.updateParagraph(fPara);
        break;
      }
```

(Notes on encoding: `👀` is U+1F440, a surrogate pair `👀` in UTF-16. The webview-side regexes use the literal emoji directly, which JavaScript handles correctly; the host side uses the escape form because some NotePlan plugin runtimes have been finicky about non-ASCII literals in `script.js` — match what `toggleHeadingCollapse` does, which uses `…` for `…`.)

- [ ] **Step 2: Manual check**

Reload Clarity. On a note with `clarity: focus`, click an eye icon. Open the note source in NotePlan's normal editor — the heading line should now end with `👀`. Click the eye again — the `👀` should be gone.

Combined collapse + focus: collapse the same heading (chevron), then focus it. Open source — heading should end with `👀 …` (focus before collapse). Toggle focus off — should leave just `…`.

- [ ] **Step 3: Commit**

```bash
git add script.js
git commit -m "feat(clarity-view): host handler for toggleHeadingFocus (👀 marker)"
```

---

### Task 10: Project-metadata modal — Clarity-view chips

**Files:**
- Modify: `src/webview/ui/modals.js` (in `openNoteMetaModal`, around lines 222–358)

- [ ] **Step 1: Add the import**

At the top of `src/webview/ui/modals.js`, add:

```javascript
import { parseClarityFlags, serializeClarityFlags } from '../lib/clarity-flags.js';
```

- [ ] **Step 2: Initialize the draft and read existing flags**

In `openNoteMetaModal`, find the existing draft initialization (around line 232–234):

```javascript
  var dueVal = fm.due || '';
  var reviewedVal = fm.reviewed || '';
  var reviewVal = fm.review || '';
```

Immediately after, add:

```javascript
  var clarityFlags = parseClarityFlags(fm);
```

- [ ] **Step 3: Add the chip row to the modal HTML**

Find the closing of the "Review Schedule" row in the modal template (around line 280) — the `</div>` immediately before `'<div class="cl-meta-actions">'`. Insert a new row before the actions block:

```javascript
      '<div class="cl-meta-row">' +
        '<label class="cl-meta-label">Clarity view</label>' +
        '<div class="cl-meta-chips" data-field="clarity-chips">' +
          '<button type="button" class="cl-meta-chip' + (clarityFlags.toc ? ' cl-meta-chip-active' : '') + '" data-flag="toc">TOC</button>' +
          '<button type="button" class="cl-meta-chip' + (clarityFlags.indent ? ' cl-meta-chip-active' : '') + '" data-flag="indent">Indent</button>' +
          '<button type="button" class="cl-meta-chip' + (clarityFlags.focus ? ' cl-meta-chip-active' : '') + '" data-flag="focus">Focus</button>' +
          '<button type="button" class="cl-meta-chip' + (clarityFlags.progress ? ' cl-meta-chip-active' : '') + '" data-flag="progress">Progress</button>' +
        '</div>' +
      '</div>' +
```

- [ ] **Step 4: Wire chip clicks**

Inside the overlay click listener (around lines 315–343), after the `metaMarkReviewed` branch, add a chip toggle branch. The chip buttons don't have a `data-action`, so add a separate handler right before the `if (!target) return;` line. Replace the listener start, which currently reads:

```javascript
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) close();
    var target = e.target.closest('[data-action]');
    if (!target) return;
```

with:

```javascript
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) close();
    var chip = e.target.closest('.cl-meta-chip');
    if (chip && overlay.contains(chip)) {
      chip.classList.toggle('cl-meta-chip-active');
      return;
    }
    var target = e.target.closest('[data-action]');
    if (!target) return;
```

- [ ] **Step 5: Include the clarity value in the save payload**

In the `save` function (around line 302–313), replace:

```javascript
  function save() {
    readInputs();
    var updates = {
      type: draft.type || null,
      status: draft.status || null,
      due: draft.due || null,
      reviewed: draft.reviewed || null,
      review: draft.review || null,
    };
    sendMessageToPlugin('updateNoteFrontmatter', JSON.stringify({ filename: nc.filename, updates: updates }));
    close();
  }
```

with:

```javascript
  function save() {
    readInputs();
    var chipFlags = { toc: false, indent: false, focus: false, progress: false };
    var chips = overlay.querySelectorAll('.cl-meta-chip');
    for (var ci = 0; ci < chips.length; ci++) {
      if (chips[ci].classList.contains('cl-meta-chip-active')) {
        chipFlags[chips[ci].dataset.flag] = true;
      }
    }
    var updates = {
      type: draft.type || null,
      status: draft.status || null,
      due: draft.due || null,
      reviewed: draft.reviewed || null,
      review: draft.review || null,
      clarity: serializeClarityFlags(chipFlags), // null if none selected → removes the key
    };
    sendMessageToPlugin('updateNoteFrontmatter', JSON.stringify({ filename: nc.filename, updates: updates }));
    close();
  }
```

- [ ] **Step 6: Build + manual check**

```bash
npm run build
```

Reload Clarity. Open the project menu (three-dots) → "Project metadata". The modal should now have a fourth row labeled "Clarity view" with four chips. Toggle some on, hit Save. Open the note source — the `clarity:` line should reflect the chips (e.g. `clarity: toc, indent`). Reopen the modal — chips should reflect the saved state. Untoggling all and saving should remove the `clarity:` line entirely.

- [ ] **Step 7: Commit**

```bash
git add src/webview/ui/modals.js
git commit -m "feat(clarity-view): clarity-view chips in project metadata modal"
```

---

### Task 11: End-to-end manual verification

**Files:** none — verification only.

- [ ] **Step 1: Test each token independently**

Create a scratch project note in a test folder with several headings, some containing open + done tasks. Test in this order, building from each previous state:

1. **Baseline:** No `clarity:` key. View should look exactly as before — no right sidebar, default heading colors, no eye icons, no pies.

2. **`clarity: toc`** — Right sidebar appears with subheadings (title H1 omitted). Indent ladder visible (level 1 bold, level 2/3/4 progressively indented). Click an item → smooth scroll to that heading. Scroll up/down → topmost visible heading's item gets `.active` styling.

3. **TOC with only a title and no subheadings** — right sidebar should not render at all (no empty panel).

4. **`clarity: toc, indent`** — Headings get colored (H1 gold, H2 blue, H3 orange, H4 green). Section bodies indent 20px each level deep.

5. **`clarity: toc, indent, focus`** — Eye icon visible on heading hover. Click it → that heading's section stays visible, the rest dims to 22% opacity. Click another heading's eye → both sections + their ancestors stay visible (multi-focus). Click an active eye → it un-focuses. Reload the note (cmd-r in the Clarity window) — focused headings stay focused (`👀` marker persisted to disk).

6. **`clarity: toc, indent, focus, progress`** — Pies appear on every heading that contains at least one task. H2 with 3 done + 2 open shows a 60% wedge in blue (inherits H2 color from the indent palette). H3 with all done shows a filled disk with a checkmark. H4 with no tasks shows no pie.

7. **Modal round-trip** — Open Project metadata modal. Verify chips reflect current `clarity:` value. Toggle one off, save. Verify front-matter updates. Untoggle everything and save — `clarity:` line should disappear from the note.

- [ ] **Step 2: Cross-plugin compatibility (Donote)**

Open the same note in Donote. Headings with `👀` should appear focused there too. Toggle focus in Donote, return to Clarity, reload — Clarity should reflect Donote's change.

- [ ] **Step 3: Interaction tests**

- Collapse + focus on the same heading should preserve both markers (`👀 …`). Toggling collapse should not touch `👀`; toggling focus should not touch `…`.
- `State.tasksOnly` mode should not break: in tasks-only mode the indent palette and pies are still applied (since `.cl-note-h{level}` classes are absent in tasks-only — verified by spec that tasks-only uses `cl-section-heading`, so neither indent palette nor focus icons should render). This is acceptable for v1.
- Non-note views (inbox, today, etc.): right sidebar should be hidden, no eye icons, no pies.

- [ ] **Step 4: Final commit (only if any cleanup is needed)**

If verification reveals nothing to change, no commit needed. Otherwise commit small fixes individually with `fix(clarity-view): <short>` messages.

---

## Self-review notes

- All four `clarity:` tokens have at least one task each: parser (T1), pies (T2+T7), CSS (T3), TOC (T5+T7), focus (T6+T7+T8+T9), modal (T10), end-to-end (T11).
- "TOC hidden when note has no subheadings" is enforced in `renderToc` (T5) by counting `headings.length === 0`.
- Heading IDs: spec mentioned `cl-heading-{lineIndex}` but Clarity already has `data-line-index` on every heading and we use that for both TOC scroll and focus toggle — simpler, no new ID scheme needed. This deviates from the spec slightly but is functionally equivalent.
- `serializeClarityFlags` returns `null` when no flags are set, which `applyFrontmatterUpdates` already treats as "remove key" (script.js:788). Verified.
- The `👀` marker handling in `toggleHeadingFocus` preserves `…` ordering (`👀 …`). Verified against Donote's writer pattern.
- No `NOTE_CONTENT_UPDATED` echo message added. The optimistic-UI pattern matches `toggleHeadingCollapse` and the rendered DOM stays consistent with disk after a refresh.
