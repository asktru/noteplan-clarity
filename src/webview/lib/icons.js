// SVG builders for project/area icons, progress pies, sidebar view icons,
// status overlays (pause/check/X), and deadline-flag badges.

import { esc, daysUntilDue } from './helpers.js';
import { isReviewDue, PAUSED_COLOR, REVIEW_DUE_COLOR } from './review.js';

// Status overlays sized to an 18-unit viewBox so they scale with the underlying icon.
export function buildPauseOverlay(size) {
  var s = size || 18;
  return '<svg class="cl-status-overlay" width="' + s + '" height="' + s + '" viewBox="0 0 18 18" aria-hidden="true">' +
    '<rect x="6" y="5.5" width="1.8" height="7" rx="0.4" fill="#fff" stroke="#374151" stroke-width="0.35"/>' +
    '<rect x="10.2" y="5.5" width="1.8" height="7" rx="0.4" fill="#fff" stroke="#374151" stroke-width="0.35"/>' +
    '</svg>';
}

export function buildCheckOverlay(size) {
  var s = size || 18;
  return '<svg class="cl-status-overlay" width="' + s + '" height="' + s + '" viewBox="0 0 18 18" aria-hidden="true">' +
    '<path d="M6.6 9.3 L8.4 11.1 L11.6 7.6" fill="none" stroke="#1f2937" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>' +
    '</svg>';
}

export function buildXOverlay(size) {
  var s = size || 18;
  return '<svg class="cl-status-overlay" width="' + s + '" height="' + s + '" viewBox="0 0 18 18" aria-hidden="true">' +
    '<path d="M7.2 7.2 L10.8 10.8 M10.8 7.2 L7.2 10.8" fill="none" stroke="#1f2937" stroke-width="1.5" stroke-linecap="round"/>' +
    '</svg>';
}

// Render a project/area icon with the appropriate color and status overlay.
//   paused / someday → muted gray (paused also gets a pause-bars overlay)
//   completed / canceled (projects only) → keep project color, force a full pie, overlay check or X
export function renderProjectIcon(noteLike, size) {
  var s = size || 18;
  var status = noteLike.status || '';
  var isArea = noteLike.noteType === 'area';
  var muted = (status === 'paused' || status === 'someday');
  var reviewDue = isReviewDue(noteLike.reviewDueDays, status);
  var color;
  if (muted) color = PAUSED_COLOR;
  else if (reviewDue) color = REVIEW_DUE_COLOR;
  else color = noteLike.bgColorDark || '#3B82F6';
  var inner;
  if (isArea) {
    inner = buildAreaIcon(color, s);
  } else {
    var forceFull = !isArea && (status === 'completed' || status === 'canceled');
    var pct = forceFull ? 100 : (noteLike.taskCount > 0 ? Math.round((noteLike.doneCount / noteLike.taskCount) * 100) : 0);
    inner = buildProgressPie(pct, color, s);
  }
  var overlay = '';
  if (status === 'paused') overlay = buildPauseOverlay(s);
  else if (!isArea && status === 'completed') overlay = buildCheckOverlay(s);
  else if (!isArea && status === 'canceled') overlay = buildXOverlay(s);
  if (!overlay) return inner;
  return '<span class="cl-icon-stack" style="width:' + s + 'px;height:' + s + 'px">' + inner + overlay + '</span>';
}

// Things 3-style outline ring with a filled pie slice growing clockwise from 12 o'clock.
export function buildProgressPie(pct, color, size) {
  var s = size || 18;
  var svg = '<svg class="cl-progress-ring" width="' + s + '" height="' + s + '" viewBox="0 0 18 18">';
  svg += '<circle cx="9" cy="9" r="7" fill="none" stroke="' + color + '" stroke-width="1.5"/>';
  if (pct >= 100) {
    svg += '<circle cx="9" cy="9" r="5.2" fill="' + color + '"/>';
  } else if (pct > 0) {
    var r = 5.2;
    var angle = (pct / 100) * 360;
    var endRad = (angle - 90) * Math.PI / 180;
    var endX = 9 + r * Math.cos(endRad);
    var endY = 9 + r * Math.sin(endRad);
    var largeArc = angle > 180 ? 1 : 0;
    svg += '<path d="M9,9 L9,' + (9 - r) +
      ' A' + r + ',' + r + ' 0 ' + largeArc + ',1 ' + endX.toFixed(3) + ',' + endY.toFixed(3) +
      ' Z" fill="' + color + '"/>';
  }
  svg += '</svg>';
  return svg;
}

var DEADLINE_FLAG_SVG = '<svg class="cl-deadline-flag" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 3a1 1 0 0 1 1 1v17a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1zm2 1.5h11.2a.6.6 0 0 1 .49.94L17.5 9l2.19 3.56a.6.6 0 0 1-.51.94H8z"/></svg>';

// Compact flag badge for sidebar rows (icon + day count, or icon-only when due today).
export function buildDeadlineBadgeCompact(dueStr) {
  var diff = daysUntilDue(dueStr);
  if (diff === null) return '';
  var cls, text;
  if (diff > 0) { cls = 'cl-deadline-future'; text = diff + 'd'; }
  else if (diff === 0) { cls = 'cl-deadline-today'; text = ''; }
  else { cls = 'cl-deadline-overdue'; text = (-diff) + 'd'; }
  return '<span class="cl-deadline cl-deadline-compact ' + cls + '" title="Due ' + esc(dueStr) + '">' +
    DEADLINE_FLAG_SVG + (text ? '<span class="cl-deadline-text">' + text + '</span>' : '') +
    '</span>';
}

// Verbose flag for the project view header (Things 3 style):
//   <flag> Deadline: <bright date>   <dim countdown>
export function buildDeadlineBadgeVerbose(dueStr) {
  var diff = daysUntilDue(dueStr);
  if (diff === null) return '';
  var cls, suffix;
  if (diff > 0) { cls = 'cl-deadline-future'; suffix = diff + ' day' + (diff === 1 ? '' : 's') + ' left'; }
  else if (diff === 0) { cls = 'cl-deadline-today'; suffix = 'Today'; }
  else { cls = 'cl-deadline-overdue'; suffix = (-diff) + ' day' + (diff === -1 ? '' : 's') + ' overdue'; }
  return '<span class="cl-deadline cl-deadline-verbose ' + cls + '">' +
    DEADLINE_FLAG_SVG +
    '<span class="cl-deadline-primary">Deadline: ' + esc(dueStr) + '</span>' +
    '<span class="cl-deadline-countdown">' + suffix + '</span>' +
    '</span>';
}

// Three-faced isometric cube tinted by the area's color. No progress indication.
export function buildAreaIcon(color, size) {
  var s = size || 18;
  var c = color || '#3B82F6';
  var svg = '<svg class="cl-area-icon" width="' + s + '" height="' + s + '" viewBox="0 0 18 18">';
  // Top face (rhombus)
  svg += '<path d="M9 2.6 L15.4 6.3 L9 10 L2.6 6.3 Z" fill="' + c + '" fill-opacity="0.95"/>';
  // Left face
  svg += '<path d="M2.6 6.3 L9 10 L9 15.6 L2.6 11.9 Z" fill="' + c + '" fill-opacity="0.55"/>';
  // Right face
  svg += '<path d="M15.4 6.3 L9 10 L9 15.6 L15.4 11.9 Z" fill="' + c + '" fill-opacity="0.78"/>';
  // Subtle outline along top edges
  svg += '<path d="M9 2.6 L15.4 6.3 L9 10 L2.6 6.3 Z" fill="none" stroke="' + c + '" stroke-width="0.6" stroke-opacity="0.9"/>';
  svg += '</svg>';
  return svg;
}

// Five sidebar view icons: inbox, today, upcoming, anytime, someday.
export function getViewIcon(id, size) {
  var s = size || 18;
  var attrs = 'width="' + s + '" height="' + s + '" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"';
  switch (id) {
    case 'inbox':
      // Blue tray with curved chute
      return '<svg ' + attrs + '>' +
        '<path d="M4.2 4.2h15.6a1.4 1.4 0 0 1 1.4 1.4v9.2a3 3 0 0 1-3 3H5.8a3 3 0 0 1-3-3V5.6a1.4 1.4 0 0 1 1.4-1.4z" fill="#1E88E5"/>' +
        '<path d="M3 13.2h5.2l1.3 2a1 1 0 0 0 .85.45h3.3a1 1 0 0 0 .85-.45l1.3-2H21v1.6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" fill="#1565C0"/>' +
        '</svg>';
    case 'today':
      // Chunky 5-point star with inner shadow on lower half
      return '<svg ' + attrs + '>' +
        '<path d="M12 2.2l2.93 6.06 6.66.6a.5.5 0 0 1 .29.87l-5.04 4.43 1.52 6.55a.5.5 0 0 1-.74.54L12 17.85l-5.62 3.4a.5.5 0 0 1-.74-.54l1.52-6.55L2.12 9.73a.5.5 0 0 1 .29-.87l6.66-.6z" fill="#FFB300"/>' +
        '<path d="M12 17.85l-5.62 3.4a.5.5 0 0 1-.74-.54l1.52-6.55L2.12 9.73a.5.5 0 0 1 .29-.87l6.66-.6L12 2.2z" fill="#fff" fill-opacity="0.18"/>' +
        '</svg>';
    case 'upcoming':
      // Pink calendar with header band, binding pegs, highlighted day
      return '<svg ' + attrs + '>' +
        '<rect x="2.5" y="5" width="19" height="16" rx="2.5" fill="#EC407A"/>' +
        '<path d="M5 5h14a2.5 2.5 0 0 1 2.5 2.5v2.2H2.5V7.5A2.5 2.5 0 0 1 5 5z" fill="#C2185B"/>' +
        '<rect x="6.4" y="2.6" width="2.2" height="4.8" rx="1.1" fill="#7B1538"/>' +
        '<rect x="15.4" y="2.6" width="2.2" height="4.8" rx="1.1" fill="#7B1538"/>' +
        '<rect x="6.6" y="2.8" width="1.8" height="1.4" rx="0.9" fill="#fff" fill-opacity="0.35"/>' +
        '<rect x="15.6" y="2.8" width="1.8" height="1.4" rx="0.9" fill="#fff" fill-opacity="0.35"/>' +
        '<circle cx="12" cy="15" r="3" fill="#fff"/>' +
        '<rect x="2.5" y="9.7" width="19" height="0.6" fill="#000" fill-opacity="0.12"/>' +
        '</svg>';
    case 'anytime':
      // Three isometric stacked layers with shaded sides
      return '<svg ' + attrs + '>' +
        '<path d="M12 14.5l-9-4.25v1.5L12 16l9-4.25v-1.5z" fill="#00695C"/>' +
        '<path d="M12 18l-9-4.25v1.5L12 19.5l9-4.25v-1.5z" fill="#00695C"/>' +
        '<path d="M12 3L3 7.25 12 11.5l9-4.25z" fill="#4DB6AC"/>' +
        '<path d="M12 7.5L3 11.75 12 16l9-4.25z" fill="#26A69A"/>' +
        '<path d="M12 12L3 16.25 12 20.5l9-4.25z" fill="#00897B"/>' +
        '</svg>';
    case 'someday':
      // Cardboard moving box: body, lid, packing tape, handle hole
      return '<svg ' + attrs + '>' +
        '<path d="M3 9.5h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#A77855"/>' +
        '<path d="M3.5 4.5h17a1 1 0 0 1 1 1V9.5h-19V5.5a1 1 0 0 1 1-1z" fill="#CB9970"/>' +
        '<rect x="3" y="9.2" width="18" height="0.8" fill="#000" fill-opacity="0.2"/>' +
        '<rect x="11" y="4.5" width="2" height="16" fill="#7A5238" fill-opacity="0.45"/>' +
        '<rect x="9.4" y="12.6" width="5.2" height="1.8" rx="0.9" fill="#3E2615"/>' +
        '<rect x="3.5" y="4.5" width="17" height="0.6" fill="#fff" fill-opacity="0.25"/>' +
        '</svg>';
  }
  return '';
}
