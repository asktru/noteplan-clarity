// Top-level keyboard handler. Attached to `document`; routes Cmd/Ctrl-shortcut
// keys to the task editor draft when one is open, otherwise to the focused
// task in the current view. Arrow keys move focus; Enter expands the focused
// task; Space toggles it.
//
// Imported for side effects from index.js — the keydown listener registers at
// module-evaluation time.

import { State } from './state.js';
import { addDays } from './helpers.js';
import { expandTask, collapseTask, saveExpandedTask } from './task-editor.js';
import { openShortcutsCheatsheet, deleteTaskById } from './modals.js';
import { openQuickJump } from './quick-jump.js';
import { updateDateChip } from './pickers.js';
import {
  getFocusedTaskId,
  toggleTask,
  toggleTaskTagById,
  rescheduleTaskById,
} from './index.js';

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

  // Cmd+N: focus quick add
  if (e.metaKey && e.key === 'n') {
    e.preventDefault();
    var quickAdd = document.querySelector('.cl-quick-add-input');
    if (quickAdd) quickAdd.focus();
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
