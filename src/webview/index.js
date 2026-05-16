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
// Side-effect import: registers DOMContentLoaded handler.
import './init.js';

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
function toggleTaskTagById(taskId, tag, add) {
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
function rescheduleTaskById(taskId, dateStr) {
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
function getFocusedTaskId() {
  if (State.focusedTaskIndex < 0) return null;
  var rows = document.querySelectorAll('.cl-task-row');
  if (!rows[State.focusedTaskIndex]) return null;
  return rows[State.focusedTaskIndex].dataset.taskId || null;
}

function toggleTask(taskId) {
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

// ─── Task Editor ───────────────────────────────────────────
function expandTask(taskId) {
  if (!taskId) return;
  if (State.expandedTaskId === taskId) { collapseTask(); return; }

  var task = null;
  for (var i = 0; i < State.tasks.length; i++) {
    if (State.tasks[i].id === taskId) { task = State.tasks[i]; break; }
  }
  if (!task) return;
  collapseTask();

  State.expandedTaskId = taskId;

  // Strip trailing tags from title — they'll be shown in the metadata bar
  var titleContent = task.content;
  var trailingTags = [];
  var trailingMatch = titleContent.match(/(\s+#[\p{L}\p{N}_\-\/]+)+$/u);
  if (trailingMatch) {
    var trailingStr = trailingMatch[0];
    titleContent = titleContent.substring(0, titleContent.length - trailingStr.length);
    var tagMatches = trailingStr.match(/#[\p{L}\p{N}_\-\/]+/gu);
    if (tagMatches) trailingTags = tagMatches;
  }

  State.editDraft = {
    content: titleContent,
    rawContent: task.rawContent,
    priority: task.priority,
    scheduledDate: task.scheduledDate,
    scheduledWeek: task.scheduledWeek,
    tags: task.tags ? task.tags.slice() : [],
    mentions: task.mentions ? task.mentions.slice() : [],
    trailingTags: trailingTags,
    moveToFilename: null,
    notes: [],
    checklists: [],
  };

  for (var ci = 0; ci < task.children.length; ci++) {
    var child = task.children[ci];
    if (child.type === 'note') State.editDraft.notes.push({ content: child.content, rawContent: child.rawContent || child.content, lineIndex: child.lineIndex });
    else if (child.type === 'checklist') State.editDraft.checklists.push({ content: child.content, status: child.status, lineIndex: child.lineIndex });
  }
  State.editDraft.activeField = null; // null = view mode, 'title' or 'notes' = editing

  var row = document.querySelector('.cl-task-row[data-task-id="' + CSS.escape(taskId) + '"]');
  if (!row) return;
  row.style.display = 'none';

  var editor = document.createElement('div');
  editor.className = 'cl-task-editor';
  editor.id = 'cl-editor';
  editor.innerHTML = renderTaskEditorHTML(task);
  row.parentNode.insertBefore(editor, row.nextSibling);

  var subTasks = task.children.filter(function(c) { return c.type === 'task'; });
  for (var si = subTasks.length - 1; si >= 0; si--) {
    var subRow = document.createElement('div');
    subRow.className = 'cl-subtask-row';
    subRow.innerHTML = renderTaskRow(subTasks[si], { showSource: false });
    editor.parentNode.insertBefore(subRow, editor.nextSibling);
  }

  attachEditorListeners(editor);
}

export function collapseTask() {
  if (!State.expandedTaskId) return;
  var editor = document.getElementById('cl-editor');
  if (editor) {
    var taskId = State.expandedTaskId;
    var row = document.querySelector('.cl-task-row[data-task-id="' + CSS.escape(taskId) + '"]');
    if (row) row.style.display = '';
    var subRows = document.querySelectorAll('.cl-subtask-row');
    for (var i = 0; i < subRows.length; i++) subRows[i].remove();
    editor.remove();
  }
  State.expandedTaskId = null;
  State.editDraft = null;
}

function renderTaskEditorHTML(task) {
  var draft = State.editDraft;
  var html = '';

  // Title: view mode (rendered markdown) or edit mode (input)
  html += '<div class="cl-editor-row">';
  var editorCbClass = task.type === 'checklist' ? 'cl-cb cl-cb-square' : 'cl-cb';
  html += '<div class="' + editorCbClass + '" data-action="toggle"></div>';
  if (draft.activeField === 'title') {
    html += '<input class="cl-editor-title cl-editor-field-active" value="' + esc(draft.content) + '" data-field="title"/>';
  } else {
    html += '<div class="cl-editor-title-view" data-field-view="title">' + renderInlineMarkdown(draft.content) + '</div>';
  }
  html += '</div>';

  // Notes: view mode (rendered markdown from rawContent) or edit mode (plain content without markers)
  var notesForEdit = draft.notes.map(function(n) { return n.content || ''; }).join('\n');
  html += '<div class="cl-editor-section">';
  if (draft.activeField === 'notes') {
    html += '<textarea class="cl-editor-notes cl-editor-field-active" data-field="notes">' + esc(notesForEdit) + '</textarea>';
  } else if (notesForEdit.trim()) {
    html += '<div class="cl-editor-notes-view" data-field-view="notes">' + renderNotesMarkdown(draft.notes) + '</div>';
  } else {
    html += '<div class="cl-editor-notes-view cl-editor-notes-empty" data-field-view="notes">Notes...</div>';
  }
  html += '</div>';

  if (draft.checklists.length > 0) {
    html += '<div class="cl-editor-section">';
    html += '<div class="cl-editor-label">Checklist</div>';
    for (var ci = 0; ci < draft.checklists.length; ci++) {
      var cl = draft.checklists[ci];
      var clDone = cl.status === 'done' ? ' cl-cl-done' : '';
      html += '<div class="cl-checklist-item' + clDone + '" data-index="' + ci + '">';
      html += '<div class="cl-cl-check" data-action="toggleChecklist"></div>';
      html += '<span class="cl-cl-text">' + esc(cl.content) + '</span>';
      html += '</div>';
    }
    html += '</div>';
  }

  html += '<div class="cl-editor-meta">';
  var dateLabel = 'Schedule...';
  if (draft.scheduledDate) dateLabel = formatShortDate(draft.scheduledDate);
  else if (draft.scheduledWeek) dateLabel = draft.scheduledWeek;
  html += '<div class="cl-meta-chip" data-action="openDatePicker"><span class="cl-meta-icon">\uD83D\uDCC5</span>' + dateLabel + '</div>';

  // Current location — click to open in split view
  if (task.noteFilename) {
    var noteLabel = draft.moveToFilename ? esc(draft.moveToLabel || 'Moved') : esc(task.noteTitle);
    html += '<div class="cl-meta-chip" data-action="jumpToProjectNote" data-filename="' + esc(task.noteFilename) + '"><span class="cl-meta-icon">\uD83D\uDCC1</span>' + noteLabel + '</div>';
  }
  // Move to... button
  html += '<div class="cl-meta-chip cl-meta-add" data-action="openNotePicker">\u2192 Move to...</div>';

  for (var ti = 0; ti < draft.tags.length; ti++) {
    html += '<div class="cl-meta-chip cl-meta-tag" data-action="removeTag" data-tag="' + esc(draft.tags[ti]) + '">' + esc(draft.tags[ti]) + ' <span class="cl-remove">\u00d7</span></div>';
  }
  html += '<div class="cl-meta-chip cl-meta-add" data-action="addTag">+ tag</div>';

  for (var mi = 0; mi < draft.mentions.length; mi++) {
    html += '<div class="cl-meta-chip cl-meta-mention">' + esc(draft.mentions[mi]) + '</div>';
  }
  html += '<div class="cl-meta-chip cl-meta-add" data-action="addMention">+ @mention</div>';

  var priLabels = ['\u2014', '!', '!!', '!!!'];
  html += '<div class="cl-meta-chip cl-meta-pri cl-pri-' + draft.priority + '" data-action="cyclePri">' + priLabels[draft.priority] + '</div>';

  html += '</div>';
  html += '<div class="cl-editor-hints">\u2318Enter save \u00b7 Esc cancel \u00b7 \u2318T today \u00b7 \u2318O remove date</div>';
  html += '<div class="cl-editor-actions"><button class="cl-editor-btn cl-editor-btn-cancel" data-action="editorCancel">Cancel</button><button class="cl-editor-btn cl-editor-btn-save" data-action="editorSave">Save</button></div>';
  return html;
}

function renderNotesMarkdown(notes) {
  var html = '';
  for (var i = 0; i < notes.length; i++) {
    var raw = notes[i].rawContent || notes[i].content || '';
    // Strip leading tab
    raw = raw.replace(/^\t+/, '');
    // Detect type from raw prefix
    if (raw.match(/^>\s?/)) {
      html += '<div class="cl-editor-note-line cl-note-quote" style="margin:2px 0;">' + renderInlineMarkdown(raw.replace(/^>\s?/, '')) + '</div>';
    } else if (raw.match(/^[-*]\s+/)) {
      html += '<div class="cl-editor-note-line">\u2022 ' + renderInlineMarkdown(raw.replace(/^[-*]\s+/, '')) + '</div>';
    } else {
      html += '<div class="cl-editor-note-line">' + renderInlineMarkdown(raw) + '</div>';
    }
  }
  return html;
}

function activateEditorField(fieldName) {
  if (!State.editDraft) return;
  // Save current field value before switching
  saveActiveFieldValue();
  State.editDraft.activeField = fieldName;
  // Re-render the editor
  var task = null;
  for (var i = 0; i < State.tasks.length; i++) {
    if (State.tasks[i].id === State.expandedTaskId) { task = State.tasks[i]; break; }
  }
  if (!task) return;
  var editor = document.getElementById('cl-editor');
  if (!editor) return;
  editor.innerHTML = renderTaskEditorHTML(task);
  attachEditorListeners(editor);
  // Focus the newly active field
  if (fieldName === 'title') {
    var el = editor.querySelector('.cl-editor-title');
    if (el) { el.focus(); el.select(); }
  } else if (fieldName === 'notes') {
    var el = editor.querySelector('.cl-editor-notes');
    if (el) { el.focus(); }
  }
}

function saveActiveFieldValue() {
  if (!State.editDraft) return;
  var editor = document.getElementById('cl-editor');
  if (!editor) return;
  if (State.editDraft.activeField === 'title') {
    var titleEl = editor.querySelector('.cl-editor-title');
    if (titleEl) State.editDraft.content = titleEl.value;
  } else if (State.editDraft.activeField === 'notes') {
    var notesEl = editor.querySelector('.cl-editor-notes');
    if (notesEl) {
      var lines = notesEl.value.split('\n');
      State.editDraft.notes = lines.map(function(l, i) {
        var orig = State.editDraft.notes[i];
        // Preserve original rawContent structure (marker + tab) if the line existed before
        // For new lines, just use the content as-is
        return { content: l, rawContent: orig ? orig.rawContent : '\t' + l, lineIndex: orig ? orig.lineIndex : -1 };
      });
    }
  }
}

function attachEditorListeners(editor) {
  // Click on view fields to enter edit mode
  editor.addEventListener('click', function(e) {
    var viewField = e.target.closest('[data-field-view]');
    if (viewField) {
      activateEditorField(viewField.dataset.fieldView);
      return;
    }
    var target = e.target.closest('[data-action]');
    if (!target) return;
    var action = target.dataset.action;
    switch (action) {
      case 'toggleChecklist':
        var item = target.closest('.cl-checklist-item');
        if (item) {
          var idx = parseInt(item.dataset.index);
          if (State.editDraft.checklists[idx]) {
            State.editDraft.checklists[idx].status = State.editDraft.checklists[idx].status === 'done' ? 'open' : 'done';
            item.classList.toggle('cl-cl-done');
          }
        }
        break;
      case 'cyclePri':
        State.editDraft.priority = (State.editDraft.priority + 1) % 4;
        var priLabels = ['\u2014', '!', '!!', '!!!'];
        target.textContent = priLabels[State.editDraft.priority];
        target.className = 'cl-meta-chip cl-meta-pri cl-pri-' + State.editDraft.priority;
        break;
      case 'removeTag':
        var tag = target.dataset.tag;
        State.editDraft.tags = State.editDraft.tags.filter(function(t) { return t !== tag; });
        target.remove();
        break;
      case 'addTag':
        showInlineInput(target, '#', function(val) {
          if (!val.startsWith('#')) val = '#' + val;
          State.editDraft.tags.push(val);
          reRenderEditorMeta();
        });
        break;
      case 'addMention':
        showInlineInput(target, '@', function(val) {
          if (!val.startsWith('@')) val = '@' + val;
          State.editDraft.mentions.push(val);
          reRenderEditorMeta();
        });
        break;
      case 'openDatePicker':
        showDatePicker(target);
        break;
      case 'openNotePicker':
        showNotePicker(target);
        break;
      case 'editorSave':
        saveExpandedTask();
        break;
      case 'editorCancel':
        collapseTask();
        break;
    }
  });

  // Tab cycles between title and notes only
  editor.addEventListener('keydown', function(e) {
    if (e.key === 'Tab') {
      e.preventDefault();
      e.stopPropagation();
      var current = State.editDraft.activeField;
      if (current === 'title') {
        activateEditorField('notes');
      } else if (current === 'notes') {
        activateEditorField('title');
      } else {
        // No field active, activate title
        activateEditorField('title');
      }
    }
  });
}

function reRenderEditorMeta() {
  var task = null;
  for (var i = 0; i < State.tasks.length; i++) {
    if (State.tasks[i].id === State.expandedTaskId) { task = State.tasks[i]; break; }
  }
  if (!task) return;
  var editor = document.getElementById('cl-editor');
  if (editor) {
    // Preserve title and notes values
    var titleVal = '';
    var notesVal = '';
    var titleEl = editor.querySelector('.cl-editor-title');
    var notesEl = editor.querySelector('.cl-editor-notes');
    if (titleEl) titleVal = titleEl.value;
    if (notesEl) notesVal = notesEl.value;
    editor.innerHTML = renderTaskEditorHTML(task);
    titleEl = editor.querySelector('.cl-editor-title');
    notesEl = editor.querySelector('.cl-editor-notes');
    if (titleEl) titleEl.value = titleVal;
    if (notesEl) notesEl.value = notesVal;
    attachEditorListeners(editor);
  }
}

function saveExpandedTask() {
  if (!State.expandedTaskId || !State.editDraft) return;
  // Save any active field value first
  saveActiveFieldValue();
  var draft = State.editDraft;
  var taskId = State.expandedTaskId;
  var parts = taskId.split(':');
  var filename = parts.slice(0, -1).join(':');
  var lineIndex = parseInt(parts[parts.length - 1]);

  var msg = {
    filename: filename, lineIndex: lineIndex,
    content: draft.content, priority: draft.priority,
    scheduledDate: draft.scheduledDate, scheduledWeek: draft.scheduledWeek,
    tags: draft.tags, mentions: draft.mentions,
    notes: draft.notes, checklists: draft.checklists,
    moveToFilename: draft.moveToFilename,
  };

  sendMessageToPlugin('saveTask', JSON.stringify(msg));

  if (draft.moveToFilename && State.currentView === 'inbox') {
    State.movedFromInbox.push(taskId);
  }

  collapseTask();
}

// ─── Date Picker ───────────────────────────────────────────
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

function showDatePicker(anchor) {
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
    '<div class="cl-picker-action" data-action="removeDate"><span>\u2715</span> Remove date <span class="cl-shortcut">\u2318O</span></div>' +
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
  html += '<div class="cl-picker-option cl-picker-today" data-action="selectDate" data-date="' + today + '"><span>\u2B50</span><span class="cl-picker-opt-label">Today</span><span class="cl-picker-opt-date">' + formatShortDate(today) + '</span></div>';
  html += '<div class="cl-picker-option" data-action="selectDate" data-date="' + tmr + '"><span>\u2192</span><span class="cl-picker-opt-label">Tomorrow</span><span class="cl-picker-opt-date">' + formatShortDate(tmr) + '</span></div>';
  html += '<div class="cl-picker-option" data-action="selectDate" data-date="' + nextMon + '"><span>\uD83D\uDCC5</span><span class="cl-picker-opt-label">Next Monday</span><span class="cl-picker-opt-date">' + formatShortDate(nextMon) + '</span></div>';
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
  html += '<div class="cl-cal-nav"><span class="cl-cal-arrow">\u25C0</span><span class="cl-cal-month">' + months[month] + ' ' + year + '</span><span class="cl-cal-arrow">\u25B6</span></div>';
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

function updateDateChip() {
  var editor = document.getElementById('cl-editor');
  if (!editor || !State.editDraft) return;
  var chip = editor.querySelector('[data-action="openDatePicker"]');
  if (!chip) return;
  var label = 'Schedule...';
  if (State.editDraft.scheduledDate) label = formatShortDate(State.editDraft.scheduledDate);
  else if (State.editDraft.scheduledWeek) label = State.editDraft.scheduledWeek;
  chip.innerHTML = '<span class="cl-meta-icon">\uD83D\uDCC5</span>' + label;
}

// ─── Note Picker ───────────────────────────────────────────
function showNotePicker(anchor) {
  closePickers();
  var rect = anchor.getBoundingClientRect();
  var picker = document.createElement('div');
  picker.className = 'cl-picker cl-note-picker';
  picker.style.top = (rect.bottom + 4) + 'px';
  picker.style.left = Math.min(rect.left, window.innerWidth - 310) + 'px';

  picker.innerHTML =
    '<div class="cl-picker-search"><input class="cl-picker-input" placeholder="Search notes..." autofocus/></div>' +
    '<div class="cl-picker-results" id="cl-note-results">' + renderNoteResults('') + '</div>' +
    '<div class="cl-picker-footer"><span style="opacity:0.35;font-size:11px;">\u21b5 select \u00b7 Esc close</span></div>';

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
        if (chip) chip.textContent = '\u2192 ' + target.dataset.title;
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
      html += '<span class="cl-picker-note-icon">\uD83D\uDCCD</span>';
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
      html += '<span class="cl-picker-note-icon">\uD83D\uDCC4</span>';
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

function showInlineInput(anchor, prefix, onCommit) {
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

function closePickers() {
  var pickers = document.querySelectorAll('.cl-picker');
  for (var i = 0; i < pickers.length; i++) pickers[i].remove();
}




// ─── Keyboard Shortcuts ────────────────────────────────────
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
    var active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
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
    var active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    var rows = document.querySelectorAll('.cl-task-row');
    if (State.focusedTaskIndex >= 0 && rows[State.focusedTaskIndex]) {
      e.preventDefault();
      expandTask(rows[State.focusedTaskIndex].dataset.taskId);
    }
  }

  // Space: toggle focused task
  if (e.key === ' ' && !State.expandedTaskId) {
    var active = document.activeElement;
    if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
    var rows = document.querySelectorAll('.cl-task-row');
    if (State.focusedTaskIndex >= 0 && rows[State.focusedTaskIndex]) {
      e.preventDefault();
      toggleTask(rows[State.focusedTaskIndex].dataset.taskId);
    }
  }
});


