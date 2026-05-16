/* global sendMessageToPlugin */
// Project / area metadata editor. Opens over the current note view with a
// type/status/deadline/last-review/review-schedule form, and on save sends
// `updateNoteFrontmatter` back to the plugin which rewrites the frontmatter
// on disk and pushes a NOTE_FRONTMATTER_UPDATED message back to the webview.

import { State } from './state.js';
import { esc } from './helpers.js';

export function openNoteMetaModal() {
  var nc = State.noteContent;
  if (!nc) return;
  var existing = document.querySelector('.cl-meta-overlay');
  if (existing) { existing.remove(); return; }

  var fm = nc.frontmatter || {};
  var typeVal = fm.type === 'project' || fm.type === 'area' ? fm.type : '';
  var statusVal = (fm.status === 'paused' || fm.status === 'someday' || fm.status === 'completed' || fm.status === 'canceled') ? fm.status : '';
  var dueVal = fm.due || '';
  var reviewedVal = fm.reviewed || '';
  var reviewVal = fm.review || '';

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
    var updates = {
      type: draft.type || null,
      status: draft.status || null,
      due: draft.due || null,
      reviewed: draft.reviewed || null,
      review: draft.review || null,
    };
    sendMessageToPlugin('updateNoteFrontmatter', JSON.stringify({ filename: nc.filename, updates: updates }));
    close();
  }

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) close();
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
