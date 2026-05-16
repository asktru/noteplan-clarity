/* global sendMessageToPlugin */
//
// Entry point for the Clarity webview bundle. Module-scope code that used to
// live here has moved into sibling modules (state, helpers, markdown, review,
// icons). What remains will be peeled off in follow-up commits.

import { State, MAX_RECENT_NOTES, pushRecentNote } from './state.js';
import {
  esc,
  capitalize,
  parseDateLocal,
  daysUntilDue,
  addDays,
  getNextMonday,
  addWeeks,
  formatDateHeader,
  formatUpcomingDateHeader,
  formatWeekHeader,
  formatShortDate,
} from './helpers.js';
import {
  renderInlineMarkdown,
  isTableSeparatorLine,
  splitTableCells,
  renderMarkdownTable,
} from './markdown.js';
import {
  PAUSED_COLOR,
  REVIEW_DUE_COLOR,
  reviewIntervalToDays,
  reviewDueDaysFromFm,
  isReviewDue,
  reviewDueLabel,
} from './review.js';
import {
  buildPauseOverlay,
  buildCheckOverlay,
  buildXOverlay,
  renderProjectIcon,
  buildProgressPie,
  buildDeadlineBadgeCompact,
  buildDeadlineBadgeVerbose,
  buildAreaIcon,
  getViewIcon,
} from './icons.js';
import {
  getTasksForView,
  getFilteredTasks,
  getViewCount,
} from './task-categorization.js';
import { onMessageFromPlugin } from './messages.js';
import { openQuickJump } from './quick-jump.js';
import {
  deleteTaskById,
  openShortcutsCheatsheet,
  closeProjectMenu,
  toggleProjectMenu,
  confirmArchiveProject,
} from './modals.js';
import { consumeDragClickSuppression } from './dnd.js';
import { openNoteMetaModal } from './note-meta-modal.js';
import {
  saveCurrentViewPrefs,
  restoreViewPrefs,
  persistViewPrefs,
} from './view-prefs.js';
import {
  renderTaskRow,
  renderFilterBar,
  renderGroupingToggle,
  renderGroupedTasks,
  renderQuickAdd,
} from './task-list.js';
import { renderSidebar } from './sidebar.js';
import { renderCurrentView } from './views.js';
import {
  showDatePicker,
  showNotePicker,
  showInlineInput,
  updateDateChip,
  closePickers,
} from './pickers.js';
import { expandTask, collapseTask, saveExpandedTask } from './task-editor.js';
// Side-effect imports: register DOMContentLoaded + global keydown listeners.
import './init.js';
import './keyboard.js';

// The HTML window's pluginToHTMLCommsBridge.js looks up onMessageFromPlugin
// on the window. esbuild's IIFE wrapper hides our top-level declarations from
// `window`, so the entry point is republished onto globalThis here.
globalThis.onMessageFromPlugin = onMessageFromPlugin;

// Open a project/area in Clarity's note view. Prefers clicking the sidebar
// item (so it scrolls into view + highlights), falls back to switching the
// view directly when the note is filtered out of the sidebar.
export function navigateToProjectNote(filename) {
  if (!filename) return;
  if (State.expandedTaskId) collapseTask();
  var navItem = document.querySelector('.cl-nav-item[data-filename="' + filename + '"]');
  if (navItem) {
    navItem.click();
    navItem.scrollIntoView({ block: 'nearest' });
    return;
  }
  // Sidebar item is hidden (e.g. status: someday/paused, or filtered by toggles).
  saveCurrentViewPrefs();
  State.currentView = 'note';
  State.currentNoteFilename = filename;
  State.focusedTaskIndex = -1;
  State.filters = { tag: null, mention: null, text: '', noteStatus: 'all' };
  State.tasksOnly = false;
  State.expandedTaskId = null;
  State.editDraft = null;
  sendMessageToPlugin('requestNoteContent', JSON.stringify({ filename: filename }));
  sendMessageToPlugin('saveView', JSON.stringify({ view: 'note', noteFilename: filename }));
  pushRecentNote(filename);
  renderSidebar();
  renderCurrentView();
}


















// ─── Event Delegation ──────────────────────────────────────
var _mainListenersAttached = false;
export function attachMainEventListeners() {
  if (_mainListenersAttached) return;
  var main = document.getElementById('cl-main');
  if (!main) return;
  _mainListenersAttached = true;

  // Double-click to expand task editor
  main.addEventListener('dblclick', function(e) {
    if (e.target.closest('.cl-cb') || e.target.closest('.cl-task-editor')) return;
    var row = e.target.closest('.cl-task-row');
    if (row) {
      e.preventDefault();
      expandTask(row.dataset.taskId);
    }
  });

  main.addEventListener('click', function(e) {
    // Suppress click after drag
    if (consumeDragClickSuppression()) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Let links work normally
    if (e.target.closest('a.cl-link')) return;

    // Click on task row to focus it
    var clickedRow = e.target.closest('.cl-task-row');
    if (clickedRow && !e.target.closest('.cl-cb') && !e.target.closest('[data-action]')) {
      var rows = document.querySelectorAll('.cl-task-row');
      for (var ri = 0; ri < rows.length; ri++) {
        rows[ri].classList.remove('cl-focused');
        if (rows[ri] === clickedRow) State.focusedTaskIndex = ri;
      }
      clickedRow.classList.add('cl-focused');
    }

    var target = e.target.closest('[data-action]');
    if (!target) {
      return;
    }
    var action = target.dataset.action;
    switch (action) {
      case 'toggle':
        var taskRow = target.closest('.cl-task-row');
        if (taskRow) toggleTask(taskRow.dataset.taskId);
        break;
      case 'filterTag': {
        var newTag = target.dataset.tag || null;
        // Clicking the active pill clears the tag filter without touching the folder filter.
        State.filters.tag = (newTag && State.filters.tag === newTag) ? null : newTag;
        saveCurrentViewPrefs(); persistViewPrefs();
        renderCurrentView();
        break;
      }
      case 'filterFolder': {
        var newFolder = target.dataset.folder || null;
        State.filters.folder = (newFolder && State.filters.folder === newFolder) ? null : newFolder;
        saveCurrentViewPrefs(); persistViewPrefs();
        renderCurrentView();
        break;
      }
      case 'clearTaskFilters':
        State.filters.tag = null;
        State.filters.folder = null;
        saveCurrentViewPrefs(); persistViewPrefs();
        renderCurrentView();
        break;
      case 'filterNoteStatus':
        State.filters.noteStatus = target.dataset.status || 'all';
        saveCurrentViewPrefs(); persistViewPrefs();
        renderCurrentView();
        break;
      case 'toggleTasksOnly':
        State.tasksOnly = !State.tasksOnly;
        saveCurrentViewPrefs(); persistViewPrefs();
        renderCurrentView();
        break;
      case 'setGrouping':
        State.grouping = target.dataset.grouping || 'note';
        saveCurrentViewPrefs(); persistViewPrefs();
        renderCurrentView();
        break;
      case 'openInEditor':
        if (target.dataset.filename) {
          sendMessageToPlugin('openNoteInEditor', JSON.stringify({ filename: target.dataset.filename }));
        }
        break;
      case 'jumpToProjectNote': {
        var jfn = target.dataset.filename;
        if (!jfn) break;
        var inSidebar = false;
        for (var jpi = 0; jpi < State.notes.length; jpi++) {
          if (State.notes[jpi].filename === jfn) { inSidebar = true; break; }
        }
        if (inSidebar) {
          navigateToProjectNote(jfn);
          break;
        }
        // Fallback: not a Clarity-tracked project (e.g. calendar note) — open in editor.
        sendMessageToPlugin('openNoteInEditor', JSON.stringify({ filename: jfn }));
        break;
      }
      case 'openNoteMetaModal':
        closeProjectMenu();
        openNoteMetaModal();
        break;
      case 'markReviewedFromFooter': {
        var nc = State.noteContent;
        if (!nc) break;
        sendMessageToPlugin('updateNoteFrontmatter', JSON.stringify({
          filename: nc.filename,
          updates: { reviewed: State.today },
        }));
        // Optimistic UI: hide the footer immediately. Re-render happens when
        // the plugin echoes the updated frontmatter back.
        var footer = target.closest('.cl-review-footer');
        if (footer) footer.remove();
        break;
      }
      case 'toggleProjectMenu':
        toggleProjectMenu(target);
        break;
      case 'refreshProject': {
        var rfn = target.dataset.filename || State.currentNoteFilename;
        if (!rfn) break;
        closeProjectMenu();
        target.classList.add('cl-spinning');
        sendMessageToPlugin('refreshProject', JSON.stringify({ filename: rfn }));
        sendMessageToPlugin('requestNoteContent', JSON.stringify({ filename: rfn }));
        break;
      }
      case 'archiveProject':
        closeProjectMenu();
        confirmArchiveProject();
        break;
      case 'rescheduleAllOverdue': {
        var today = State.today;
        var moved = 0;
        for (var rai = 0; rai < State.tasks.length; rai++) {
          var t = State.tasks[rai];
          if (t.status === 'open' && t.scheduledDate && t.scheduledDate < today) {
            rescheduleTaskById(t.id, today);
            moved++;
          }
        }
        if (moved > 0) renderCurrentView();
        break;
      }
      case 'dismissMoved':
        State.movedFromInbox = [];
        renderCurrentView();
        break;
      case 'toggleHeadingCollapse': {
        var lineIdx = parseInt(target.dataset.lineIndex, 10);
        if (isNaN(lineIdx) || !State.currentNoteFilename) break;
        // Optimistic UI: toggle chevron + section-body display immediately
        var body = document.querySelector('.cl-section-body[data-heading-line="' + lineIdx + '"]');
        if (body) {
          var nowHidden = body.style.display !== 'none';
          body.style.display = nowHidden ? 'none' : '';
          var svg = target.querySelector('.cl-heading-chevron');
          if (svg) {
            svg.classList.toggle('cl-chevron-right', nowHidden);
            svg.classList.toggle('cl-chevron-down', !nowHidden);
          }
          target.classList.toggle('cl-always-visible', nowHidden);
        }
        sendMessageToPlugin('toggleHeadingCollapse', JSON.stringify({
          filename: State.currentNoteFilename,
          lineIndex: lineIdx,
        }));
        break;
      }
    }
  });

  // Quick add Enter key
  main.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && e.target.classList.contains('cl-quick-add-input')) {
      e.preventDefault();
      var content = e.target.value.trim();
      if (!content) return;
      var view = e.target.closest('.cl-quick-add').dataset.view;
      var todayFilename = State.today.replace(/-/g, '') + '.md';
      var targetFilename = (view === 'note' && State.currentNoteFilename) ? State.currentNoteFilename : todayFilename;
      var msg = { filename: targetFilename, content: content };
      if (view === 'today') msg.scheduledDate = State.today;
      if (view === 'someday') msg.tags = ['#someday'];
      if (view === 'note') msg.prepend = true;
      sendMessageToPlugin('createTask', JSON.stringify(msg));
      e.target.value = '';
    }
  });
}

// Add or remove a single tag on a task by id without expanding its editor.
export function toggleTaskTagById(taskId, tag, add) {
  if (!taskId || !tag) return;
  var parts = taskId.split(':');
  var filename = parts.slice(0, -1).join(':');
  var lineIndex = parseInt(parts[parts.length - 1]);
  if (isNaN(lineIndex)) return;
  for (var i = 0; i < State.tasks.length; i++) {
    if (State.tasks[i].id === taskId) {
      var tags = State.tasks[i].tags || [];
      if (add) {
        if (tags.indexOf(tag) < 0) tags = tags.concat([tag]);
      } else {
        tags = tags.filter(function(t) { return t !== tag; });
      }
      State.tasks[i].tags = tags;
      break;
    }
  }
  renderCurrentView();
  sendMessageToPlugin('setTaskTag', JSON.stringify({
    filename: filename, lineIndex: lineIndex, tag: tag, add: !!add,
  }));
}

// Reschedule a task by id without expanding its editor. dateStr is YYYY-MM-DD or null to clear.
export function rescheduleTaskById(taskId, dateStr) {
  if (!taskId) return;
  var parts = taskId.split(':');
  var filename = parts.slice(0, -1).join(':');
  var lineIndex = parseInt(parts[parts.length - 1]);
  if (isNaN(lineIndex)) return;

  // Optimistically update local state so the UI feels instant.
  for (var i = 0; i < State.tasks.length; i++) {
    if (State.tasks[i].id === taskId) {
      State.tasks[i].scheduledDate = dateStr || null;
      State.tasks[i].scheduledWeek = null;
      break;
    }
  }
  renderCurrentView();
  sendMessageToPlugin('rescheduleTask', JSON.stringify({
    filename: filename, lineIndex: lineIndex,
    scheduledDate: dateStr || null, scheduledWeek: null,
  }));
}

// Resolve the currently keyboard-focused task row to its task id, if any.
export function getFocusedTaskId() {
  if (State.focusedTaskIndex < 0) return null;
  var rows = document.querySelectorAll('.cl-task-row');
  if (!rows[State.focusedTaskIndex]) return null;
  return rows[State.focusedTaskIndex].dataset.taskId || null;
}

export function toggleTask(taskId) {
  if (!taskId) return;
  for (var i = 0; i < State.tasks.length; i++) {
    if (State.tasks[i].id === taskId) {
      State.tasks[i].status = State.tasks[i].status === 'open' ? 'done' : 'open';
      break;
    }
  }
  renderCurrentView();
  renderSidebar();
  var parts = taskId.split(':');
  var filename = parts.slice(0, -1).join(':');
  var lineIndex = parseInt(parts[parts.length - 1]);
  sendMessageToPlugin('toggleTask', JSON.stringify({ filename: filename, lineIndex: lineIndex }));
}







