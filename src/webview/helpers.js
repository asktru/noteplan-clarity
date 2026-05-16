// Pure utility helpers: HTML escaping, capitalize, and a small family of date
// parsing/formatting/arithmetic functions. `daysUntilDue` is the only one that
// reads from shared state (State.today as the reference "now").

import { State } from './state.js';

export function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// Parse a YYYY-MM-DD string as a local-time Date (avoids UTC offset surprises).
export function parseDateLocal(s) {
  if (!s) return null;
  var p = String(s).split('-');
  if (p.length < 3) return null;
  var y = parseInt(p[0], 10), m = parseInt(p[1], 10), d = parseInt(p[2], 10);
  if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
  return new Date(y, m - 1, d);
}

// Days from State.today to dueStr (positive = future, 0 = today, negative = overdue).
export function daysUntilDue(dueStr) {
  var due = parseDateLocal(dueStr);
  var today = parseDateLocal(State.today);
  if (!due || !today) return null;
  return Math.round((due.getTime() - today.getTime()) / 86400000);
}

export function addDays(dateStr, n) {
  var parts = dateStr.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function getNextMonday(dateStr) {
  var parts = dateStr.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  var day = d.getDay();
  var daysUntilMon = (day === 0) ? 1 : (8 - day);
  d.setDate(d.getDate() + daysUntilMon);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

export function addWeeks(weekStr, n) {
  var parts = weekStr.split('-W');
  var year = parseInt(parts[0]);
  var week = parseInt(parts[1]) + n;
  while (week > 52) { year++; week -= 52; }
  return year + '-W' + String(week).padStart(2, '0');
}

export function formatDateHeader(dateStr) {
  if (!dateStr || dateStr === 'No Date') return dateStr;
  try {
    var parts = dateStr.split('-');
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ' — ' + days[d.getDay()];
  } catch (e) { return dateStr; }
}

export function formatUpcomingDateHeader(dateStr) {
  try {
    var parts = dateStr.split('-');
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var label = days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate();
    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    var tmrStr = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + String(tomorrow.getDate()).padStart(2, '0');
    if (dateStr === tmrStr) label += ' <span style="opacity:0.5;font-weight:400;">Tomorrow</span>';
    return label;
  } catch (e) { return dateStr; }
}

export function formatWeekHeader(weekStr) {
  try {
    var parts = weekStr.split('-W');
    var year = parseInt(parts[0]);
    var week = parseInt(parts[1]);
    var jan1 = new Date(year, 0, 1);
    var dayOffset = (jan1.getDay() + 6) % 7;
    var weekStart = new Date(year, 0, 1 + (week - 1) * 7 - dayOffset);
    var weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return 'Week ' + week + ' — ' + months[weekStart.getMonth()] + ' ' + weekStart.getDate() + '–' + weekEnd.getDate();
  } catch (e) { return weekStr; }
}

export function formatShortDate(dateStr) {
  try {
    var parts = dateStr.split('-');
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getMonth()] + ' ' + d.getDate();
  } catch (e) { return dateStr; }
}
