/* global sendMessageToPlugin */
// Per-view UI preferences that survive across sessions. The prefs object is
// keyed by view name (or `note:<filename>` for project/area notes) so each
// view can remember its own tag/folder/grouping (or noteStatus/tasksOnly for
// note view).

import { State } from './state.js';

export function viewPrefsKey(view, filename) {
  return view === 'note' ? 'note:' + (filename || '') : view;
}

export function saveCurrentViewPrefs() {
  var key = viewPrefsKey(State.currentView, State.currentNoteFilename);
  if (State.currentView === 'note') {
    State.viewPrefs[key] = { noteStatus: State.filters.noteStatus, tasksOnly: State.tasksOnly };
  } else {
    State.viewPrefs[key] = { tag: State.filters.tag, folder: State.filters.folder, grouping: State.grouping };
  }
}

export function restoreViewPrefs(view, filename) {
  var key = viewPrefsKey(view, filename);
  var saved = State.viewPrefs[key];
  if (view === 'note') {
    State.filters.noteStatus = (saved && saved.noteStatus) || 'all';
    State.tasksOnly = (saved && saved.tasksOnly) || false;
  } else {
    State.filters.tag = (saved && saved.tag) || null;
    State.filters.folder = (saved && saved.folder) || null;
    State.grouping = (saved && saved.grouping) || defaultGrouping(view);
  }
}

export function defaultGrouping(view) {
  if (view === 'inbox') return 'date';
  if (view === 'anytime') return 'folder';
  return 'note';
}

export function persistViewPrefs() {
  sendMessageToPlugin('saveViewPrefs', JSON.stringify({ viewPrefs: JSON.stringify(State.viewPrefs) }));
}
