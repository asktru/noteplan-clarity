// Floating pickers anchored to elements in the task editor:
//   - showDatePicker: Day / Week tabs + mini-calendar
//   - showNotePicker: filtered, folder-grouped list of project notes
//   - showInlineInput: textual input with autocomplete (for tags/mentions)
// All three close cleanly via `closePickers`, which removes any picker
// overlays from the DOM (used both internally and from the editor's lifecycle).

import { State } from '../state.js';
import { esc, addDays, getNextMonday, addWeeks, formatShortDate } from '../lib/helpers.js';

// Position an absolutely/fixed-positioned picker below its anchor by default,
// flipping above when the picker would overflow the viewport bottom AND there's
// more room above. Must be called AFTER the picker is appended to the DOM so
// its height is measurable.
function positionPickerVertically(picker, anchor, margin) {
  if (margin == null) margin = 4;
  var rect = anchor.getBoundingClientRect();
  var pickerHeight = picker.getBoundingClientRect().height;
  var viewportHeight = window.innerHeight;
  var spaceBelow = viewportHeight - rect.bottom - margin;
  var spaceAbove = rect.top - margin;
  if (pickerHeight > spaceBelow && spaceAbove > spaceBelow) {
    picker.style.top = Math.max(margin, rect.top - pickerHeight - margin) + 'px';
  } else {
    picker.style.top = (rect.bottom + margin) + 'px';
  }
}

export function showDatePicker(anchor) {
  closePickers();
  var rect = anchor.getBoundingClientRect();
  var picker = document.createElement('div');
  picker.className = 'cl-picker cl-date-picker';
  picker.style.top = (rect.bottom + 4) + 'px';
  picker.style.left = Math.min(rect.left, window.innerWidth - 270) + 'px';

  var today = State.today;
  var tmr = addDays(today, 1);
  var nextMon = getNextMonday(today);
  var inAWeek = addDays(today, 7);

  picker.innerHTML =
    '<div class="cl-picker-tabs">' +
    '<div class="cl-picker-tab cl-picker-tab-active" data-tab="day">Day</div>' +
    '<div class="cl-picker-tab" data-tab="week">Week</div>' +
    '</div>' +
    '<div class="cl-picker-body" id="cl-date-body">' +
    renderDateDayTab(today, tmr, nextMon, inAWeek) +
    '</div>' +
    '<div class="cl-picker-footer">' +
    '<div class="cl-picker-action" data-action="removeDate"><span>✕</span> Remove date <span class="cl-shortcut">⌘O</span></div>' +
    '</div>';

  document.body.appendChild(picker);
  positionPickerVertically(picker, anchor);

  picker.addEventListener('click', function(e) {
    var target = e.target.closest('[data-action]');
    if (!target) {
      var tab = e.target.closest('[data-tab]');
      if (tab) {
        var tabs = picker.querySelectorAll('.cl-picker-tab');
        for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove('cl-picker-tab-active');
        tab.classList.add('cl-picker-tab-active');
        var body = picker.querySelector('#cl-date-body');
        if (tab.dataset.tab === 'day') body.innerHTML = renderDateDayTab(today, tmr, nextMon, inAWeek);
        else body.innerHTML = renderDateWeekTab();
      }
      return;
    }
    if (target.dataset.action === 'selectDate') {
      State.editDraft.scheduledDate = target.dataset.date;
      State.editDraft.scheduledWeek = null;
      State.editDraft.tags = State.editDraft.tags.filter(function(t) { return t !== '#someday'; });
      updateDateChip();
      closePickers();
    } else if (target.dataset.action === 'selectWeek') {
      State.editDraft.scheduledWeek = target.dataset.week;
      State.editDraft.scheduledDate = null;
      State.editDraft.tags = State.editDraft.tags.filter(function(t) { return t !== '#someday'; });
      updateDateChip();
      closePickers();
    } else if (target.dataset.action === 'removeDate') {
      State.editDraft.scheduledDate = null;
      State.editDraft.scheduledWeek = null;
      updateDateChip();
      closePickers();
    }
  });
}

function renderDateDayTab(today, tmr, nextMon, inAWeek) {
  var html = '<div class="cl-picker-options">';
  html += '<div class="cl-picker-option cl-picker-today" data-action="selectDate" data-date="' + today + '"><span>⭐</span><span class="cl-picker-opt-label">Today</span><span class="cl-picker-opt-date">' + formatShortDate(today) + '</span></div>';
  html += '<div class="cl-picker-option" data-action="selectDate" data-date="' + tmr + '"><span>→</span><span class="cl-picker-opt-label">Tomorrow</span><span class="cl-picker-opt-date">' + formatShortDate(tmr) + '</span></div>';
  html += '<div class="cl-picker-option" data-action="selectDate" data-date="' + nextMon + '"><span>📅</span><span class="cl-picker-opt-label">Next Monday</span><span class="cl-picker-opt-date">' + formatShortDate(nextMon) + '</span></div>';
  html += '<div class="cl-picker-option" data-action="selectDate" data-date="' + inAWeek + '"><span>+7</span><span class="cl-picker-opt-label">In a week</span><span class="cl-picker-opt-date">' + formatShortDate(inAWeek) + '</span></div>';
  html += '</div>';
  html += '<div class="cl-picker-divider"></div>';
  html += renderMiniCalendar(today);
  return html;
}

function renderMiniCalendar(todayStr) {
  var parts = todayStr.split('-');
  var year = parseInt(parts[0]);
  var month = parseInt(parts[1]) - 1;
  var months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var firstDay = new Date(year, month, 1);
  var startOffset = (firstDay.getDay() + 6) % 7;
  var daysInMonth = new Date(year, month + 1, 0).getDate();

  var html = '<div class="cl-mini-cal">';
  html += '<div class="cl-cal-nav"><span class="cl-cal-arrow">◀</span><span class="cl-cal-month">' + months[month] + ' ' + year + '</span><span class="cl-cal-arrow">▶</span></div>';
  html += '<div class="cl-cal-grid">';
  var dayNames = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
  for (var di = 0; di < 7; di++) html += '<span class="cl-cal-day-name">' + dayNames[di] + '</span>';
  for (var gap = 0; gap < startOffset; gap++) html += '<span class="cl-cal-day"></span>';
  for (var d = 1; d <= daysInMonth; d++) {
    var dateStr = year + '-' + String(month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    var cls = 'cl-cal-day';
    if (dateStr === todayStr) cls += ' cl-cal-today';
    if (dateStr < todayStr) cls += ' cl-cal-past';
    if (State.editDraft && State.editDraft.scheduledDate === dateStr) cls += ' cl-cal-selected';
    html += '<span class="' + cls + '" data-action="selectDate" data-date="' + dateStr + '">' + d + '</span>';
  }
  html += '</div></div>';
  return html;
}

function renderDateWeekTab() {
  var currentWeek = State.currentWeek;
  var html = '<div class="cl-picker-options">';
  for (var w = 0; w < 8; w++) {
    var weekStr = addWeeks(currentWeek, w);
    var label = w === 0 ? 'This week' : w === 1 ? 'Next week' : weekStr;
    html += '<div class="cl-picker-option" data-action="selectWeek" data-week="' + weekStr + '"><span class="cl-picker-opt-label">' + label + '</span><span class="cl-picker-opt-date">' + weekStr + '</span></div>';
  }
  html += '</div>';
  return html;
}

export function updateDateChip() {
  var editor = document.getElementById('cl-editor');
  if (!editor || !State.editDraft) return;
  var chip = editor.querySelector('[data-action="openDatePicker"]');
  if (!chip) return;
  var label = 'Schedule...';
  if (State.editDraft.scheduledDate) label = formatShortDate(State.editDraft.scheduledDate);
  else if (State.editDraft.scheduledWeek) label = State.editDraft.scheduledWeek;
  chip.innerHTML = '<span class="cl-meta-icon">📅</span>' + label;
}

export function showNotePicker(anchor) {
  closePickers();
  var rect = anchor.getBoundingClientRect();
  var picker = document.createElement('div');
  picker.className = 'cl-picker cl-note-picker';
  picker.style.top = (rect.bottom + 4) + 'px';
  picker.style.left = Math.min(rect.left, window.innerWidth - 310) + 'px';

  picker.innerHTML =
    '<div class="cl-picker-search"><input class="cl-picker-input" placeholder="Search notes..." autofocus/></div>' +
    '<div class="cl-picker-results" id="cl-note-results">' + renderNoteResults('') + '</div>' +
    '<div class="cl-picker-footer"><span style="opacity:0.35;font-size:11px;">↵ select · Esc close</span></div>';

  document.body.appendChild(picker);
  positionPickerVertically(picker, anchor);
  var input = picker.querySelector('.cl-picker-input');
  input.addEventListener('input', function() {
    document.getElementById('cl-note-results').innerHTML = renderNoteResults(input.value);
  });

  picker.addEventListener('click', function(e) {
    var target = e.target.closest('[data-action="selectNote"]');
    if (target) {
      State.editDraft.moveToFilename = target.dataset.filename;
      State.editDraft.moveToLabel = target.dataset.title;
      var editor = document.getElementById('cl-editor');
      if (editor) {
        var chip = editor.querySelector('[data-action="openNotePicker"]');
        if (chip) chip.textContent = '→ ' + target.dataset.title;
      }
      closePickers();
    }
  });
}

function renderNoteResults(query) {
  var q = (query || '').toLowerCase();
  var html = '';

  // Show current location first
  if (State.expandedTaskId && !q) {
    var curTask = null;
    for (var ti = 0; ti < State.tasks.length; ti++) {
      if (State.tasks[ti].id === State.expandedTaskId) { curTask = State.tasks[ti]; break; }
    }
    if (curTask && curTask.noteFilename) {
      html += '<div class="cl-picker-group">Current Location</div>';
      html += '<div class="cl-picker-result cl-picker-current" data-action="selectNote" data-filename="' + esc(curTask.noteFilename) + '" data-title="' + esc(curTask.noteTitle) + '">';
      html += '<span class="cl-picker-note-icon">📍</span>';
      html += '<span class="cl-picker-note-title">' + esc(curTask.noteTitle) + '</span>';
      html += '</div>';
      html += '<div class="cl-picker-divider" style="margin:4px 14px;"></div>';
    }
  }

  for (var fi = 0; fi < State.folders.length; fi++) {
    var folder = State.folders[fi];
    var matchingNotes = [];
    for (var ni = 0; ni < folder.notes.length; ni++) {
      var n = folder.notes[ni];
      if (!q || n.title.toLowerCase().indexOf(q) >= 0) matchingNotes.push(n);
    }
    if (matchingNotes.length === 0) continue;
    html += '<div class="cl-picker-group">' + esc(folder.name) + '</div>';
    for (var mi = 0; mi < matchingNotes.length; mi++) {
      var mn = matchingNotes[mi];
      html += '<div class="cl-picker-result" data-action="selectNote" data-filename="' + esc(mn.filename) + '" data-title="' + esc(mn.title) + '">';
      html += '<span class="cl-picker-note-icon">📄</span>';
      html += '<span class="cl-picker-note-title">' + esc(mn.title) + '</span>';
      html += '<span class="cl-picker-note-count">' + mn.taskCount + '</span>';
      html += '</div>';
    }
  }
  if (!html) html = '<div class="cl-picker-empty">No notes found</div>';
  return html;
}

function getAllKnownTags() {
  var tagMap = {};
  for (var i = 0; i < State.tasks.length; i++) {
    var t = State.tasks[i];
    if (t.tags) { for (var j = 0; j < t.tags.length; j++) tagMap[t.tags[j]] = true; }
  }
  return Object.keys(tagMap).sort();
}

function getAllKnownMentions() {
  var menMap = {};
  for (var i = 0; i < State.tasks.length; i++) {
    var t = State.tasks[i];
    if (t.mentions) { for (var j = 0; j < t.mentions.length; j++) menMap[t.mentions[j]] = true; }
  }
  return Object.keys(menMap).sort();
}

export function showInlineInput(anchor, prefix, onCommit) {
  var existing = document.querySelector('.cl-inline-input-wrap');
  if (existing) existing.remove();

  var allSuggestions = prefix === '#' ? getAllKnownTags() : getAllKnownMentions();
  // Exclude already-added ones
  var draft = State.editDraft;
  var already = prefix === '#' ? (draft.tags || []) : (draft.mentions || []);
  allSuggestions = allSuggestions.filter(function(s) { return already.indexOf(s) === -1; });

  var wrap = document.createElement('div');
  wrap.className = 'cl-inline-input-wrap';
  var input = document.createElement('input');
  input.className = 'cl-inline-input';
  input.placeholder = prefix + '...';
  input.value = prefix;

  var dropdown = document.createElement('div');
  dropdown.className = 'cl-autocomplete';
  var selectedIdx = -1;

  wrap.appendChild(input);
  wrap.appendChild(dropdown);
  anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
  input.focus();
  input.setSelectionRange(prefix.length, prefix.length);

  function updateSuggestions() {
    var q = input.value.toLowerCase();
    var matches = allSuggestions.filter(function(s) { return s.toLowerCase().indexOf(q) >= 0; });
    if (matches.length === 0 || (matches.length === 1 && matches[0].toLowerCase() === q)) {
      dropdown.innerHTML = '';
      dropdown.style.display = 'none';
      selectedIdx = -1;
      return;
    }
    selectedIdx = -1;
    dropdown.style.display = 'block';
    dropdown.innerHTML = '';
    for (var i = 0; i < Math.min(matches.length, 8); i++) {
      var item = document.createElement('div');
      item.className = 'cl-autocomplete-item';
      item.textContent = matches[i];
      item.dataset.value = matches[i];
      item.addEventListener('mousedown', function(e) {
        e.preventDefault();
        input.value = this.dataset.value;
        commit();
      });
      dropdown.appendChild(item);
    }
  }

  function commit() {
    var val = input.value.trim();
    wrap.remove();
    if (val && val !== prefix) {
      onCommit(val);
    }
  }

  input.addEventListener('input', updateSuggestions);
  updateSuggestions();

  input.addEventListener('keydown', function(e) {
    var items = dropdown.querySelectorAll('.cl-autocomplete-item');
    if (e.key === 'ArrowDown' && items.length > 0) {
      e.preventDefault();
      selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
      for (var i = 0; i < items.length; i++) items[i].classList.toggle('cl-autocomplete-active', i === selectedIdx);
      input.value = items[selectedIdx].dataset.value;
    } else if (e.key === 'ArrowUp' && items.length > 0) {
      e.preventDefault();
      selectedIdx = Math.max(selectedIdx - 1, 0);
      for (var i = 0; i < items.length; i++) items[i].classList.toggle('cl-autocomplete-active', i === selectedIdx);
      input.value = items[selectedIdx].dataset.value;
    } else if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); commit(); }
    else if (e.key === 'Escape') { e.stopPropagation(); wrap.remove(); }
  });
  input.addEventListener('blur', function() {
    setTimeout(function() { if (wrap.parentNode) commit(); }, 150);
  });
}

export function closePickers() {
  var pickers = document.querySelectorAll('.cl-picker');
  for (var i = 0; i < pickers.length; i++) pickers[i].remove();
}
