/* global sendMessageToPlugin */
// Message handler invoked by NotePlan's pluginToHTMLCommsBridge.js when the
// plugin side wants to push data into the webview. The bridge looks up
// `onMessageFromPlugin` on the window, so the entry point is republished onto
// globalThis from index.js after this module's import resolves.

import { State } from './state.js';
import { reviewDueDaysFromFm } from './review.js';
import {
  navigateToProjectNote,
  renderSidebar,
  renderCurrentView,
} from './index.js';
import { restoreViewPrefs } from './view-prefs.js';
import { applySidebarWidth } from './sidebar-resize.js';

export function onMessageFromPlugin(type, data) {
  switch (type) {
    case 'INIT_DATA':
      State.tasks = data.tasks || [];
      State.folders = data.folders || [];
      State.notes = data.notes || [];
      State.today = data.today || '';
      State.currentWeek = data.currentWeek || '';
      if (data.lastView) State.currentView = data.lastView;
      if (data.lastNoteFilename && data.lastView === 'note') State.currentNoteFilename = data.lastNoteFilename;
      if (data.collapsedAreas) {
        try { State.collapsedAreas = JSON.parse(data.collapsedAreas); } catch (e) { State.collapsedAreas = {}; }
      }
      if (data.viewPrefs) {
        try { State.viewPrefs = JSON.parse(data.viewPrefs); } catch (e) { State.viewPrefs = {}; }
      }
      State.hideEmptyProjects = !!data.hideEmptyProjects;
      State.hideNonProjects = !!data.hideNonProjects;
      State.hidePaused = !!data.hidePaused;
      if (data.recentNotes) {
        try {
          var parsedRecents = JSON.parse(data.recentNotes);
          if (Array.isArray(parsedRecents)) State.recentNotes = parsedRecents;
        } catch (e) { State.recentNotes = []; }
      }
      if (data.visibleViews) {
        try {
          var parsedViews = JSON.parse(data.visibleViews);
          // Merge into defaults so new views added later default to visible
          if (parsedViews && typeof parsedViews === 'object') {
            for (var vk in parsedViews) {
              if (Object.prototype.hasOwnProperty.call(parsedViews, vk)) {
                State.visibleViews[vk] = !!parsedViews[vk];
              }
            }
          }
        } catch (e) { /* keep defaults */ }
      }
      applySidebarWidth(data.sidebarWidth);
      restoreViewPrefs(State.currentView, State.currentNoteFilename);
      renderSidebar();
      // If in note view, re-request note content
      if (State.currentView === 'note' && State.currentNoteFilename) {
        sendMessageToPlugin('requestNoteContent', JSON.stringify({ filename: State.currentNoteFilename }));
      }
      renderCurrentView();
      break;
    case 'NOTE_CONTENT':
      State.noteContent = data;
      if (State.currentView === 'note') renderCurrentView();
      break;
    case 'SHOW_NOTE':
      // Triggered by the "Show in Clarity" plugin command. Navigate to the
      // requested note, opening the note view (and pulling its content) even
      // if the note is filtered out of the sidebar.
      if (data && data.filename) {
        navigateToProjectNote(data.filename);
      }
      break;
    case 'PROJECT_REFRESHED':
      handleProjectRefreshed(data);
      break;
    case 'TASK_CREATED':
    case 'TASK_SAVED':
    case 'TASK_TOGGLED':
    case 'TASK_REORDERED':
    case 'TASK_RESCHEDULED':
    case 'TASK_DELETED':
    case 'TASK_TAG_UPDATED':
      sendMessageToPlugin('ready', '{}');
      break;
    case 'PROJECT_ARCHIVED':
      if (data && data.success) {
        if (State.currentNoteFilename === data.oldFilename) {
          State.currentView = 'inbox';
          State.currentNoteFilename = null;
          State.noteContent = null;
          sendMessageToPlugin('saveView', JSON.stringify({ view: 'inbox', noteFilename: null }));
        }
        sendMessageToPlugin('ready', '{}');
      } else {
        console.log('Clarity: archive failed: ' + (data && data.error));
      }
      break;
    case 'NOTE_FRONTMATTER_UPDATED':
      if (State.noteContent && State.noteContent.filename === data.filename) {
        State.noteContent.frontmatter = data.frontmatter || {};
        State.noteContent.bgColorDark = data.bgColorDark || State.noteContent.bgColorDark;
      }
      // Mirror the relevant fields into the sidebar's noteMeta cache so that
      // icon recoloring (e.g. amber → blue after Mark-as-Reviewed) and status
      // changes appear immediately without a full reload.
      (function() {
        var fnFm = data.filename;
        var newFm = data.frontmatter || {};
        var newRdd = reviewDueDaysFromFm(newFm);
        var newStatus = (newFm.status === 'paused' || newFm.status === 'someday' || newFm.status === 'completed' || newFm.status === 'canceled') ? newFm.status : null;
        var newType = newFm.type === 'area' ? 'area' : (newFm.type === 'project' ? 'project' : '');
        var newDue = newFm.due || null;
        function apply(target) {
          target.reviewedDate = newFm.reviewed || null;
          target.reviewInterval = newFm.review || null;
          target.reviewDueDays = newRdd;
          target.status = newStatus;
          target.noteType = newType;
          target.due = newDue;
          target.bgColorDark = data.bgColorDark || target.bgColorDark;
        }
        for (var fi = 0; fi < State.folders.length; fi++) {
          var fns = State.folders[fi].notes || [];
          for (var ni = 0; ni < fns.length; ni++) {
            if (fns[ni].filename === fnFm) apply(fns[ni]);
          }
        }
        for (var li = 0; li < State.notes.length; li++) {
          if (State.notes[li].filename === fnFm) apply(State.notes[li]);
        }
      })();
      renderSidebar();
      renderCurrentView();
      sendMessageToPlugin('ready', '{}');
      break;
    default:
      console.log('Clarity WebView: unknown message type: ' + type);
  }
}

function handleProjectRefreshed(data) {
  if (!data || !data.filename) return;
  var fn = data.filename;
  // Replace tasks for this note
  var kept = [];
  for (var i = 0; i < State.tasks.length; i++) {
    if (State.tasks[i].noteFilename !== fn) kept.push(State.tasks[i]);
  }
  if (data.tasks && data.tasks.length) {
    for (var ti = 0; ti < data.tasks.length; ti++) kept.push(data.tasks[ti]);
  }
  State.tasks = kept;

  // Update note metadata in folder tree + flat note list
  if (data.noteMeta) {
    var nm = data.noteMeta;
    for (var fi = 0; fi < State.folders.length; fi++) {
      var notes = State.folders[fi].notes || [];
      for (var ni = 0; ni < notes.length; ni++) {
        if (notes[ni].filename === fn) {
          notes[ni].title = nm.title;
          notes[ni].taskCount = nm.taskCount;
          notes[ni].doneCount = nm.doneCount;
          notes[ni].openCount = nm.openCount;
          notes[ni].bgColorDark = nm.bgColorDark;
          notes[ni].hasProjectOrAreaType = nm.hasProjectOrAreaType;
          notes[ni].noteType = nm.noteType;
          notes[ni].due = nm.due || null;
          notes[ni].status = nm.status || null;
          notes[ni].reviewedDate = nm.reviewedDate || null;
          notes[ni].reviewInterval = nm.reviewInterval || null;
          notes[ni].reviewDueDays = (nm.reviewDueDays == null) ? null : nm.reviewDueDays;
        }
      }
    }
    for (var li = 0; li < State.notes.length; li++) {
      if (State.notes[li].filename === fn) {
        State.notes[li].title = nm.title;
        State.notes[li].taskCount = nm.taskCount;
        State.notes[li].doneCount = nm.doneCount;
        State.notes[li].openCount = nm.openCount;
        State.notes[li].bgColorDark = nm.bgColorDark;
        State.notes[li].noteType = nm.noteType;
        State.notes[li].due = nm.due || null;
        State.notes[li].status = nm.status || null;
        State.notes[li].reviewedDate = nm.reviewedDate || null;
        State.notes[li].reviewInterval = nm.reviewInterval || null;
        State.notes[li].reviewDueDays = (nm.reviewDueDays == null) ? null : nm.reviewDueDays;
      }
    }
  }
  renderSidebar();
  renderCurrentView();
}
