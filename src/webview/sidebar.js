/* global sendMessageToPlugin */
// Sidebar: built-in views (Inbox/Today/...) followed by project/area notes
// grouped by folder. The footer popover holds visibility toggles and the
// "Keyboard shortcuts" entry. handleNavClick is the click target for every
// nav row, including project-note rows.

import { State, pushRecentNote } from './state.js';
import { esc } from './helpers.js';
import {
  getViewIcon,
  renderProjectIcon,
  buildDeadlineBadgeCompact,
} from './icons.js';
import { getViewCount } from './task-categorization.js';
import { openShortcutsCheatsheet } from './modals.js';
import {
  saveCurrentViewPrefs,
  restoreViewPrefs,
  persistViewPrefs,
} from './view-prefs.js';
import { renderCurrentView } from './index.js';

var SIDEBAR_VIEWS = [
  { id: 'inbox', label: 'Inbox' },
  { id: 'today', label: 'Today' },
  { id: 'upcoming', label: 'Upcoming' },
  { id: 'anytime', label: 'Anytime' },
  { id: 'someday', label: 'Someday' },
];

export function renderSidebar() {
  var el = document.getElementById('cl-sidebar');
  if (!el) return;

  var html = '<div class="cl-sidebar-inner">';
  for (var vi = 0; vi < SIDEBAR_VIEWS.length; vi++) {
    var v = SIDEBAR_VIEWS[vi];
    if (State.visibleViews[v.id] === false) continue;
    var count = getViewCount(v.id);
    var active = State.currentView === v.id ? ' cl-nav-active' : '';
    html += '<div class="cl-nav-item' + active + '" data-view="' + v.id + '">';
    html += '<span class="cl-nav-icon">' + getViewIcon(v.id, 18) + '</span>';
    html += '<span class="cl-nav-label">' + v.label + '</span>';
    if (count > 0 && (v.id === 'inbox' || v.id === 'today')) {
      html += '<span class="cl-nav-count">' + count + '</span>';
    }
    html += '</div>';
  }

  html += '<div class="cl-nav-divider"></div>';

  // Areas & Projects (collapsible by folder path)
  for (var fi = 0; fi < State.folders.length; fi++) {
    var folder = State.folders[fi];
    var areaKey = folder.path;
    var collapsed = State.collapsedAreas && State.collapsedAreas[areaKey];
    var notes = folder.notes || [];
    var visibleNotes = notes;
    // status: 'someday' notes are always hidden from the sidebar (they live in the Someday view).
    visibleNotes = visibleNotes.filter(function(n) { return n.status !== 'someday'; });
    if (State.hidePaused) {
      visibleNotes = visibleNotes.filter(function(n) { return n.status !== 'paused'; });
    }
    if (State.hideEmptyProjects) {
      visibleNotes = visibleNotes.filter(function(n) { return (n.openCount || 0) > 0; });
    }
    if (State.hideNonProjects) {
      visibleNotes = visibleNotes.filter(function(n) { return n.hasProjectOrAreaType; });
    }
    if (visibleNotes.length === 0) continue;
    html += '<div class="cl-area-header" data-area="' + esc(areaKey) + '">';
    html += '<span class="cl-area-chevron' + (collapsed ? ' cl-collapsed' : '') + '">▸</span>';
    html += esc(folder.name);
    html += '</div>';
    html += '<div class="cl-area-group' + (collapsed ? ' cl-hidden' : '') + '" data-area-group="' + esc(areaKey) + '">';
    for (var ni = 0; ni < visibleNotes.length; ni++) {
      var n = visibleNotes[ni];
      var noteActive = (State.currentView === 'note' && State.currentNoteFilename === n.filename) ? ' cl-nav-active' : '';
      var mutedCls = (n.status === 'paused' || n.status === 'someday') ? ' cl-project-muted' : '';
      html += '<div class="cl-nav-item cl-project-item' + mutedCls + noteActive + '" data-view="note" data-filename="' + esc(n.filename) + '">';
      html += renderProjectIcon(n, 18);
      html += '<span class="cl-project-title">' + esc(n.title) + '</span>';
      if (n.due) html += buildDeadlineBadgeCompact(n.due);
      html += '</div>';
    }
    html += '</div>'; // close area group
  }

  html += '</div>'; // close cl-sidebar-inner
  html += renderSidebarFooter();

  el.innerHTML = html;

  var navItems = el.querySelectorAll('.cl-nav-item');
  for (var ci = 0; ci < navItems.length; ci++) {
    navItems[ci].addEventListener('click', handleNavClick);
  }

  var areaHeaders = el.querySelectorAll('.cl-area-header');
  for (var ai = 0; ai < areaHeaders.length; ai++) {
    areaHeaders[ai].addEventListener('click', function(e) {
      var areaKey = e.currentTarget.dataset.area;
      if (!areaKey) return;
      State.collapsedAreas[areaKey] = !State.collapsedAreas[areaKey];
      var chevron = e.currentTarget.querySelector('.cl-area-chevron');
      var group = el.querySelector('[data-area-group="' + areaKey + '"]');
      if (chevron) chevron.classList.toggle('cl-collapsed');
      if (group) group.classList.toggle('cl-hidden');
      sendMessageToPlugin('saveCollapsedAreas', JSON.stringify({ collapsedAreas: JSON.stringify(State.collapsedAreas) }));
    });
  }

  attachSidebarFooterHandlers();
}

function renderSidebarFooter() {
  var open = State.settingsPopoverOpen;
  var html = '<div class="cl-sidebar-footer">';

  // Popover (positioned above the button)
  html += '<div class="cl-settings-popover' + (open ? ' cl-popover-open' : '') + '">';

  // Projects section
  html += '<div class="cl-settings-section">';
  html += '<div class="cl-settings-section-title">Projects &amp; Areas</div>';
  html += '<label class="cl-settings-toggle"><input type="checkbox" data-action="toggleHideEmpty"' + (State.hideEmptyProjects ? ' checked' : '') + '><span>Hide notes without open tasks</span></label>';
  html += '<label class="cl-settings-toggle"><input type="checkbox" data-action="toggleHideNonProjects"' + (State.hideNonProjects ? ' checked' : '') + '><span>Hide non-projects and non-areas</span></label>';
  html += '<label class="cl-settings-toggle"><input type="checkbox" data-action="toggleHidePaused"' + (State.hidePaused ? ' checked' : '') + '><span>Hide paused</span></label>';
  html += '<button class="cl-settings-action" data-action="collapseAllAreas">Collapse all</button>';
  html += '<button class="cl-settings-action" data-action="expandAllAreas">Expand all</button>';
  html += '</div>';

  // Views section
  html += '<div class="cl-settings-section">';
  html += '<div class="cl-settings-section-title">Views</div>';
  for (var vi = 0; vi < SIDEBAR_VIEWS.length; vi++) {
    var v = SIDEBAR_VIEWS[vi];
    var checked = State.visibleViews[v.id] !== false;
    html += '<label class="cl-settings-toggle"><input type="checkbox" data-action="toggleViewVisibility" data-view="' + v.id + '"' + (checked ? ' checked' : '') + '><span class="cl-settings-toggle-icon">' + getViewIcon(v.id, 16) + '</span><span>' + v.label + '</span></label>';
  }
  html += '</div>';

  // Help section
  html += '<div class="cl-settings-section">';
  html += '<button class="cl-settings-action cl-settings-help" data-action="openShortcutsCheatsheet">' +
    '<span>Keyboard shortcuts</span>' +
    '<kbd class="cl-cheatsheet-kbd">?</kbd>' +
    '</button>';
  html += '</div>';

  html += '</div>'; // close popover

  // Strip button
  html += '<button class="cl-settings-btn' + (open ? ' cl-active' : '') + '" data-action="toggleSettingsPopover" title="View settings">';
  html += '<i class="fa-solid fa-sliders"></i>';
  html += '<span>View settings</span>';
  html += '</button>';

  html += '</div>';
  return html;
}

var _settingsOutsideListener = null;

function attachSidebarFooterHandlers() {
  var footer = document.querySelector('.cl-sidebar-footer');
  if (!footer) return;

  // Clean up any previous outside-click listener before attaching a new one
  if (_settingsOutsideListener) {
    document.removeEventListener('click', _settingsOutsideListener);
    _settingsOutsideListener = null;
  }

  footer.addEventListener('click', function(e) {
    var target = e.target.closest('[data-action]');
    if (!target) return;
    var action = target.dataset.action;
    switch (action) {
      case 'toggleSettingsPopover':
        State.settingsPopoverOpen = !State.settingsPopoverOpen;
        document.body.classList.toggle('cl-settings-backdrop', State.settingsPopoverOpen);
        renderSidebar();
        break;
      case 'toggleHideEmpty':
        State.hideEmptyProjects = !!target.checked;
        sendMessageToPlugin('saveHideEmptyProjects', JSON.stringify({ hideEmptyProjects: State.hideEmptyProjects }));
        renderSidebar();
        break;
      case 'toggleHidePaused':
        State.hidePaused = !!target.checked;
        sendMessageToPlugin('saveHidePaused', JSON.stringify({ hidePaused: State.hidePaused }));
        renderSidebar();
        break;
      case 'toggleHideNonProjects':
        State.hideNonProjects = !!target.checked;
        sendMessageToPlugin('saveHideNonProjects', JSON.stringify({ hideNonProjects: State.hideNonProjects }));
        renderSidebar();
        break;
      case 'collapseAllAreas':
        for (var fi = 0; fi < State.folders.length; fi++) {
          State.collapsedAreas[State.folders[fi].path] = true;
        }
        sendMessageToPlugin('saveCollapsedAreas', JSON.stringify({ collapsedAreas: JSON.stringify(State.collapsedAreas) }));
        renderSidebar();
        break;
      case 'expandAllAreas':
        State.collapsedAreas = {};
        sendMessageToPlugin('saveCollapsedAreas', JSON.stringify({ collapsedAreas: JSON.stringify(State.collapsedAreas) }));
        renderSidebar();
        break;
      case 'toggleViewVisibility': {
        var vid = target.dataset.view;
        if (!vid) break;
        State.visibleViews[vid] = !!target.checked;
        sendMessageToPlugin('saveVisibleViews', JSON.stringify({ visibleViews: JSON.stringify(State.visibleViews) }));
        renderSidebar();
        break;
      }
      case 'openShortcutsCheatsheet':
        State.settingsPopoverOpen = false;
        document.body.classList.remove('cl-settings-backdrop');
        renderSidebar();
        openShortcutsCheatsheet();
        break;
    }
  });

  // Close popover when clicking outside the footer
  if (State.settingsPopoverOpen) {
    _settingsOutsideListener = function(e) {
      var f = document.querySelector('.cl-sidebar-footer');
      if (f && !f.contains(e.target)) {
        State.settingsPopoverOpen = false;
        document.body.classList.remove('cl-settings-backdrop');
        document.removeEventListener('click', _settingsOutsideListener);
        _settingsOutsideListener = null;
        renderSidebar();
      }
    };
    setTimeout(function() {
      if (_settingsOutsideListener) document.addEventListener('click', _settingsOutsideListener);
    }, 0);
  }
}

function handleNavClick(e) {
  var item = e.currentTarget;
  var view = item.dataset.view;
  if (!view) return;
  // Close mobile sidebar
  var sidebar = document.getElementById('cl-sidebar');
  var overlay = document.getElementById('cl-sidebar-overlay');
  if (sidebar) sidebar.classList.remove('cl-sidebar-open');
  if (overlay) overlay.classList.remove('cl-sidebar-open');

  // Save prefs for the view we're leaving
  saveCurrentViewPrefs();

  State.currentView = view;
  State.focusedTaskIndex = -1;
  State.filters = { tag: null, mention: null, text: '', noteStatus: 'all' };
  State.tasksOnly = false;
  State.expandedTaskId = null;
  State.editDraft = null;

  if (view === 'note') {
    State.currentNoteFilename = item.dataset.filename || null;
    sendMessageToPlugin('requestNoteContent', JSON.stringify({ filename: State.currentNoteFilename }));
    pushRecentNote(State.currentNoteFilename);
  }

  // Restore saved prefs for the view we're entering
  restoreViewPrefs(view, State.currentNoteFilename);
  persistViewPrefs();

  sendMessageToPlugin('saveView', JSON.stringify({ view: view, noteFilename: State.currentNoteFilename }));
  var allNav = document.querySelectorAll('.cl-nav-item');
  for (var i = 0; i < allNav.length; i++) allNav[i].classList.remove('cl-nav-active');
  item.classList.add('cl-nav-active');
  renderCurrentView();
}
