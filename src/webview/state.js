/* global sendMessageToPlugin */
import { sendToPlugin } from './lib/bridge.js';
// Shared mutable state for the Clarity webview. Other modules import `State`
// as a live binding and mutate its properties directly — the object itself is
// never reassigned. `navigateToProjectNote` stays in index.js for now because
// it transitively depends on render and view-prefs helpers that haven't been
// extracted yet.

export var State = {
  tasks: [],
  folders: [],
  notes: [],
  currentView: 'inbox',
  currentNoteFilename: null,
  expandedTaskId: null,
  filters: { tag: null, folder: null, mention: null, text: '', noteStatus: 'all', todayRepeat: 'all', hideFuture: false },
  grouping: 'note',
  movedFromInbox: [],
  editDraft: null,
  focusedTaskIndex: -1,
  pendingFocusTaskId: null,
  today: '',
  currentWeek: '',
  tasksOnly: false,
  noteContent: null,
  collapsedAreas: {},
  viewPrefs: {},
  hideEmptyProjects: false,
  hideNonProjects: false,
  hidePaused: false,
  visibleViews: { inbox: true, today: true, upcoming: true, anytime: true, someday: true },
  settingsPopoverOpen: false,
  recentNotes: [],
  // How far back the plugin scans daily notes for Inbox, and how far ahead
  // for Upcoming. Live-adjustable from each view's header dropdown — changing
  // either re-fetches tasks from the plugin.
  inboxLookbackDays: 14,
  upcomingLookaheadDays: 30,
};

export var MAX_RECENT_NOTES = 12;

export function pushRecentNote(filename) {
  if (!filename) return;
  var arr = (State.recentNotes || []).filter(function(f) { return f !== filename; });
  arr.unshift(filename);
  if (arr.length > MAX_RECENT_NOTES) arr = arr.slice(0, MAX_RECENT_NOTES);
  State.recentNotes = arr;
  sendToPlugin('saveRecentNotes', JSON.stringify({ recentNotes: JSON.stringify(arr) }));
}

// ─── (merged from view-prefs.js) ─────────────────────────

export function viewPrefsKey(view, filename) {
  return view === 'note' ? 'note:' + (filename || '') : view;
}

export function saveCurrentViewPrefs() {
  var key = viewPrefsKey(State.currentView, State.currentNoteFilename);
  if (State.currentView === 'note') {
    State.viewPrefs[key] = { noteStatus: State.filters.noteStatus, tasksOnly: State.tasksOnly, hideFuture: State.filters.hideFuture };
  } else {
    var prefs = { tag: State.filters.tag, folder: State.filters.folder, grouping: State.grouping };
    if (State.currentView === 'today') prefs.todayRepeat = State.filters.todayRepeat;
    State.viewPrefs[key] = prefs;
  }
}

export function restoreViewPrefs(view, filename) {
  var key = viewPrefsKey(view, filename);
  var saved = State.viewPrefs[key];
  if (view === 'note') {
    State.filters.noteStatus = (saved && saved.noteStatus) || 'all';
    State.tasksOnly = (saved && saved.tasksOnly) || false;
    State.filters.hideFuture = (saved && saved.hideFuture) || false;
  } else {
    State.filters.tag = (saved && saved.tag) || null;
    State.filters.folder = (saved && saved.folder) || null;
    State.grouping = (saved && saved.grouping) || defaultGrouping(view);
    State.filters.todayRepeat = (view === 'today' && saved && saved.todayRepeat) || 'all';
  }
}

export function defaultGrouping(view) {
  if (view === 'inbox') return 'date';
  if (view === 'anytime') return 'folder';
  return 'note';
}

export function persistViewPrefs() {
  sendToPlugin('saveViewPrefs', JSON.stringify({ viewPrefs: JSON.stringify(State.viewPrefs) }));
}
