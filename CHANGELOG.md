# What's changed in 💎 Clarity plugin?

## [1.8.1] 2026-05-17
### Fixes
- Date-picker month-navigation arrows now work correctly.
- Calendar day cells render as uniform circles on narrow widths.
- Inline task editor auto-scrolls into view with breathing room when opened near the viewport edge.
- Saving a task no longer jumps the note scroll back to the top.

## [1.8.0] 2026-05-17
### New
- **Clarity view options** on any project note: table of contents with scroll-spy, indented section palette, focus-mode dimming per heading, and per-heading progress pie.
- Clarity flags editable from the project metadata modal.
- `toggleHeadingFocus` writes a `👀` marker back to the NotePlan note.

## [1.7.1] 2026-05-16
### New
- Upcoming view pulls tasks from future daily notes (not just project notes).
- Range dropdown to control the lookahead window directly from the Upcoming header.

### Changes
- Light-mode contrast and colour polish across the UI.

## [1.7.0] 2026-05-16
### New
- **Review cadence**: projects and areas due for review are highlighted in amber with a footer prompt.
- **Paused projects** surface in the Someday view alongside someday items.
- **Show in Clarity** command: open the current note directly in the Clarity project view.

## [1.6.0] 2026-05-12
### New
- **Keyboard shortcuts cheatsheet** opened with `?`.
- **This Evening** section in the Today view, populated via `#evening` tag.

### Fixes
- Improved light-mode contrast for task UI and overlays.
- Square checkbox in the expanded editor for checklist items.
- Non-ASCII letters accepted in tags and mentions.

## [1.5.0] 2026-05-09
### New
- **Folder filter pills** in Today, Anytime, and Someday views to scope tasks by folder.
- Recently visited projects surface first in the Cmd+/ quick-jump palette.
- New tasks added via the quick-add input are prepended to the project note.
- Completed and canceled project statuses via a `status` frontmatter field.

## [1.4.0] 2026-05-08
### New
- **Project actions dropdown** with a Move-to-archive option.
- **Project metadata modal** for editing type, deadline, and review fields.
- Project deadlines surfaced in the sidebar and project header (Things 3 style).
- `Cmd+Delete` to remove the focused or expanded task with a confirmation modal.
- Hide-non-projects toggle and dimmed UI behind the view-settings popover.
- Jump to the Clarity project view from note-grouped subheadings and task-detail chips.

### Changes
- Areas distinguished from projects with an isometric box icon.
- Today-star moved before the task title in project view; overdue tasks shown in red.
- Repeat indicator shown next to dates; future-scheduled tasks dimmed in note view.

## [1.3.0] 2026-04-25
### New
- Startup loading skeleton/spinner while data loads.
- Per-project refresh button.
- Sidebar emoji icons replaced with Things-style SVGs.
- Calendar tasks excluded from the Anytime view.

## [1.2.0] 2026-04-23
### New
- Sidebar filter panel, Things 3 progress pie per project, resizable sidebar.
- Collapsible headings synced with NotePlan's `…` convention.
- Sidebar view settings strip.
- Markdown table rendering in the note body.

### Fixes
- Duplicate title removed from note header.
- Date and note pickers flip above anchor when they would overflow the bottom of the viewport.
- Heading collapse chevron follows the text.

## [1.1.0] 2026-04-13
### New
- **Drag-and-drop task reordering** within a project note.
- Mobile layout improvements.

## [1.0.0] 2026-04-12
- Initial release: **Clarity** — a Things 3-inspired task clarity layer for NotePlan. Includes smart views for Inbox, Today, Upcoming, Anytime, Someday, and Projects; inline task editing with view/edit mode; collapsible sidebar areas; Routine plugin integration; mobile-responsive layout with slide-out sidebar; and Cmd+/ quick-jump palette.
