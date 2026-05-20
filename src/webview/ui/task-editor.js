/* global sendMessageToPlugin */
// Expanded inline task editor. `expandTask` swaps the focused .cl-task-row
// out for an editor block with title, notes, checklist children, and the
// metadata chip strip; Tab toggles between title and notes; ⌘Enter saves;
// Esc cancels. `editDraft` lives on State and is the single source of truth
// for unsaved field values while the editor is open.

import { State } from '../state.js';
import { esc, formatShortDate } from '../lib/helpers.js';
import { renderInlineMarkdown } from '../lib/markdown.js';
import { renderTaskRow } from './task-list.js';
import {
  showDatePicker,
  showNotePicker,
  showInlineInput,
} from './pickers.js';

export function expandTask(taskId) {
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
  State.editDraft.activeField = null; // null = view mode, 'title'|'notes'|'checklist' = editing
  State.editDraft.editingChecklistIndex = null;

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

  // Scroll the editor into view if it (or its sub-rows) extend past the
  // viewport, leaving a `margin` of breathing room between the editor edge
  // and the scroller edge. Run on next tick so layout has finalized.
  setTimeout(function() {
    var subRows = editor.parentNode ? editor.parentNode.querySelectorAll('.cl-subtask-row') : [];
    var last = subRows.length ? subRows[subRows.length - 1] : editor;
    var scroller = editor.closest('.cl-note-content') || editor.closest('.cl-task-list');
    if (!scroller) return;
    var margin = 24;
    var scrollerRect = scroller.getBoundingClientRect();
    var topRect = editor.getBoundingClientRect();
    var bottomRect = last.getBoundingClientRect();
    var overshoot = bottomRect.bottom - (scrollerRect.bottom - margin);
    var undershoot = (scrollerRect.top + margin) - topRect.top;
    if (overshoot > 0) {
      scroller.scrollTo({ top: scroller.scrollTop + overshoot, behavior: 'smooth' });
    } else if (undershoot > 0) {
      scroller.scrollTo({ top: scroller.scrollTop - undershoot, behavior: 'smooth' });
    }
  }, 0);
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
      if (draft.activeField === 'checklist' && draft.editingChecklistIndex === ci) {
        html += '<input class="cl-cl-text cl-cl-text-input cl-editor-field-active" data-field="checklist" data-index="' + ci + '" value="' + esc(cl.content) + '"/>';
      } else {
        html += '<span class="cl-cl-text" data-field-view="checklist" data-index="' + ci + '">' + renderInlineMarkdown(cl.content) + '</span>';
      }
      html += '</div>';
    }
    html += '</div>';
  }

  html += '<div class="cl-editor-meta">';
  var dateLabel = 'Schedule...';
  if (draft.scheduledDate) dateLabel = formatShortDate(draft.scheduledDate);
  else if (draft.scheduledWeek) dateLabel = draft.scheduledWeek;
  html += '<div class="cl-meta-chip" data-action="openDatePicker"><span class="cl-meta-icon">📅</span>' + dateLabel + '</div>';

  // Current location — click to open in split view
  if (task.noteFilename) {
    var noteLabel = draft.moveToFilename ? esc(draft.moveToLabel || 'Moved') : esc(task.noteTitle);
    html += '<div class="cl-meta-chip" data-action="jumpToProjectNote" data-filename="' + esc(task.noteFilename) + '"><span class="cl-meta-icon">📁</span>' + noteLabel + '</div>';
  }
  // Move to... button
  html += '<div class="cl-meta-chip cl-meta-add" data-action="openNotePicker">→ Move to...</div>';

  for (var ti = 0; ti < draft.tags.length; ti++) {
    html += '<div class="cl-meta-chip cl-meta-tag" data-action="removeTag" data-tag="' + esc(draft.tags[ti]) + '">' + esc(draft.tags[ti]) + ' <span class="cl-remove">×</span></div>';
  }
  html += '<div class="cl-meta-chip cl-meta-add" data-action="addTag">+ tag</div>';

  for (var mi = 0; mi < draft.mentions.length; mi++) {
    html += '<div class="cl-meta-chip cl-meta-mention">' + esc(draft.mentions[mi]) + '</div>';
  }
  html += '<div class="cl-meta-chip cl-meta-add" data-action="addMention">+ @mention</div>';

  var priLabels = ['—', '!', '!!', '!!!'];
  html += '<div class="cl-meta-chip cl-meta-pri cl-pri-' + draft.priority + '" data-action="cyclePri">' + priLabels[draft.priority] + '</div>';

  html += '</div>';
  html += '<div class="cl-editor-hints">⌘Enter save · Esc cancel · ⌘T today · ⌘O remove date</div>';
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
      html += '<div class="cl-editor-note-line">• ' + renderInlineMarkdown(raw.replace(/^[-*]\s+/, '')) + '</div>';
    } else {
      html += '<div class="cl-editor-note-line">' + renderInlineMarkdown(raw) + '</div>';
    }
  }
  return html;
}

function activateEditorField(fieldName, checklistIndex) {
  if (!State.editDraft) return;
  // Save current field value before switching
  saveActiveFieldValue();
  State.editDraft.activeField = fieldName;
  State.editDraft.editingChecklistIndex = fieldName === 'checklist' ? checklistIndex : null;
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
  } else if (fieldName === 'checklist') {
    var el = editor.querySelector('.cl-cl-text-input');
    if (el) { el.focus(); el.select(); }
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
  } else if (State.editDraft.activeField === 'checklist') {
    var clEl = editor.querySelector('.cl-cl-text-input');
    if (clEl) {
      var idx = parseInt(clEl.dataset.index);
      if (State.editDraft.checklists[idx]) State.editDraft.checklists[idx].content = clEl.value;
    }
  }
}

function attachEditorListeners(editor) {
  // Click on view fields to enter edit mode
  editor.addEventListener('click', function(e) {
    if (e.target.closest('a.cl-link')) return;
    var viewField = e.target.closest('[data-field-view]');
    if (viewField) {
      var fv = viewField.dataset.fieldView;
      if (fv === 'checklist') {
        activateEditorField('checklist', parseInt(viewField.dataset.index));
      } else {
        activateEditorField(fv);
      }
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
            saveActiveFieldValue();
            State.editDraft.checklists[idx].status = State.editDraft.checklists[idx].status === 'done' ? 'open' : 'done';
            item.classList.toggle('cl-cl-done');
          }
        }
        break;
      case 'cyclePri':
        State.editDraft.priority = (State.editDraft.priority + 1) % 4;
        var priLabels = ['—', '!', '!!', '!!!'];
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

export function saveExpandedTask() {
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
