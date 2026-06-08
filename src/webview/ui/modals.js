/* global sendMessageToPlugin */
import { sendToPlugin } from '../lib/bridge.js';
// Cheatsheet + confirmation + project-action overlays. These all hang
// off the document body and tear themselves down on outside click / Esc.
//
// Why grouped: each modal is a small self-contained UI pattern with the
// same lifecycle (create overlay, listen for outside click, close).
// Splitting them further would create five 30-line files for no gain.

import { State } from '../state.js';
import { esc } from '../lib/helpers.js';
import { renderCurrentView } from './views.js';
import { collapseTask } from './task-editor.js';
import { parseClarityFlags, serializeClarityFlags } from '../lib/clarity-flags.js';

// ─── Confirmation Modal ─────────────────────────────────────
export function openConfirmModal(opts) {
  var existing = document.querySelector('.cl-confirm-overlay');
  if (existing) existing.remove();

  var title = opts.title || 'Are you sure?';
  var message = opts.message || '';
  var confirmLabel = opts.confirmLabel || 'Confirm';
  var cancelLabel = opts.cancelLabel || 'Cancel';
  var destructive = !!opts.destructive;

  var overlay = document.createElement('div');
  overlay.className = 'cl-confirm-overlay';
  overlay.innerHTML =
    '<div class="cl-confirm-modal">' +
      '<div class="cl-confirm-title">' + esc(title) + '</div>' +
      (message ? '<div class="cl-confirm-message">' + esc(message) + '</div>' : '') +
      '<div class="cl-confirm-actions">' +
        '<button class="cl-confirm-cancel" type="button">' + esc(cancelLabel) + '</button>' +
        '<button class="cl-confirm-ok' + (destructive ? ' cl-confirm-destructive' : '') + '" type="button">' + esc(confirmLabel) + '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  var okBtn = overlay.querySelector('.cl-confirm-ok');
  var cancelBtn = overlay.querySelector('.cl-confirm-cancel');

  function close() { overlay.remove(); }
  function confirm() { close(); if (typeof opts.onConfirm === 'function') opts.onConfirm(); }
  function cancel() { close(); if (typeof opts.onCancel === 'function') opts.onCancel(); }

  okBtn.addEventListener('click', confirm);
  cancelBtn.addEventListener('click', cancel);
  overlay.addEventListener('click', function(e) { if (e.target === overlay) cancel(); });
  overlay.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); confirm(); }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancel(); }
  });

  setTimeout(function() { okBtn.focus(); }, 0);
}

export function deleteTaskById(taskId) {
  if (!taskId) return;
  var task = null;
  for (var i = 0; i < State.tasks.length; i++) {
    if (State.tasks[i].id === taskId) { task = State.tasks[i]; break; }
  }
  // Fall back to parsing the id if the task isn't in State.tasks (e.g. pure note view).
  var parts = taskId.split(':');
  var filename = parts.slice(0, -1).join(':');
  var lineIndex = parseInt(parts[parts.length - 1]);
  if (isNaN(lineIndex)) return;
  var preview = task ? task.content : '';

  openConfirmModal({
    title: 'Delete this task?',
    message: preview ? '“' + preview + '” will be removed from its note. This cannot be undone from Clarity.' : 'The task will be removed from its note. This cannot be undone from Clarity.',
    confirmLabel: 'Delete',
    cancelLabel: 'Cancel',
    destructive: true,
    onConfirm: function() {
      // Optimistic local removal.
      State.tasks = State.tasks.filter(function(t) { return t.id !== taskId; });
      if (State.expandedTaskId === taskId) collapseTask();
      State.focusedTaskIndex = -1;
      renderCurrentView();
      sendToPlugin('deleteTask', JSON.stringify({ filename: filename, lineIndex: lineIndex }));
    },
  });
}

// ─── Keyboard Shortcuts Cheatsheet ──────────────────────────
var SHORTCUTS_GROUPS = [
  {
    title: 'Navigation',
    items: [
      { keys: ['⌘1', '..', '⌘5'], label: 'Switch view (Inbox, Today, Upcoming, Anytime, Someday)' },
      { keys: ['⌘/'], label: 'Quick-jump to a project or area' },
      { keys: ['↑', '↓'], label: 'Move focus between tasks' },
      { keys: ['⌘⌃↑', '⌘⌃↓'], label: 'Move the focused task up / down' },
      { keys: ['Enter'], label: 'Open the focused task' },
      { keys: ['Esc'], label: 'Close editor, picker, or palette' },
    ],
  },
  {
    title: 'Task actions',
    items: [
      { keys: ['Space'], label: 'Toggle the focused task done / open' },
      { keys: ['⌘T'], label: 'Schedule for today' },
      { keys: ['⌘⇧T'], label: 'Schedule for tomorrow' },
      { keys: ['⌘E'], label: 'Add to "This Evening"' },
      { keys: ['⌘O'], label: 'Clear schedule' },
      { keys: ['⌘⌫'], label: 'Delete task (with confirmation)' },
      { keys: ['⌘Enter'], label: 'Save the open task editor' },
    ],
  },
  {
    title: 'Other',
    items: [
      { keys: ['⌘N'], label: 'Focus the New Task input' },
      { keys: ['⌘⌃N'], label: 'New task below the focused task' },
      { keys: ['⌘⇧N'], label: 'New heading below the focused task' },
      { keys: ['⌘⌥N'], label: 'New project note in this folder' },
      { keys: ['?'], label: 'Show this cheatsheet' },
    ],
  },
];

export function openShortcutsCheatsheet() {
  var existing = document.querySelector('.cl-cheatsheet-overlay');
  if (existing) { existing.remove(); return; }

  var html = '<div class="cl-cheatsheet-modal">' +
    '<div class="cl-cheatsheet-title">Keyboard shortcuts</div>';
  for (var gi = 0; gi < SHORTCUTS_GROUPS.length; gi++) {
    var g = SHORTCUTS_GROUPS[gi];
    html += '<div class="cl-cheatsheet-section">';
    html += '<div class="cl-cheatsheet-section-title">' + esc(g.title) + '</div>';
    for (var ii = 0; ii < g.items.length; ii++) {
      var it = g.items[ii];
      var keysHtml = '';
      for (var ki = 0; ki < it.keys.length; ki++) {
        var k = it.keys[ki];
        if (k === '..') keysHtml += '<span class="cl-cheatsheet-sep">…</span>';
        else keysHtml += '<kbd class="cl-cheatsheet-kbd">' + esc(k) + '</kbd>';
      }
      html += '<div class="cl-cheatsheet-row">' +
        '<div class="cl-cheatsheet-keys">' + keysHtml + '</div>' +
        '<div class="cl-cheatsheet-label">' + esc(it.label) + '</div>' +
        '</div>';
    }
    html += '</div>';
  }
  html += '<div class="cl-cheatsheet-foot">Press <kbd class="cl-cheatsheet-kbd">?</kbd> or <kbd class="cl-cheatsheet-kbd">Esc</kbd> to close</div>';
  html += '</div>';

  var overlay = document.createElement('div');
  overlay.className = 'cl-cheatsheet-overlay';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) overlay.remove();
  });
}

// ─── Project Actions Dropdown ───────────────────────────────
var _projectMenuOutsideListener = null;

export function closeProjectMenu() {
  var existing = document.querySelector('.cl-project-menu');
  if (existing) existing.remove();
  if (_projectMenuOutsideListener) {
    document.removeEventListener('mousedown', _projectMenuOutsideListener, true);
    _projectMenuOutsideListener = null;
  }
}

export function toggleProjectMenu(button) {
  if (document.querySelector('.cl-project-menu')) { closeProjectMenu(); return; }
  var wrap = button.closest('.cl-project-menu-wrap');
  if (!wrap) return;
  var fn = State.currentNoteFilename || (State.noteContent && State.noteContent.filename) || '';
  var menu = document.createElement('div');
  menu.className = 'cl-project-menu';
  menu.innerHTML =
    '<button type="button" class="cl-project-menu-item" data-action="refreshProject" data-filename="' + esc(fn) + '">' +
      '<span class="cl-project-menu-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3.5-7.1"/><path d="M21 4v5h-5"/></svg></span>' +
      '<span>Refresh</span>' +
    '</button>' +
    '<button type="button" class="cl-project-menu-item" data-action="openNoteMetaModal">' +
      '<span class="cl-project-menu-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></span>' +
      '<span>Edit metadata…</span>' +
    '</button>' +
    '<button type="button" class="cl-project-menu-item" data-action="moveCompletedToBottom" data-filename="' + esc(fn) + '">' +
      '<span class="cl-project-menu-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v12"/><path d="M6 14l6 6 6-6"/><path d="M5 22h14"/></svg></span>' +
      '<span>Move completed to bottom</span>' +
    '</button>' +
    '<div class="cl-project-menu-sep"></div>' +
    '<button type="button" class="cl-project-menu-item cl-project-menu-destructive" data-action="archiveProject">' +
      '<span class="cl-project-menu-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8H3v13h18V8z"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg></span>' +
      '<span>Move to archive…</span>' +
    '</button>';
  menu.style.visibility = 'hidden';
  (document.getElementById('cl-main') || document.body).appendChild(menu);
  var btnRect = button.getBoundingClientRect();
  var menuW = menu.offsetWidth;
  var menuH = menu.offsetHeight;
  var left = btnRect.right - menuW;
  if (left < 8) left = 8;
  var maxLeft = window.innerWidth - menuW - 8;
  if (left > maxLeft) left = maxLeft;
  var top = btnRect.bottom + 4;
  if (top + menuH > window.innerHeight - 8) {
    var above = btnRect.top - 4 - menuH;
    if (above >= 8) top = above;
  }
  menu.style.left = left + 'px';
  menu.style.top = top + 'px';
  menu.style.visibility = '';

  _projectMenuOutsideListener = function(e) {
    if (!menu.contains(e.target) && !button.contains(e.target)) closeProjectMenu();
  };
  setTimeout(function() {
    document.addEventListener('mousedown', _projectMenuOutsideListener, true);
  }, 0);
}

export function confirmArchiveProject() {
  var nc = State.noteContent;
  var fn = (nc && nc.filename) || State.currentNoteFilename;
  if (!fn) return;
  var origFolder = fn.replace(/\/[^/]+$/, '');
  if (origFolder === fn) origFolder = '';
  var leaf = fn.split('/').pop();
  var targetPath = '@Archive/' + State.today + (origFolder ? '/' + origFolder : '') + '/' + leaf;
  var title = (nc && nc.title) || leaf.replace(/\.(md|txt)$/, '');
  openConfirmModal({
    title: 'Move to archive?',
    message: '“' + title + '” will be moved to: ' + targetPath,
    confirmLabel: 'Archive',
    cancelLabel: 'Cancel',
    destructive: true,
    onConfirm: function() {
      sendToPlugin('archiveProject', JSON.stringify({ filename: fn }));
    },
  });
}

// ─── (merged from note-meta-modal.js) ─────────────────────────

export function openNoteMetaModal() {
  var nc = State.noteContent;
  if (!nc) return;
  var existing = document.querySelector('.cl-meta-overlay');
  if (existing) { existing.remove(); return; }

  var fm = nc.frontmatter || {};
  var typeVal = fm.type === 'project' || fm.type === 'area' ? fm.type : '';
  var statusVal = (fm.status === 'working' || fm.status === 'paused' || fm.status === 'someday' || fm.status === 'completed' || fm.status === 'canceled') ? fm.status : '';
  var dueVal = fm.due || '';
  var reviewedVal = fm.reviewed || '';
  var reviewVal = fm.review || '';
  var clarityFlags = parseClarityFlags(fm);

  var overlay = document.createElement('div');
  overlay.className = 'cl-meta-overlay';
  overlay.innerHTML =
    '<div class="cl-meta-modal">' +
      '<div class="cl-meta-modal-title">Project metadata</div>' +
      '<div class="cl-meta-row">' +
        '<label class="cl-meta-label">Type</label>' +
        '<select class="cl-meta-input" data-field="type">' +
          '<option value=""' + (typeVal === '' ? ' selected' : '') + '>—</option>' +
          '<option value="project"' + (typeVal === 'project' ? ' selected' : '') + '>Project</option>' +
          '<option value="area"' + (typeVal === 'area' ? ' selected' : '') + '>Area</option>' +
        '</select>' +
      '</div>' +
      '<div class="cl-meta-row">' +
        '<label class="cl-meta-label">Status</label>' +
        '<select class="cl-meta-input" data-field="status">' +
          '<option value=""' + (statusVal === '' ? ' selected' : '') + '>Active</option>' +
          '<option value="working"' + (statusVal === 'working' ? ' selected' : '') + '>Working</option>' +
          '<option value="paused"' + (statusVal === 'paused' ? ' selected' : '') + '>Paused</option>' +
          '<option value="someday"' + (statusVal === 'someday' ? ' selected' : '') + '>Someday</option>' +
          (typeVal === 'project'
            ? ('<option value="completed"' + (statusVal === 'completed' ? ' selected' : '') + '>Completed</option>' +
               '<option value="canceled"' + (statusVal === 'canceled' ? ' selected' : '') + '>Canceled</option>')
            : '') +
        '</select>' +
      '</div>' +
      '<div class="cl-meta-row">' +
        '<label class="cl-meta-label">Deadline</label>' +
        '<div class="cl-meta-inline" data-field="due-row">' +
          (dueVal
            ? ('<input class="cl-meta-input" type="date" data-field="due" value="' + esc(dueVal) + '">' +
               '<button class="cl-meta-link" type="button" data-action="metaClearDue">Clear</button>')
            : ('<span class="cl-meta-readonly" data-field="due-display">—</span>' +
               '<button class="cl-meta-link" type="button" data-action="metaSetDue">Set deadline</button>')) +
        '</div>' +
      '</div>' +
      '<div class="cl-meta-row">' +
        '<label class="cl-meta-label">Last Review</label>' +
        '<div class="cl-meta-inline">' +
          '<span class="cl-meta-readonly" data-field="reviewed-display">' + esc(reviewedVal || '—') + '</span>' +
          '<button class="cl-meta-link" type="button" data-action="metaMarkReviewed">Mark as reviewed</button>' +
        '</div>' +
      '</div>' +
      '<div class="cl-meta-row">' +
        '<label class="cl-meta-label">Review Schedule</label>' +
        '<input class="cl-meta-input" type="text" data-field="review" placeholder="e.g. 1w, 2w, 1m" value="' + esc(reviewVal) + '">' +
      '</div>' +
      '<div class="cl-meta-row">' +
        '<label class="cl-meta-label">Clarity view</label>' +
        '<div class="cl-meta-chips" data-field="clarity-chips">' +
          '<button type="button" class="cl-meta-chip' + (clarityFlags.toc ? ' cl-meta-chip-active' : '') + '" data-flag="toc">TOC</button>' +
          '<button type="button" class="cl-meta-chip' + (clarityFlags.indent ? ' cl-meta-chip-active' : '') + '" data-flag="indent">Indent</button>' +
          '<button type="button" class="cl-meta-chip' + (clarityFlags.focus ? ' cl-meta-chip-active' : '') + '" data-flag="focus">Focus</button>' +
          '<button type="button" class="cl-meta-chip' + (clarityFlags.progress ? ' cl-meta-chip-active' : '') + '" data-flag="progress">Progress</button>' +
        '</div>' +
      '</div>' +
      '<div class="cl-meta-actions">' +
        '<button class="cl-meta-cancel" type="button">Cancel</button>' +
        '<button class="cl-meta-save" type="button">Save</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(overlay);

  // Track an in-modal draft so "Mark as reviewed" updates the displayed date.
  var draft = { type: typeVal, status: statusVal, due: dueVal, reviewed: reviewedVal, review: reviewVal };

  function close() { overlay.remove(); }
  function readInputs() {
    var typeSel = overlay.querySelector('[data-field="type"]');
    var statusSel = overlay.querySelector('[data-field="status"]');
    var dueIn = overlay.querySelector('[data-field="due"]');
    var reviewIn = overlay.querySelector('[data-field="review"]');
    if (typeSel) draft.type = typeSel.value;
    if (statusSel) draft.status = statusSel.value;
    if (dueIn) draft.due = dueIn.value;
    if (reviewIn) draft.review = reviewIn.value.trim();
  }
  function save() {
    readInputs();
    var chipFlags = { toc: false, indent: false, focus: false, progress: false };
    var chips = overlay.querySelectorAll('.cl-meta-chip');
    for (var ci = 0; ci < chips.length; ci++) {
      if (chips[ci].classList.contains('cl-meta-chip-active')) {
        chipFlags[chips[ci].dataset.flag] = true;
      }
    }
    var updates = {
      type: draft.type || null,
      status: draft.status || null,
      due: draft.due || null,
      reviewed: draft.reviewed || null,
      review: draft.review || null,
      clarity: serializeClarityFlags(chipFlags),
    };
    sendToPlugin('updateNoteFrontmatter', JSON.stringify({ filename: nc.filename, updates: updates }));
    close();
  }

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) close();
    var chip = e.target.closest('.cl-meta-chip');
    if (chip && overlay.contains(chip)) {
      chip.classList.toggle('cl-meta-chip-active');
      return;
    }
    var target = e.target.closest('[data-action]');
    if (!target) return;
    var action = target.dataset.action;
    if (action === 'metaClearDue') {
      draft.due = '';
      var dueRow = overlay.querySelector('[data-field="due-row"]');
      if (dueRow) {
        dueRow.innerHTML =
          '<span class="cl-meta-readonly" data-field="due-display">—</span>' +
          '<button class="cl-meta-link" type="button" data-action="metaSetDue">Set deadline</button>';
      }
    } else if (action === 'metaSetDue') {
      var dueRow2 = overlay.querySelector('[data-field="due-row"]');
      if (dueRow2) {
        dueRow2.innerHTML =
          '<input class="cl-meta-input" type="date" data-field="due" value="' + esc(State.today) + '">' +
          '<button class="cl-meta-link" type="button" data-action="metaClearDue">Clear</button>';
        draft.due = State.today;
        var newIn = dueRow2.querySelector('[data-field="due"]');
        if (newIn) newIn.focus();
      }
    } else if (action === 'metaMarkReviewed') {
      draft.reviewed = State.today;
      var disp = overlay.querySelector('[data-field="reviewed-display"]');
      if (disp) disp.textContent = State.today;
    }
  });

  overlay.querySelector('.cl-meta-cancel').addEventListener('click', close);
  overlay.querySelector('.cl-meta-save').addEventListener('click', save);
  overlay.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault(); e.stopPropagation(); save();
    }
  });

  setTimeout(function() {
    var first = overlay.querySelector('[data-field="type"]');
    if (first) first.focus();
  }, 0);
}
