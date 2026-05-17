# Clarity — TOC, Visual Hierarchy, and Focus Mode

Date: 2026-05-17
Status: Approved for planning

## Goal

Port four optional view enhancements from the Donote plugin into the Clarity plugin's project (note) view. All four are off by default and opt-in per note via a single `clarity:` front-matter key. The Focus mode is wire-compatible with Donote (shares the `👀` heading marker).

## User-facing surface

### Front-matter key

A single key, `clarity`, whose value is a comma-separated list of tokens. Recognized tokens:

- `toc` — show the table-of-contents panel in the right sidebar.
- `indent` — apply heading colors and section-body indentation.
- `focus` — show eye icons on headings and enable focus-mode dimming.
- `progress` — show task-completion pie-slice indicators on headings that contain tasks.

Examples:

```yaml
---
title: Q3 Plan
clarity: toc, indent
---
```

```yaml
---
title: Big Project
clarity: toc, indent, focus
---
```

Token parsing is case-insensitive, whitespace-tolerant. Unknown tokens are ignored. Missing or empty key means no features active (current behavior).

### Project metadata modal

`openNoteMetaModal()` gains a new row labeled **Clarity view** containing four pill-shaped toggle buttons: `TOC`, `Indent`, `Focus`, `Progress`. Active state uses the existing accent/filled-pill styling used by status buttons in the same modal; inactive is the bordered/transparent variant.

On Save, the modal computes the `clarity` value by joining the active token names with `, ` in canonical order (`toc, indent, focus, progress`). If none are active, it sends `clarity: null` so the existing `applyFrontmatterUpdates` removes the key entirely.

The new field is included in the existing `updateNoteFrontmatter` message — no new message type for metadata.

## Feature: Table of Contents (token `toc`)

### Visibility rules

- Active only in note view.
- Active only when the note's parsed `clarity` flags include `toc`.
- **Active only when there is at least one subheading.** The H1 that mirrors the note title (if present) is filtered out before counting. If the filtered list is empty, the right sidebar is not rendered at all (no empty panel, no layout shift).

### Layout

A new element `#cl-right-sidebar` is added as a flex sibling of `#cl-main` inside `#cl-root`, after `#cl-main`. Width fixed at 220px in v1 (no resizer). The sidebar is conditionally rendered — when not active it is not in the DOM, so `#cl-main` reclaims its width without layout calculations.

### Content

The TOC is built from `State.noteContent.paragraphs`, filtering to heading paragraphs (`p.type === 'title'`). For each heading we emit:

```html
<button class="cl-toc-item cl-toc-level-{level}"
        data-action="scrollToHeading"
        data-heading-id="{id}">
  {plain-text heading title}
</button>
```

The `id` matches an `id` attribute we attach to the corresponding `.cl-note-heading` element in `renderNoteView` (form: `cl-heading-{lineIndex}`). If headings already have stable IDs, those are reused.

CSS indent ladder mirrors Donote's:

- `.cl-toc-level-1` → `padding-left: 8px; font-weight: 600;`
- `.cl-toc-level-2` → `padding-left: 16px;`
- `.cl-toc-level-3` → `padding-left: 24px; font-size: 11px;`
- `.cl-toc-level-4` through `-6` → `padding-left: 32px; font-size: 11px;`

### Click behavior

`scrollToHeading` action handler finds the heading by ID inside `#cl-main` and calls `mainEl.scrollTo({ top: heading.offsetTop - 20, behavior: 'smooth' })`.

### Scroll-spy

A scroll listener on `#cl-main`, debounced 50ms, finds the topmost heading whose `offsetTop <= scrollTop + 60` and adds `.active` to the matching TOC item. Class added via `cl-toc-item.active { color: var(--cl-accent); font-weight: 600; }`.

The listener is attached once per render in the note-view `mount` step and removed on unmount/view change. It's a no-op when the TOC isn't rendered (the listener early-returns if `#cl-right-sidebar` is missing).

## Feature: Visual hierarchy (token `indent`)

CSS-only feature. When `indent` is active, the note root element (`#cl-main > .cl-note-body` or equivalent — confirmed during implementation) receives the class `cl-note-indented`. Rules:

- `.cl-note-indented .cl-note-h1 { color: var(--cl-gold, #F5A524); }`
- `.cl-note-indented .cl-note-h2 { color: var(--cl-blue, #3B82F6); }`
- `.cl-note-indented .cl-note-h3 { color: var(--cl-orange, #F97316); }`
- `.cl-note-indented .cl-note-h4 { color: var(--cl-green, #10B981); }`
- `.cl-note-indented .cl-section-body { padding-left: 20px; }`

Existing `.cl-section-body` wrapping is already produced by `renderNoteView`'s stack-based heading walker, so no JS change is needed beyond adding the root class. New CSS variables `--cl-gold`, `--cl-blue`, `--cl-green` are added in light and dark theme blocks if not already present (`--cl-orange` already exists).

## Feature: Focus mode (token `focus`)

### Compatibility

The focus marker is the trailing emoji `👀` on a heading's text — identical to Donote, so the two plugins share state via the note file. If a heading line ends with both `…` (Donote's collapse marker) and `👀`, both markers are preserved in stable order matching Donote (`👀` immediately before `…` if both present — exact order verified against Donote's `renderNoteToHTML` writer during implementation).

### Rendering

When `focus` is active:

- During render, strip trailing `👀` from each heading's display text and set `data-focused="true"` on its `.cl-note-heading` element.
- Append a small button to each heading:

  ```html
  <span class="cl-heading-focus" data-action="toggleHeadingFocus"
        data-line-index="{lineIndex}" title="Focus on this section">
    <i class="fa-regular fa-eye"></i>
  </span>
  ```

  Icon swaps to `fa-solid fa-eye` when focused.

### Toggle action

Webview sends a new message `toggleHeadingFocus` with payload `{ filename, lineIndex }`. Host handler in `clarityEvents.js`:

1. Locates the note, splits content into lines.
2. On the target line (validated to start with `#`), toggles the trailing `👀` marker — stripping if present, appending if not (preserving any trailing `…`).
3. Writes back via `note.content = newContent`.
4. Re-parses front-matter for completeness (no-op in most cases) and broadcasts an existing or new "note content updated" message that triggers a note-view re-render. If a clean re-render hook doesn't exist, we add `NOTE_CONTENT_UPDATED` with the new content and a flag to preserve `#cl-main` scroll position.

### Dimming algorithm

After render and after every toggle, `applyFocusMode()`:

1. Collects all `.cl-note-heading[data-focused="true"]` in `#cl-main`.
2. If none, removes `.cl-dimmed` from everything and exits.
3. Otherwise, builds a "spared" set:
   - Each focused heading.
   - Its following `.cl-section-body` (and all descendants).
   - All ancestor headings + their direct `.cl-section-body` wrappers (so the path to the focused section stays visible).
4. Every direct child of `#cl-main` (and headings inside section bodies) that isn't in the spared set gets `.cl-dimmed`. Others have `.cl-dimmed` removed.

CSS: `.cl-dimmed { opacity: 0.22; transition: opacity 0.2s; }` and `.cl-dimmed .cl-heading-focus { opacity: 0; }` so the eye icon disappears in dimmed regions.

Multiple focused headings are allowed — the spared set is a union.

### Persistence

Focus state is persisted on disk via the `👀` marker, so it survives refresh, app restart, and is shared with Donote. No webview-local state.

## Feature: Heading progress pies (token `progress`)

### Counting rules

Mirrors Donote's `computeHeadingTaskStats` exactly so the two plugins always show the same number:

- Walk note body lines once. Maintain a stack of open headings (level-aware: a heading pops every entry on the stack with `level >= incoming`).
- Skip code fences (`` ``` `` toggles in/out).
- Skip separator headings (text matches `^[-*_]{3,}$` after stripping collapse/focus markers).
- A task line is any of: checklist (`+ `), bracket task (`- [ ]`, `- [x]`, `- [-]`, also `*` variant), or bare-star task (`* …` not followed by bold/bracket).
- Cancelled tasks (`[-]`) are excluded from both total and done.
- Done tasks (`[x]` or containing `@done(`) count toward done.
- Every counted task is credited to **all** ancestor headings on the stack, so an H1 pie reflects completion across its entire section.

The result is an array of `{ total, done }` indexed in heading-render order. Headings with `total === 0` get no pie.

### Rendering

When `progress` is active, `renderNoteView` computes the stats array once per render and passes `{ done, total }` per heading. The pie is inserted as the first child of `.cl-note-heading`, before the heading text:

```html
<span class="cl-heading-progress" aria-hidden="true">
  <svg viewBox="0 0 18 18" width="18" height="18">…</svg>
</span>
```

SVG output matches Donote (`buildHeadingProgressSVG`): 18×18, radius 7, stroke-width 2.25. Background ring at 40% opacity in `currentColor`. Progress wedge as a filled `path` from 12 o'clock clockwise. At 100% complete, switches to Things-3 style: filled disk with a checkmark punched through in the page background color (`var(--cl-bg)`).

### CSS

```css
.cl-heading-progress { display: inline-block; vertical-align: -3px; margin-right: 8px; flex-shrink: 0; }
```

Combines cleanly with the `indent` heading colors: the pie inherits `currentColor`, so an H2 pie will be blue, H3 orange, etc. Without `indent`, the pie inherits the default text color.

### Interaction with focus mode

Pies inside `.cl-dimmed` regions are dimmed along with everything else (no special rule needed — `opacity` cascades to the SVG).

## Files touched

- `src/webview/ui/modals.js` — four pill toggles in `openNoteMetaModal`, include `clarity` token list in save payload.
- `src/webview/ui/views.js` — render `#cl-right-sidebar` conditionally; add stable IDs to `.cl-note-heading`; add `cl-note-indented` root class; render eye icon when focus flag set; strip `👀` from displayed heading text and set `data-focused`; compute + inject progress pies when progress flag set.
- `src/webview/lib/heading-progress.js` *(new)* — `computeHeadingTaskStats(paragraphs)` and `buildHeadingProgressSVG(done, total)`, ported from Donote.
- `src/webview/lib/clarity-flags.js` *(new)* — `parseClarityFlags(frontmatter)` → `{ toc, indent, focus }`.
- `src/webview/ui/toc.js` *(new)* — `buildTocHTML(paragraphs, flags)`, `attachTocScrollSpy()`, click handler for `scrollToHeading`.
- `src/webview/ui/focus-mode.js` *(new)* — `applyFocusMode(rootEl)` and `toggleHeadingFocus` click handler that posts to host.
- `src/webview/messages.js` — wire `toggleHeadingFocus` outbound and `NOTE_CONTENT_UPDATED` inbound (if a suitable refresh path doesn't already exist; otherwise reuse).
- `clarityEvents.js` — `toggleHeadingFocus` message handler + line-rewriting helper; broadcast updated content.
- `clarity.css` — TOC styles, heading colors under `.cl-note-indented`, `.cl-section-body` indent rule, `.cl-dimmed`, `.cl-heading-focus`, right-sidebar layout.

## Out of scope (v1)

- Persisting focus state via anything other than `👀`.
- Resizable right sidebar.
- TOC for non-note views.
- New collapse/expand behavior (Clarity already has it; we don't touch it).
- Settings-level defaults (each note opts in individually via its own front-matter).
- Migrating existing front-matter or auto-suggesting the `clarity` key.

## Open questions

None blocking. Two minor verification items to resolve during implementation:

1. Exact stable-id format for headings inside `renderNoteView` — reuse if present, otherwise `cl-heading-{lineIndex}`.
2. Whether a generic `NOTE_CONTENT_UPDATED` refresh path already exists for the project view; if so, reuse it. If not, add it as the smallest possible change.
