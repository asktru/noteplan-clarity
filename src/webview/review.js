// Review-cadence helpers. Mirror of the same logic in script.js (plugin side)
// — the duplication exists because script.js and clarityEvents.js can't share
// a module system at runtime; semantics must match `asktru.WeeklyReview`.

import { State } from './state.js';

// Color used for paused/someday projects/areas (overrides bgColorDark in icons).
export var PAUSED_COLOR = '#9CA3AF';

// Color used when a project/area is due (or overdue) for review. Overrides
// bgColorDark in the project/area icon. Matches the amber accent in CSS.
export var REVIEW_DUE_COLOR = '#F59E0B';

export function reviewIntervalToDays(interval) {
  if (!interval) return null;
  var match = String(interval).match(/^(\d+)([dwmqy])$/i);
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

// Compute days from today to next review date. See script.js#computeReviewDueDays.
export function reviewDueDaysFromFm(fm) {
  if (!fm) return null;
  var interval = fm.review;
  if (!interval || !reviewIntervalToDays(interval)) return null;
  var todayStr = State.today;
  var reviewedStr = fm.reviewed;
  var nextStr;
  if (reviewedStr) {
    var days = reviewIntervalToDays(interval);
    var d = new Date(reviewedStr + 'T00:00:00');
    if (isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + days);
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var dd = String(d.getDate()).padStart(2, '0');
    nextStr = y + '-' + m + '-' + dd;
  } else {
    // No reviewed: date → treat as due today.
    nextStr = todayStr;
  }
  var next = new Date(nextStr + 'T00:00:00');
  var today = new Date(todayStr + 'T00:00:00');
  if (isNaN(next.getTime()) || isNaN(today.getTime())) return null;
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

// True when the note should display the amber recolor + review footer.
// Excludes muted (paused/someday) and closed (completed/canceled) lifecycle states.
export function isReviewDue(reviewDueDays, status) {
  if (reviewDueDays == null || reviewDueDays > 0) return false;
  if (status === 'paused' || status === 'someday') return false;
  if (status === 'completed' || status === 'canceled') return false;
  return true;
}

// Human phrasing for the review-due footer.
export function reviewDueLabel(reviewDueDays, hasReviewedDate) {
  if (reviewDueDays == null) return '';
  if (!hasReviewedDate) return 'Never reviewed';
  if (reviewDueDays === 0) return 'Review due today';
  if (reviewDueDays === -1) return 'Was due yesterday';
  var abs = -reviewDueDays;
  if (abs <= 13) return 'Was due ' + abs + ' days ago';
  if (abs <= 29) return 'Was due ' + Math.floor(abs / 7) + ' weeks ago';
  var months = Math.floor(abs / 30);
  return 'Was due ' + months + ' month' + (months === 1 ? '' : 's') + ' ago';
}
