/* global sendMessageToPlugin */
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
  filters: { tag: null, folder: null, mention: null, text: '', noteStatus: 'all' },
  grouping: 'note',
  movedFromInbox: [],
  editDraft: null,
  focusedTaskIndex: -1,
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
};

export var MAX_RECENT_NOTES = 12;

export function pushRecentNote(filename) {
  if (!filename) return;
  var arr = (State.recentNotes || []).filter(function(f) { return f !== filename; });
  arr.unshift(filename);
  if (arr.length > MAX_RECENT_NOTES) arr = arr.slice(0, MAX_RECENT_NOTES);
  State.recentNotes = arr;
  sendMessageToPlugin('saveRecentNotes', JSON.stringify({ recentNotes: JSON.stringify(arr) }));
}
