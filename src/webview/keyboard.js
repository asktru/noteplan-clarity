// Top-level keyboard handler. Attached to `document`; routes Cmd/Ctrl-shortcut
// keys to the task editor draft when one is open, otherwise to the focused
// task in the current view. Arrow keys move focus; Enter expands the focused
// task; Space toggles it.
//
// Imported for side effects from index.js — the keydown listener registers at
// module-evaluation time.

import { State } from './state.js';
import { addDays } from './lib/helpers.js';
import { sendToPlugin } from './lib/bridge.js';
import { expandTask, collapseTask, saveExpandedTask } from './ui/task-editor.js';
import { openShortcutsCheatsheet, deleteTaskById } from './ui/modals.js';
import { openQuickJump } from './ui/quick-jump.js';
import { updateDateChip } from './ui/pickers.js';
import { dragFindSiblings, dragCommit } from './ui/dnd.js';
import {
  getFocusedTaskId,
  toggleTask,
  toggleTaskTagById,
  rescheduleTaskById,
} from './index.js';

// The .cl-task-row for the currently focused task, or null.
function focusedTaskRow() {
  var rows = document.querySelectorAll('.cl-task-row');
  if (State.focusedTaskIndex >= 0 && State.focusedTaskIndex < rows.length) return rows[State.focusedTaskIndex];
  return null;
}

// One-off inline input for a new task or h2 heading, placed below the focused
// task row (or at the top of the note body when afterRow is null).
function showInlineNewItem(kind, afterRow) {
  var existing = document.querySelector('.cl-inline-new');
  if (existing) existing.remove();
  var wrap = document.createElement('div');
  wrap.className = 'cl-inline-new cl-inline-new-' + kind;
  var input = document.createElement('input');
  input.type = 'text';
  input.className = 'cl-quick-add-input';
  input.placeholder = kind === 'heading' ? 'New heading…' : 'New task…';
  wrap.appendChild(input);
  if (afterRow) {
    afterRow.insertAdjacentElement('afterend', wrap);
  } else {
    var body = document.querySelector('#cl-main .cl-note-content');
    if (!body) return;
    body.insertBefore(wrap, body.firstChild);
  }
  // Drop task focus while the inline input is open: removes the focus
  // highlight and stops the global Enter handler from also opening the
  // focused task's editor (which would also set expandedTaskId and break
  // arrow-key navigation afterwards).
  var allRows = document.querySelectorAll('.cl-task-row');
  for (var fr = 0; fr < allRows.length; fr++) allRows[fr].classList.remove('cl-focused');
  State.focusedTaskIndex = -1;

  var done = false;
  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter') {
      ev.preventDefault();
      ev.stopPropagation();
      var text = input.value.trim();
      done = true;
      if (wrap.parentNode) wrap.remove();
      if (!text) return;
      var afterIdx = afterRow ? parseInt(afterRow.dataset.lineIndex, 10) : null;
      if (kind === 'heading') {
        sendToPlugin('insertHeading', JSON.stringify({ filename: State.currentNoteFilename, content: text, afterLineIndex: (afterIdx === null || isNaN(afterIdx)) ? null : afterIdx }));
      } else {
        var indent = afterRow ? (parseInt(afterRow.dataset.indent, 10) || 0) : 0;
        sendToPlugin('createTask', JSON.stringify({ filename: State.currentNoteFilename, content: text, afterLineIndex: (afterIdx === null || isNaN(afterIdx)) ? null : afterIdx, indent: indent }));
      }
    } else if (ev.key === 'Escape') {
      ev.preventDefault();
      ev.stopPropagation();
      done = true;
      if (wrap.parentNode) wrap.remove();
    }
  });
  input.addEventListener('blur', function() { if (!done && wrap.parentNode) wrap.remove(); });
  input.focus();
}

document.addEventListener('keydown', function(e) {
  // Cmd+Enter: save expanded task
  if (e.metaKey && e.key === 'Enter') {
    if (State.expandedTaskId) { e.preventDefault(); saveExpandedTask(); }
    return;
  }

  // Escape: close cheatsheet, picker, or collapse editor
  if (e.key === 'Escape') {
    var cheat = document.querySelector('.cl-cheatsheet-overlay');
    if (cheat) { cheat.remove(); return; }
    var picker = document.querySelector('.cl-picker');
    if (picker) { picker.remove(); return; }
    if (State.expandedTaskId) { collapseTask(); return; }
  }

  // ? (Shift+/): open keyboard shortcuts cheatsheet
  if (e.key === '?' && !e.metaKey && !e.ctrlKey && !e.altKey) {
    var activeForCheat = document.activeElement;
    if (activeForCheat && (activeForCheat.tagName === 'INPUT' || activeForCheat.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    openShortcutsCheatsheet();
    return;
  }

  // Cmd+Shift+T: schedule for tomorrow
  if (e.metaKey && e.shiftKey && (e.key === 'T' || e.key === 't')) {
    var tomorrow = addDays(State.today, 1);
    if (State.editDraft) {
      e.preventDefault();
      State.editDraft.scheduledDate = tomorrow;
      State.editDraft.scheduledWeek = null;
      State.editDraft.tags = State.editDraft.tags.filter(function(t) { return t !== '#someday' && t !== '#evening'; });
      updateDateChip();
    } else {
      var tid = getFocusedTaskId();
      if (tid) {
        e.preventDefault();
        toggleTaskTagById(tid, '#evening', false);
        rescheduleTaskById(tid, tomorrow);
      }
    }
    return;
  }

  // Cmd+T: schedule for today
  if (e.metaKey && e.key === 't') {
    if (State.editDraft) {
      e.preventDefault();
      State.editDraft.scheduledDate = State.today;
      State.editDraft.scheduledWeek = null;
      State.editDraft.tags = State.editDraft.tags.filter(function(t) { return t !== '#someday' && t !== '#evening'; });
      updateDateChip();
    } else {
      var tid = getFocusedTaskId();
      if (tid) {
        e.preventDefault();
        toggleTaskTagById(tid, '#evening', false);
        rescheduleTaskById(tid, State.today);
      }
    }
    return;
  }

  // Cmd+E: tag focused task as evening (so it shows up in Today's "This Evening" section)
  if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && (e.key === 'e' || e.key === 'E')) {
    if (State.editDraft) {
      e.preventDefault();
      if (State.editDraft.tags.indexOf('#evening') < 0) State.editDraft.tags.push('#evening');
      State.editDraft.scheduledDate = State.today;
      State.editDraft.scheduledWeek = null;
      updateDateChip();
    } else {
      var tid = getFocusedTaskId();
      if (tid) {
        e.preventDefault();
        // Ensure the task is scheduled for today so it appears in Today's evening section.
        rescheduleTaskById(tid, State.today);
        toggleTaskTagById(tid, '#evening', true);
      }
    }
    return;
  }

  // Cmd+O: remove schedule
  if (e.metaKey && e.key === 'o') {
    if (State.editDraft) {
      e.preventDefault();
      State.editDraft.scheduledDate = null;
      State.editDraft.scheduledWeek = null;
      State.editDraft.tags = State.editDraft.tags.filter(function(t) { return t !== '#evening'; });
      updateDateChip();
    } else {
      var tid = getFocusedTaskId();
      if (tid) {
        e.preventDefault();
        toggleTaskTagById(tid, '#evening', false);
        rescheduleTaskById(tid, null);
      }
    }
    return;
  }

  // Cmd+1..5: switch to default sidebar views (Things 3 style)
  if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && /^[1-5]$/.test(e.key)) {
    var viewMap = { '1': 'inbox', '2': 'today', '3': 'upcoming', '4': 'anytime', '5': 'someday' };
    var targetView = viewMap[e.key];
    if (targetView) {
      var navItem = document.querySelector('.cl-nav-item[data-view="' + targetView + '"]');
      if (navItem) {
        e.preventDefault();
        if (State.expandedTaskId) collapseTask();
        navItem.click();
        var sbInner = document.querySelector('.cl-sidebar-inner');
        if (sbInner) sbInner.scrollTop = 0;
      }
    }
    return;
  }

  // Cmd+Backspace / Cmd+Delete: delete the focused or expanded task
  if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && (e.key === 'Backspace' || e.key === 'Delete')) {
    var active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    var deleteId = State.expandedTaskId || getFocusedTaskId();
    if (deleteId) {
      e.preventDefault();
      deleteTaskById(deleteId);
    }
    return;
  }

  // Cmd+/: open quick-jump palette
  if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && e.key === '/') {
    e.preventDefault();
    openQuickJump();
    return;
  }

  // New task below the focused task (fall back to the top input if none focused).
  if (e.metaKey && e.ctrlKey && !e.shiftKey && !e.altKey && e.code === 'KeyN') {
    if (State.currentView !== 'note') return;
    e.preventDefault();
    var ctrlRow = focusedTaskRow();
    if (ctrlRow) showInlineNewItem('task', ctrlRow);
    else { var ctrlQa = document.querySelector('.cl-quick-add-input'); if (ctrlQa) ctrlQa.focus(); }
    return;
  }

  // New h2 heading below the focused task (or at the top of the body if none).
  if (e.metaKey && e.shiftKey && !e.ctrlKey && !e.altKey && e.code === 'KeyN') {
    if (State.currentView !== 'note') return;
    e.preventDefault();
    showInlineNewItem('heading', focusedTaskRow());
    return;
  }

  // New project note in the same folder as the current note, then open it.
  if (e.metaKey && e.altKey && !e.ctrlKey && !e.shiftKey && e.code === 'KeyN') {
    if (State.currentView !== 'note' || !State.currentNoteFilename) return;
    e.preventDefault();
    sendToPlugin('createProjectNote', JSON.stringify({ filename: State.currentNoteFilename }));
    return;
  }

  // Cmd+N: focus quick add
  if (e.metaKey && e.key === 'n') {
    e.preventDefault();
    var quickAdd = document.querySelector('.cl-quick-add-input');
    if (quickAdd) quickAdd.focus();
    return;
  }

  // Move the focused task up/down one slot (reuses the drag reorder path).
  if (e.metaKey && e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    if (State.currentView !== 'note') return;
    var moveRow = focusedTaskRow();
    if (!moveRow) return;
    e.preventDefault();
    var moveCands = dragFindSiblings(moveRow).slice();
    moveCands.push(moveRow);
    moveCands.sort(function(a, b) { return a.getBoundingClientRect().top - b.getBoundingClientRect().top; });
    var moveIdx = moveCands.indexOf(moveRow);
    var neighbor = e.key === 'ArrowUp' ? moveCands[moveIdx - 1] : moveCands[moveIdx + 1];
    if (!neighbor) return;
    State.pendingFocusTaskId = moveRow.dataset.taskId;
    dragCommit(moveRow, { el: neighbor, position: e.key === 'ArrowUp' ? 'before' : 'after' });
    return;
  }

  // Arrow keys: navigate task rows
  if (!State.expandedTaskId && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    var arrowActive = document.activeElement;
    if (arrowActive && (arrowActive.tagName === 'INPUT' || arrowActive.tagName === 'TEXTAREA')) return;
    e.preventDefault();
    var rows = document.querySelectorAll('.cl-task-row');
    if (rows.length === 0) return;
    if (e.key === 'ArrowDown') State.focusedTaskIndex = Math.min(State.focusedTaskIndex + 1, rows.length - 1);
    else State.focusedTaskIndex = Math.max(State.focusedTaskIndex - 1, 0);
    for (var ri = 0; ri < rows.length; ri++) rows[ri].classList.remove('cl-focused');
    if (rows[State.focusedTaskIndex]) {
      rows[State.focusedTaskIndex].classList.add('cl-focused');
      rows[State.focusedTaskIndex].scrollIntoView({ block: 'nearest' });
    }
  }

  // Enter: expand focused task
  if (e.key === 'Enter' && !State.expandedTaskId) {
    var enterActive = document.activeElement;
    if (enterActive && (enterActive.tagName === 'INPUT' || enterActive.tagName === 'TEXTAREA')) return;
    var enterRows = document.querySelectorAll('.cl-task-row');
    if (State.focusedTaskIndex >= 0 && enterRows[State.focusedTaskIndex]) {
      e.preventDefault();
      expandTask(enterRows[State.focusedTaskIndex].dataset.taskId);
    }
  }

  // Space: toggle focused task
  if (e.key === ' ' && !State.expandedTaskId) {
    var spaceActive = document.activeElement;
    if (spaceActive && (spaceActive.tagName === 'INPUT' || spaceActive.tagName === 'TEXTAREA')) return;
    var spaceRows = document.querySelectorAll('.cl-task-row');
    if (State.focusedTaskIndex >= 0 && spaceRows[State.focusedTaskIndex]) {
      e.preventDefault();
      toggleTask(spaceRows[State.focusedTaskIndex].dataset.taskId);
    }
  }
});
