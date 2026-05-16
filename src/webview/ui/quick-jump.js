// Cmd+/ "jump to a project or area" palette. Empty query shows recents first
// then the rest of the sidebar order; a non-empty query ranks by substring
// position + initials match (so "ehs" → "Eat Healthy Stuff").

import { State, pushRecentNote } from '../state.js';
import { esc } from '../lib/helpers.js';
import { renderProjectIcon } from '../lib/icons.js';
import { navigateToProjectNote } from '../index.js';

// Score a note title against a query. Higher is better; 0 means no match.
// Combines case-insensitive substring match and first-letter-of-each-word match.
export function quickJumpScore(note, query) {
  if (!query) return 1;
  var q = query.toLowerCase();
  var title = (note.title || '').toLowerCase();
  if (!title) return 0;

  var score = 0;
  // Exact prefix is best.
  if (title.indexOf(q) === 0) score += 100;
  else if (title.indexOf(q) >= 0) score += 50 - title.indexOf(q);

  // First-letters-of-words match: e.g. "ehs" matches "Eat Healthy Stuff".
  var words = title.split(/[\s\-_/]+/).filter(function(w) { return w.length > 0; });
  var initials = '';
  for (var w = 0; w < words.length; w++) initials += words[w].charAt(0);
  if (initials.indexOf(q) === 0) score += 80;
  else if (initials.indexOf(q) >= 0) score += 30;

  return score;
}

export function quickJumpResults(query) {
  var notes = State.notes || [];
  if (!query) {
    // Empty query: recents first (MRU), then remaining notes in sidebar order.
    var byFilename = {};
    for (var ni = 0; ni < notes.length; ni++) byFilename[notes[ni].filename] = notes[ni];
    var ordered = [];
    var seen = {};
    var recents = State.recentNotes || [];
    for (var ri = 0; ri < recents.length; ri++) {
      var rn = byFilename[recents[ri]];
      if (rn && !seen[rn.filename]) { ordered.push(rn); seen[rn.filename] = true; }
    }
    for (var si = 0; si < notes.length; si++) {
      if (!seen[notes[si].filename]) { ordered.push(notes[si]); seen[notes[si].filename] = true; }
    }
    return ordered.slice(0, 12);
  }
  var scored = [];
  for (var i = 0; i < notes.length; i++) {
    var s = quickJumpScore(notes[i], query);
    if (s > 0) scored.push({ note: notes[i], score: s });
  }
  scored.sort(function(a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return (a.note.title || '').localeCompare(b.note.title || '');
  });
  return scored.slice(0, 12).map(function(x) { return x.note; });
}

export function renderQuickJumpResults(container, results, selectedIndex) {
  var html = '';
  if (results.length === 0) {
    html = '<div class="cl-jump-empty">No matching projects or areas</div>';
  } else {
    for (var i = 0; i < results.length; i++) {
      var n = results[i];
      var folderPath = (n.filename || '').replace(/\/[^/]+$/, '');
      var icon = renderProjectIcon(n, 16);
      var sel = i === selectedIndex ? ' cl-jump-result-active' : '';
      html += '<div class="cl-jump-result' + sel + '" data-filename="' + esc(n.filename) + '" data-index="' + i + '">' +
        '<span class="cl-jump-icon">' + icon + '</span>' +
        '<span class="cl-jump-title">' + esc(n.title || '') + '</span>' +
        '<span class="cl-jump-folder">' + esc(folderPath) + '</span>' +
        '</div>';
    }
  }
  container.innerHTML = html;
}

export function openQuickJump() {
  var existing = document.querySelector('.cl-jump-overlay');
  if (existing) { existing.remove(); return; }

  var overlay = document.createElement('div');
  overlay.className = 'cl-jump-overlay';
  overlay.innerHTML =
    '<div class="cl-jump-modal">' +
      '<input class="cl-jump-input" type="text" placeholder="Jump to project or area…" autocomplete="off" spellcheck="false">' +
      '<div class="cl-jump-results"></div>' +
    '</div>';
  document.body.appendChild(overlay);

  var input = overlay.querySelector('.cl-jump-input');
  var resultsEl = overlay.querySelector('.cl-jump-results');
  var state = { results: quickJumpResults(''), selected: 0 };
  renderQuickJumpResults(resultsEl, state.results, state.selected);

  function close() { overlay.remove(); }
  function jumpTo(filename) {
    if (!filename) return;
    close();
    navigateToProjectNote(filename);
  }

  input.addEventListener('input', function() {
    state.results = quickJumpResults(input.value);
    state.selected = 0;
    renderQuickJumpResults(resultsEl, state.results, state.selected);
  });

  input.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') { e.preventDefault(); close(); return; }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (state.results.length === 0) return;
      state.selected = Math.min(state.selected + 1, state.results.length - 1);
      renderQuickJumpResults(resultsEl, state.results, state.selected);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (state.results.length === 0) return;
      state.selected = Math.max(state.selected - 1, 0);
      renderQuickJumpResults(resultsEl, state.results, state.selected);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      var pick = state.results[state.selected];
      if (pick) jumpTo(pick.filename);
      return;
    }
  });

  resultsEl.addEventListener('click', function(e) {
    var row = e.target.closest('.cl-jump-result');
    if (!row) return;
    jumpTo(row.dataset.filename);
  });

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) close();
  });

  setTimeout(function() { input.focus(); }, 0);
}

// Suppress unused-import warnings for callers — pushRecentNote isn't used in
// this module but listing it keeps the dependency graph explicit when callers
// later refactor jumpTo to participate in MRU bookkeeping.
void pushRecentNote;
