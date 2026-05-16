# Review-due indicator for projects and areas

## Goal

Make it visually obvious when a project or area is due for a review, and offer a one-click way to mark it reviewed from the note view.

Today, the plugin already reads `review:` and `reviewed:` from frontmatter inside the project metadata modal ([clarityEvents.js:3149](../../../clarityEvents.js)) and provides a "Mark as reviewed" button there, but it does nothing with that data outside the modal — the sidebar circles and note-header cubes are uniformly blue (or whatever `bg-color-dark` is set to) regardless of review state.

## Semantics

Review state is computed from two frontmatter keys, identical to the `asktru.WeeklyReview` plugin so behaviour stays in sync:

- `review:` — cadence string. Format: `^(\d+)([dwmqy])$` (case-insensitive). Days per unit: `d=1, w=7, m=30, q=91, y=365`. Invalid or missing → no review tracking for this note.
- `reviewed:` — last-reviewed date in `YYYY-MM-DD`. Missing means never reviewed.

Computed:

- `nextReviewDate` = `reviewed + cadence` (parsed as local date). When `reviewed:` is missing but `review:` is set, `nextReviewDate` = today (treat as due immediately).
- `reviewDueDays` = `nextReviewDate − today` in whole days. Negative = overdue, 0 = due today, positive = future.

A note is **due** when `reviewDueDays !== null && reviewDueDays <= 0`. This includes the "never reviewed" case.

Lifecycle status interaction:

- `completed` / `canceled` projects → ignored for review styling (you shouldn't be reviewing closed work). Don't recolor, don't render the footer.
- `paused` / `someday` notes → keep current muted-gray icon. The pause/someday overlay already communicates state; review urgency is not relevant for these.
- Active notes (no `status:` or `status: active`) → review styling applies.

## Component changes

### 1. Compute review fields in `script.js`

Port two helpers from `asktru.WeeklyReview/script.js` (verbatim, ~15 lines):

```js
function intervalToDays(interval) {
  if (!interval) return null;
  var match = interval.match(/^(\d+)([dwmqy])$/i);
  if (!match) return null;
  var num = parseInt(match[1], 10);
  switch (match[2].toLowerCase()) {
    case 'd': return num;
    case 'w': return num * 7;
    case 'm': return num * 30;
    case 'q': return num * 91;
    case 'y': return num * 365;
    default: return null;
  }
}

function addIntervalToDate(dateStr, interval) {
  if (!dateStr) return null;
  var days = intervalToDays(interval);
  if (days == null) return null;
  var d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}

function computeReviewDueDays(reviewedStr, reviewInterval, todayStr) {
  if (!reviewInterval) return null;
  var nextStr = reviewedStr
    ? addIntervalToDate(reviewedStr, reviewInterval)
    : todayStr;
  if (!nextStr) return null;
  var next = new Date(nextStr + 'T00:00:00');
  var today = new Date(todayStr + 'T00:00:00');
  if (isNaN(next.getTime()) || isNaN(today.getTime())) return null;
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}
```

(Note: `intervalToDays` returns `null` for invalid input here, unlike WeeklyReview's default-to-weekly. We want absence of cadence to mean "not tracked," not "default 1w.")

Wire into the two places that build `noteMeta`:

- **Scan path:** [script.js:993](../../../script.js) — after extracting `fm.status`, add:
  ```js
  reviewedDate: fm.reviewed || null,
  reviewInterval: fm.review || null,
  reviewDueDays: computeReviewDueDays(fm.reviewed, fm.review, getTodayStr()),
  ```
  `getTodayStr()` already exists in `script.js` (used at lines 592, 642, 806).
- **Refresh path:** [script.js:573](../../../script.js) — same three fields on the rebuilt `nm` object.

The note-view payload (`noteContent`) already includes raw `frontmatter`, so the view can compute on demand. But to keep the sidebar and header consistent we also drop the computed fields onto the `noteMeta` records in `State.notes`.

### 2. Amber recolor in `renderProjectIcon`

In [clarityEvents.js:655](../../../clarityEvents.js), change the color selection:

```js
var REVIEW_DUE_COLOR = '#F59E0B'; // amber-500

function renderProjectIcon(noteLike, size) {
  var s = size || 18;
  var status = noteLike.status || '';
  var isArea = noteLike.noteType === 'area';
  var muted = (status === 'paused' || status === 'someday');
  var closed = (status === 'completed' || status === 'canceled');
  var reviewDue = (noteLike.reviewDueDays != null && noteLike.reviewDueDays <= 0);

  var color;
  if (muted) color = PAUSED_COLOR;
  else if (reviewDue && !closed) color = REVIEW_DUE_COLOR;
  else color = noteLike.bgColorDark || '#3B82F6';

  // ...rest unchanged
}
```

Order matters: paused/someday wins over review-due (muted state is more important to communicate; the pause/cloud overlay tells the user the project isn't active). Closed projects keep their color.

The note-view header at [clarityEvents.js:1622](../../../clarityEvents.js) also calls `renderProjectIcon`. The note-view payload already carries `frontmatter`, so compute `reviewDueDays` inline there using a small helper in `clarityEvents.js` (mirroring the logic in `script.js` — kept duplicated rather than imported because the two files don't share a module system):

```js
// In clarityEvents.js, near renderProjectIcon
function reviewDueDaysFromFm(fm) {
  if (!fm || !fm.review) return null;
  // Same intervalToDays / addIntervalToDate as in script.js, inlined.
  // ...
}

// Then in renderNoteView:
html += renderProjectIcon({
  noteType: isArea ? 'area' : 'project',
  bgColorDark: nc.bgColorDark,
  taskCount: taskCount,
  doneCount: doneCount,
  status: fm.status,
  reviewDueDays: reviewDueDaysFromFm(fm),
}, 24);
```

The footer in §3 uses the same helper.

### 3. Review footer in `renderNoteView`

After the `cl-task-list cl-note-content` block closes (just before `renderNoteView` returns its assembled HTML), append a footer **only when the note is review-due and not muted/closed**:

```html
<div class="cl-review-footer">
  <span class="cl-review-due-label">Review due today</span>
  <button class="cl-review-mark-btn" type="button" data-action="markReviewedFromFooter">
    Mark as Reviewed
  </button>
</div>
```

Phrasing rules for the label:

| Condition                                                 | Text                       |
| --------------------------------------------------------- | -------------------------- |
| `review:` set, `reviewed:` missing                        | "Never reviewed"           |
| `reviewDueDays === 0`                                     | "Review due today"         |
| `reviewDueDays === -1`                                    | "Was due yesterday"        |
| `reviewDueDays` in `[-13, -2]`                            | "Was due N days ago"       |
| `reviewDueDays` in `[-29, -14]`                           | "Was due N weeks ago"      |
| `reviewDueDays <= -30`                                    | "Was due N months ago"     |

Weeks rounded down (`Math.floor(abs / 7)`), months rounded down (`Math.floor(abs / 30)`). The day range special-cases -1 ("yesterday"), and the weeks bucket (`-14..-29`) cannot produce N=1, so the only singular form needed in practice is "Was due 1 month ago" at exactly -30..-59.

### 4. Mark-as-Reviewed handler

Add an event handler for `data-action="markReviewedFromFooter"`. It dispatches the existing message — no new plugin endpoint needed:

```js
function markReviewedFromFooter() {
  var nc = State.noteContent;
  if (!nc) return;
  sendMessageToPlugin('updateNoteFrontmatter', JSON.stringify({
    filename: nc.filename,
    updates: { reviewed: State.today },
  }));
}
```

This is identical to what the metadata modal does at [clarityEvents.js:3266](../../../clarityEvents.js). The plugin already broadcasts updated frontmatter back, which triggers a note-content refresh; the footer disappears and the icon returns to its normal color on the next render tick.

## CSS

Add to `clarity.css`:

```css
.cl-review-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin: 24px 0 16px;
  padding: 10px 14px;
  border-radius: 8px;
  background: rgba(245, 158, 11, 0.12);     /* amber tint */
  border: 1px solid rgba(245, 158, 11, 0.35);
  color: var(--cl-text);
  font-size: 13px;
}

.cl-review-due-label {
  font-weight: 600;
  color: #F59E0B;
}

.cl-review-mark-btn {
  appearance: none;
  border: 1px solid rgba(245, 158, 11, 0.55);
  background: rgba(245, 158, 11, 0.18);
  color: var(--cl-text);
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
}

.cl-review-mark-btn:hover {
  background: rgba(245, 158, 11, 0.28);
}
```

Color choice (`#F59E0B`, amber-500) is warm enough to read as urgency without being alarm-red. Adjustable if the user wants more orange-leaning.

## Testing

Manual checklist:

1. **Never-reviewed project** — add `review: 1w` (no `reviewed:`) to an active project. Sidebar circle turns amber, note header icon turns amber, footer shows "Never reviewed" + button.
2. **Overdue** — `reviewed: 2026-05-01`, `review: 1w`, today=2026-05-16. Footer shows "Was due 8 days ago".
3. **Due today** — `reviewed: 2026-05-09`, `review: 1w`. Footer shows "Review due today".
4. **Fresh** — `reviewed: 2026-05-14`, `review: 1w`. No amber, no footer.
5. **Click "Mark as Reviewed"** — `reviewed:` updates to today's date in the underlying note; UI returns to normal blue immediately.
6. **Custom `bg-color-dark`** — set a project to green via `bg-color-dark: emerald-600`. When overdue, icon switches to amber. When marked reviewed, icon returns to green.
7. **Paused + overdue** — `status: paused` with overdue review. Icon stays muted gray (paused wins), no footer.
8. **Completed + stale review** — `status: completed` with old `reviewed:` date. Icon keeps project color, no footer.
9. **Area cube** — same flow with `type: area`. Cube recolors amber when due.
10. **Invalid cadence** — `review: foo`. Should behave as if no `review:` was set (no amber, no footer).

## Out of scope

- Snooze / postpone-review button (could be added later as a second footer action).
- Per-cadence visual intensity (slightly redder for very overdue, etc.) — easy to add to `REVIEW_DUE_COLOR` selection if needed.
- Migrating legacy `@review(...)` / `@reviewed(...)` mentions to frontmatter. WeeklyReview already has a "Turn into project" command for that.
- Surfacing review status in views other than the sidebar and the note view (e.g. Today/Upcoming). Those views are task-oriented, not project-oriented.
