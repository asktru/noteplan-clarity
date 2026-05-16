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
import { setupSidebarResizer } from './sidebar-resize.js';
import { attachDragListeners, consumeDragClickSuppression } from './dnd.js';
import { openNoteMetaModal } from './note-meta-modal.js';

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














// ─── Sidebar ───────────────────────────────────────────────

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
    html += '<span class="cl-area-chevron' + (collapsed ? ' cl-collapsed' : '') + '">\u25B8</span>';
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

function viewPrefsKey(view, filename) {
  return view === 'note' ? 'note:' + (filename || '') : view;
}

function saveCurrentViewPrefs() {
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

function defaultGrouping(view) {
  if (view === 'inbox') return 'date';
  if (view === 'anytime') return 'folder';
  return 'note';
}

function persistViewPrefs() {
  sendMessageToPlugin('saveViewPrefs', JSON.stringify({ viewPrefs: JSON.stringify(State.viewPrefs) }));
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

// ─── Task Row ──────────────────────────────────────────────
function renderTaskRow(task, options) {
  options = options || {};
  var showSource = options.showSource !== false;
  var showStar = options.showStar || false;
  var isOverdue = options.isOverdue || false;
  var alwaysShowDate = options.alwaysShowDate || false;
  var dimmed = options.dimmed || false;

  var classes = 'cl-task-row';
  if (task.status === 'done') classes += ' cl-done';
  if (task.status === 'cancelled') classes += ' cl-cancelled';
  if (isOverdue) classes += ' cl-overdue';
  if (dimmed) classes += ' cl-dimmed';

  var dragAttrs = '';
  if (options.lineIndex !== undefined) {
    dragAttrs = ' data-line-index="' + options.lineIndex + '" data-indent="' + (options.indentLevel || 0) + '" data-child-count="' + (options.childCount || 0) + '"';
  }
  var html = '<div class="' + classes + '" data-task-id="' + esc(task.id) + '"' + dragAttrs + '>';

  // Checkbox
  var cbClass = task.type === 'checklist' ? 'cl-cb cl-cb-square' : 'cl-cb';
  if (task.status === 'done') cbClass += ' cl-cb-done';
  else if (task.status === 'cancelled') cbClass += ' cl-cb-cancelled';
  if (task.isDelegated) cbClass += ' cl-cb-delegated';
  if (isOverdue && task.status === 'open') cbClass += ' cl-cb-overdue';
  html += '<div class="' + cbClass + '" data-action="toggle"></div>';

  // Content area
  html += '<div class="cl-task-content">';
  html += '<div class="cl-task-title">';
  if (showStar && task.scheduledDate === State.today) {
    html += '<span class="cl-star">⭐</span> ';
  }
  html += '<span class="cl-task-text">' + renderInlineMarkdown(task.content) + '</span>';
  html += '</div>';

  var metaParts = [];
  if (showSource && task.noteTitle && task.sourceType === 'note') {
    metaParts.push(esc(task.noteTitle));
  }
  var repeatBadge = '';
  if (task.repeat) {
    repeatBadge = ' <span class="cl-repeat-badge" title="Repeats: ' + esc(task.repeat) + '">' +
      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></svg>' +
      '<span class="cl-repeat-text">' + esc(task.repeat) + '</span>' +
      '</span>';
  }
  var badgeSep = repeatBadge ? '  ' : '';
  if (isOverdue && task.scheduledDate) {
    metaParts.push('<span class="cl-overdue-date">' + task.scheduledDate + '</span>' + badgeSep + repeatBadge);
  } else if (task.scheduledDate && (alwaysShowDate || task.scheduledDate !== State.today)) {
    metaParts.push(task.scheduledDate + badgeSep + repeatBadge);
  } else if (repeatBadge) {
    metaParts.push(repeatBadge);
  }
  if (task.isDelegated && task.mentions.length > 0) {
    metaParts.push('delegated to <span class="cl-mention-inline">' + esc(task.mentions[0]) + '</span>');
  }
  // Children indicator
  if (task.children && task.children.length > 0) {
    var hasNotes = false;
    var clCount = 0;
    var clDone = 0;
    var subCount = 0;
    for (var ci = 0; ci < task.children.length; ci++) {
      if (task.children[ci].type === 'note') hasNotes = true;
      else if (task.children[ci].type === 'checklist') { clCount++; if (task.children[ci].status === 'done') clDone++; }
      else if (task.children[ci].type === 'task') subCount++;
    }
    var indicators = [];
    if (hasNotes) indicators.push('<span class="cl-child-icon" title="Has notes">\u2261</span>');
    if (clCount > 0) indicators.push('<span class="cl-child-icon cl-child-checklist" title="Checklist">\u2611 ' + clDone + '/' + clCount + '</span>');
    if (subCount > 0) indicators.push('<span class="cl-child-icon" title="Sub-tasks">\u2937 ' + subCount + '</span>');
    if (indicators.length > 0) metaParts = metaParts.concat(indicators);
  }
  if (metaParts.length > 0) {
    html += '<div class="cl-task-meta">' + metaParts.join('  &middot; ') + '</div>';
  }
  html += '</div>';

  // Right side badges
  var badges = '';
  if (task.priority > 0) {
    var priLabels = ['', '!', '!!', '!!!'];
    badges += '<span class="cl-pri cl-pri-' + task.priority + '">' + priLabels[task.priority] + '</span>';
  }
  if (task.tags) {
    for (var ti = 0; ti < task.tags.length; ti++) {
      if (task.tags[ti] !== '#someday') {
        badges += '<span class="cl-tag-pill">' + esc(task.tags[ti]) + '</span>';
      }
    }
  }
  if (badges) html += '<div class="cl-task-badges">' + badges + '</div>';

  html += '</div>';
  return html;
}

// ─── Filter Bar ────────────────────────────────────────────
// `view`, when provided, makes the filter bar derive its tag/folder pills
// from the unfiltered task set for that view, so users can switch between
// active filters without having to clear them first.
function renderFilterBar(tasks, view) {
  var sourceTasks = view ? getTasksForView(view) : tasks;
  var tags = extractUniqueTags(sourceTasks);
  var folders = view ? extractUniqueFolders(sourceTasks) : [];
  if (tags.length === 0 && folders.length < 2) return '';
  var html = '<div class="cl-filter-bar">';
  var activeTag = State.filters.tag;
  var activeFolder = State.filters.folder;
  var noFilter = !activeTag && !activeFolder;
  html += '<span class="cl-filter-pill' + (noFilter ? ' cl-filter-active' : '') + '" data-action="clearTaskFilters">All</span>';
  for (var i = 0; i < tags.length; i++) {
    var active = (activeTag === tags[i]) ? ' cl-filter-active' : '';
    html += '<span class="cl-filter-pill' + active + '" data-action="filterTag" data-tag="' + esc(tags[i]) + '">' + esc(tags[i]) + '</span>';
  }
  if (folders.length >= 2) {
    if (tags.length > 0) html += '<span class="cl-filter-divider"></span>';
    for (var fi = 0; fi < folders.length; fi++) {
      var fActive = (activeFolder === folders[fi]) ? ' cl-filter-active' : '';
      html += '<span class="cl-filter-pill cl-filter-pill-folder' + fActive + '" data-action="filterFolder" data-folder="' + esc(folders[fi]) + '">' + esc(folders[fi]) + '</span>';
    }
  }
  html += '</div>';
  return html;
}

function extractUniqueTags(tasks) {
  var tagMap = {};
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].tags) {
      for (var j = 0; j < tasks[i].tags.length; j++) {
        if (tasks[i].tags[j] !== '#someday' && tasks[i].tags[j] !== '#evening') tagMap[tasks[i].tags[j]] = true;
      }
    }
  }
  return Object.keys(tagMap).sort();
}

function extractUniqueFolders(tasks) {
  var folderMap = {};
  for (var i = 0; i < tasks.length; i++) {
    var f = tasks[i].folderName;
    if (f) folderMap[f] = true;
  }
  return Object.keys(folderMap).sort();
}

// ─── Grouping ──────────────────────────────────────────────
function renderGroupingToggle(view) {
  var options = [];
  if (view === 'today') options = ['note', 'folder', 'priority'];
  else if (view === 'anytime' || view === 'someday') options = ['folder', 'note', 'priority'];
  else return '';
  var html = '<div class="cl-group-toggle">';
  html += '<span class="cl-group-label">Group:</span>';
  for (var i = 0; i < options.length; i++) {
    var active = State.grouping === options[i] ? ' cl-group-btn-active' : '';
    html += '<span class="cl-group-btn' + active + '" data-action="setGrouping" data-grouping="' + options[i] + '">' + capitalize(options[i]) + '</span>';
  }
  html += '</div>';
  return html;
}

function renderGroupedTasks(tasks, grouping, options) {
  options = options || {};
  var groups = {};
  var groupOrder = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    var key;
    switch (grouping) {
      case 'folder': key = t.folderName || 'Other'; break;
      case 'note': key = t.noteTitle || 'Daily Note'; break;
      case 'priority':
        var priNames = ['No Priority', '!', '!!', '!!!'];
        key = priNames[t.priority] || 'No Priority';
        break;
      case 'date': key = t.sourceDate || t.scheduledDate || 'No Date'; break;
      default: key = t.noteTitle || 'Other';
    }
    if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
    groups[key].push(t);
  }
  if (grouping === 'priority') {
    var priRank = { '!!!': 3, '!!': 2, '!': 1, 'No Priority': 0 };
    groupOrder.sort(function(a, b) { return (priRank[b] || 0) - (priRank[a] || 0); });
  }

  var html = '';
  for (var gi = 0; gi < groupOrder.length; gi++) {
    var name = groupOrder[gi];
    var displayName = (grouping === 'date') ? formatDateHeader(name) : name;
    var group = groups[groupOrder[gi]];
    if (grouping === 'note' && group[0] && group[0].noteFilename) {
      html += '<div class="cl-group-header cl-group-clickable" data-action="jumpToProjectNote" data-filename="' + esc(group[0].noteFilename) + '">' + esc(displayName) + '</div>';
    } else {
      html += '<div class="cl-group-header">' + esc(displayName) + '</div>';
    }
    for (var ti = 0; ti < group.length; ti++) {
      var rowOpts = { showSource: grouping !== 'note' };
      if (options.showStar) rowOpts.showStar = true;
      if (options.dimmed) rowOpts.dimmed = true;
      html += renderTaskRow(group[ti], rowOpts);
    }
  }
  return html;
}

// ─── Quick Add ─────────────────────────────────────────────
function renderQuickAdd(view) {
  return '<div class="cl-quick-add" data-view="' + view + '">' +
    '<span class="cl-quick-add-icon">+</span>' +
    '<input class="cl-quick-add-input" placeholder="New Task" data-action="quickAdd"/>' +
    '</div>';
}


// ─── View Router ───────────────────────────────────────────
export function renderCurrentView() {
  var el = document.getElementById('cl-main');
  if (!el) return;
  var html = '';
  switch (State.currentView) {
    case 'inbox': html = renderInboxView(); break;
    case 'today': html = renderTodayView(); break;
    case 'upcoming': html = renderUpcomingView(); break;
    case 'anytime': html = renderAnytimeView(); break;
    case 'someday': html = renderSomedayView(); break;
    case 'note': html = renderNoteView(); break;
    default: html = renderInboxView();
  }
  el.innerHTML = html;
  attachMainEventListeners();
}

// ─── Inbox View ────────────────────────────────────────────
function renderInboxView() {
  var tasks = getFilteredTasks('inbox');
  var html = '<div class="cl-view-header">';
  html += '<div class="cl-view-title"><span class="cl-view-icon">' + getViewIcon('inbox', 24) + '</span><h1>Inbox</h1>';
  html += '<span class="cl-view-count">' + tasks.length + '</span></div></div>';
  html += renderFilterBar(tasks);

  if (State.movedFromInbox.length > 0) {
    html += '<div class="cl-moved-banner">';
    html += '<span>' + State.movedFromInbox.length + ' task' + (State.movedFromInbox.length > 1 ? 's' : '') + ' moved out of the Inbox</span>';
    html += '<span class="cl-moved-ok" data-action="dismissMoved">OK</span>';
    html += '</div>';
  }

  html += renderQuickAdd('inbox');
  html += '<div class="cl-task-list">';

  // Group by source date (newest first)
  var groups = {};
  var groupOrder = [];
  for (var i = 0; i < tasks.length; i++) {
    var key = tasks[i].sourceDate || 'unknown';
    if (!groups[key]) { groups[key] = []; groupOrder.push(key); }
    groups[key].push(tasks[i]);
  }
  groupOrder.sort(function(a, b) { return b.localeCompare(a); });

  for (var gi = 0; gi < groupOrder.length; gi++) {
    var date = groupOrder[gi];
    html += '<div class="cl-group-header">' + formatDateHeader(date) + '</div>';
    var gTasks = groups[date];
    for (var ti = 0; ti < gTasks.length; ti++) {
      html += renderTaskRow(gTasks[ti], { showSource: false });
    }
  }
  html += '</div>';
  return html;
}

// ─── Today View ────────────────────────────────────────────
function renderTodayView() {
  var tasks = getFilteredTasks('today');
  var today = State.today;
  var html = '<div class="cl-view-header">';
  html += '<div class="cl-view-title"><span class="cl-view-icon">' + getViewIcon('today', 24) + '</span><h1>Today</h1>';
  html += '<span class="cl-view-count">' + tasks.length + '</span></div>';
  html += renderGroupingToggle('today');
  html += '</div>';
  html += renderFilterBar(tasks, 'today');
  html += renderQuickAdd('today');
  html += '<div class="cl-task-list">';

  var overdue = [];
  var dayTasks = [];
  var eveningTasks = [];
  for (var i = 0; i < tasks.length; i++) {
    var t = tasks[i];
    var isEvening = t.tags && t.tags.indexOf('#evening') >= 0;
    if (t.scheduledDate && t.scheduledDate < today) overdue.push(t);
    else if (isEvening) eveningTasks.push(t);
    else dayTasks.push(t);
  }

  if (overdue.length > 0) {
    html += '<div class="cl-group-header cl-overdue-header">' +
      '<span>Overdue</span>' +
      '<span class="cl-overdue-reschedule" data-action="rescheduleAllOverdue" title="Move all overdue tasks to today">Reschedule</span>' +
      '</div>';
    for (var oi = 0; oi < overdue.length; oi++) {
      html += renderTaskRow(overdue[oi], { isOverdue: true, showSource: true });
    }
  }

  html += renderGroupedTasks(dayTasks, State.grouping);

  if (eveningTasks.length > 0) {
    html += '<div class="cl-group-header cl-evening-header">' +
      '<svg class="cl-evening-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>' +
      '<span>This Evening</span>' +
      '</div>';
    for (var ei = 0; ei < eveningTasks.length; ei++) {
      html += renderTaskRow(eveningTasks[ei], { showSource: true });
    }
  }

  html += '</div>';
  return html;
}

// ─── Upcoming View ─────────────────────────────────────────
function renderUpcomingView() {
  var tasks = getFilteredTasks('upcoming');
  var html = '<div class="cl-view-header">';
  html += '<div class="cl-view-title"><span class="cl-view-icon">' + getViewIcon('upcoming', 24) + '</span><h1>Upcoming</h1></div></div>';
  html += renderFilterBar(tasks);
  html += renderQuickAdd('upcoming');
  html += '<div class="cl-task-list">';

  var dayTasks = [];
  var weekTasks = [];
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].scheduledWeek && !tasks[i].scheduledDate) weekTasks.push(tasks[i]);
    else dayTasks.push(tasks[i]);
  }

  dayTasks.sort(function(a, b) { return (a.scheduledDate || '').localeCompare(b.scheduledDate || ''); });
  var dayGroups = {};
  var dayOrder = [];
  for (var di = 0; di < dayTasks.length; di++) {
    var dk = dayTasks[di].scheduledDate || 'unknown';
    if (!dayGroups[dk]) { dayGroups[dk] = []; dayOrder.push(dk); }
    dayGroups[dk].push(dayTasks[di]);
  }
  for (var dgi = 0; dgi < dayOrder.length; dgi++) {
    html += '<div class="cl-group-header cl-upcoming-date">' + formatUpcomingDateHeader(dayOrder[dgi]) + '</div>';
    var dg = dayGroups[dayOrder[dgi]];
    for (var dti = 0; dti < dg.length; dti++) {
      html += renderTaskRow(dg[dti], { showSource: true });
    }
  }

  weekTasks.sort(function(a, b) { return (a.scheduledWeek || '').localeCompare(b.scheduledWeek || ''); });
  var weekGroups = {};
  var weekOrder = [];
  for (var wi = 0; wi < weekTasks.length; wi++) {
    var wk = weekTasks[wi].scheduledWeek || 'unknown';
    if (!weekGroups[wk]) { weekGroups[wk] = []; weekOrder.push(wk); }
    weekGroups[wk].push(weekTasks[wi]);
  }
  for (var wgi = 0; wgi < weekOrder.length; wgi++) {
    html += '<div class="cl-group-header">' + formatWeekHeader(weekOrder[wgi]) + '</div>';
    var wg = weekGroups[weekOrder[wgi]];
    for (var wti = 0; wti < wg.length; wti++) {
      html += renderTaskRow(wg[wti], { showSource: true });
    }
  }

  html += '</div>';
  return html;
}

// ─── Anytime View ──────────────────────────────────────────
function renderAnytimeView() {
  var tasks = getFilteredTasks('anytime');
  var html = '<div class="cl-view-header">';
  html += '<div class="cl-view-title"><span class="cl-view-icon">' + getViewIcon('anytime', 24) + '</span><h1>Anytime</h1>';
  html += '<span class="cl-view-count">' + tasks.length + '</span></div>';
  html += renderGroupingToggle('anytime');
  html += '</div>';
  html += renderFilterBar(tasks, 'anytime');
  html += renderQuickAdd('anytime');
  html += '<div class="cl-task-list">';
  html += renderGroupedTasks(tasks, State.grouping, { showStar: true });
  html += '</div>';
  return html;
}

// ─── Someday View ──────────────────────────────────────────
function renderSomedayView() {
  var tasks = getFilteredTasks('someday');
  // Collect paused and someday project/area notes. Paused notes are otherwise
  // hidden whenever the sidebar's "Hide paused" toggle is on; surfacing them
  // here ensures they don't become invisible.
  var pausedNotes = [];
  var somedayNotes = [];
  for (var sni = 0; sni < State.notes.length; sni++) {
    var sn = State.notes[sni];
    if (sn.status === 'someday') somedayNotes.push(sn);
    else if (sn.status === 'paused') pausedNotes.push(sn);
  }
  var totalCount = tasks.length + somedayNotes.length + pausedNotes.length;

  var html = '<div class="cl-view-header">';
  html += '<div class="cl-view-title"><span class="cl-view-icon">' + getViewIcon('someday', 24) + '</span><h1>Someday</h1>';
  html += '<span class="cl-view-count">' + totalCount + '</span></div>';
  html += renderGroupingToggle('someday');
  html += '</div>';
  html += renderFilterBar(tasks, 'someday');
  html += renderQuickAdd('someday');

  function renderProjectGroup(label, list) {
    if (!list.length) return '';
    var out = '<div class="cl-someday-projects-title">' + esc(label) + '</div>';
    for (var spi = 0; spi < list.length; spi++) {
      var sn = list[spi];
      var sfolder = (sn.filename || '').replace(/\/[^/]+$/, '');
      out += '<div class="cl-someday-project" data-action="jumpToProjectNote" data-filename="' + esc(sn.filename) + '">' +
        '<span class="cl-someday-project-icon">' + renderProjectIcon(sn, 18) + '</span>' +
        '<span class="cl-someday-project-title">' + esc(sn.title || '') + '</span>' +
        '<span class="cl-someday-project-folder">' + esc(sfolder) + '</span>' +
      '</div>';
    }
    return out;
  }

  if (pausedNotes.length || somedayNotes.length) {
    html += '<div class="cl-someday-projects">';
    html += renderProjectGroup('Paused', pausedNotes);
    html += renderProjectGroup('Someday', somedayNotes);
    html += '</div>';
  }

  html += '<div class="cl-task-list">';
  html += renderGroupedTasks(tasks, State.grouping, { dimmed: true });
  html += '</div>';
  return html;
}

// ─── Note/Project View ────────────────────────────────────
function renderNoteView() {
  var nc = State.noteContent;
  if (!nc) return '<div class="cl-view-header"><div class="cl-view-title"><h1>Loading...</h1></div></div>';

  var paras = nc.paragraphs || [];
  var fm = nc.frontmatter || {};

  var taskCount = 0;
  var doneCount = 0;
  for (var ci = 0; ci < paras.length; ci++) {
    var pt = paras[ci].type;
    if (pt === 'open' || pt === 'done' || pt === 'cancelled') { taskCount++; if (pt === 'done') doneCount++; }
  }
  var isArea = (fm.type === 'area');

  var html = '<div class="cl-view-header">';
  html += '<div class="cl-view-title">';
  var noteReviewDueDays = reviewDueDaysFromFm(fm);
  html += renderProjectIcon({
    noteType: isArea ? 'area' : 'project',
    bgColorDark: nc.bgColorDark,
    taskCount: taskCount,
    doneCount: doneCount,
    status: fm.status,
    reviewDueDays: noteReviewDueDays,
  }, 24);
  html += '<h1 class="cl-note-title-link" data-action="openInEditor" data-filename="' + esc(nc.filename) + '">' + esc(nc.title) + '</h1>';
  html += '<div class="cl-project-menu-wrap">';
  html += '<button class="cl-refresh-btn cl-meta-btn" data-action="toggleProjectMenu" title="Project actions">' +
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>';
  html += '</div>';
  html += '</div>';

  var folderPath = (nc.filename || '').replace(/\/[^/]+$/, '');
  html += '<div class="cl-note-breadcrumb">' + esc(folderPath) + (isArea ? '' : ' &middot; ' + doneCount + '/' + taskCount + ' done') + '</div>';
  if (fm.due) {
    html += '<div class="cl-note-deadline" data-action="openNoteMetaModal" title="Edit deadline">' + buildDeadlineBadgeVerbose(fm.due) + '</div>';
  }

  html += '<div class="cl-note-filters">';
  html += '<div class="cl-filter-bar" style="padding:0;">';
  var statusFilters = ['all', 'open', 'done'];
  for (var sf = 0; sf < statusFilters.length; sf++) {
    var sfActive = (State.filters.noteStatus || 'all') === statusFilters[sf] ? ' cl-filter-active' : '';
    html += '<span class="cl-filter-pill' + sfActive + '" data-action="filterNoteStatus" data-status="' + statusFilters[sf] + '">' + capitalize(statusFilters[sf]) + '</span>';
  }
  html += '</div>';
  html += '<div class="cl-tasks-only-toggle' + (State.tasksOnly ? ' cl-filter-active' : '') + '" data-action="toggleTasksOnly">' + (State.tasksOnly ? '\u2611' : '\u2610') + ' Tasks only</div>';
  html += '</div>';
  html += '</div>';

  html += renderQuickAdd('note');

  html += '<div class="cl-task-list cl-note-content">';
  var skipUntilIndent = -1; // when > 0, skip children of a task at this indent level
  var sectionStack = []; // stack of { level, collapsed } for open <div class="cl-section-body">
  var firstH1Skipped = false; // the top-level title duplicates the header, so skip it
  for (var pi = 0; pi < paras.length; pi++) {
    var p = paras[pi];
    if (pi === 0 && p.content === '---') {
      for (var fmi = 1; fmi < paras.length; fmi++) { if (paras[fmi].content === '---') { pi = fmi; break; } }
      continue;
    }
    // Skip the first top-level heading since it duplicates the header title
    if (!firstH1Skipped && p.type === 'title' && p.headingLevel === 1) {
      firstH1Skipped = true;
      continue;
    }

    var pIndent = p.indentLevel || 0;
    // Fallback: detect indent from rawContent leading tabs
    if (pIndent === 0 && p.rawContent) {
      var tabMatch = p.rawContent.match(/^\t+/);
      if (tabMatch) pIndent = tabMatch[0].length;
    }
    var isTask = (p.type === 'open' || p.type === 'done' || p.type === 'cancelled');
    var isChecklist = (p.type === 'checklist' || p.type === 'checklistDone' || p.type === 'checklistCancelled');
    var isHeading = p.type === 'title';

    // Skip children of a task (they'll show in expanded editor)
    if (skipUntilIndent >= 0) {
      if (pIndent > skipUntilIndent) continue;
      skipUntilIndent = -1; // back to parent level, stop skipping
    }

    if (State.tasksOnly && !isTask && !isChecklist && !isHeading) continue;

    if (State.filters.noteStatus && State.filters.noteStatus !== 'all' && (isTask || isChecklist)) {
      var taskStatus = (p.type === 'done' || p.type === 'checklistDone') ? 'done' : (p.type === 'open' || p.type === 'checklist') ? 'open' : 'cancelled';
      if (State.filters.noteStatus !== taskStatus) continue;
    }

    // --- Markdown tables: consecutive lines beginning with "|" ---
    if (!isTask && !isChecklist && !isHeading) {
      var rawTrim0 = ((p.rawContent || p.content) || '').trim();
      if (rawTrim0.charAt(0) === '|' && rawTrim0.length > 1) {
        var tableLines = [];
        var endIdx = pi;
        for (var tli = pi; tli < paras.length; tli++) {
          var tRaw = ((paras[tli].rawContent || paras[tli].content) || '').trim();
          if (tRaw.charAt(0) !== '|') break;
          tableLines.push(tRaw);
          endIdx = tli;
        }
        // Require at least 2 rows AND a separator row (e.g. "| --- | --- |") to treat as table
        if (tableLines.length >= 2 && isTableSeparatorLine(tableLines[1])) {
          if (State.tasksOnly) { pi = endIdx; continue; } // hide tables in tasks-only mode
          html += renderMarkdownTable(tableLines);
          pi = endIdx;
          continue;
        }
      }
    }

    if (isHeading) {
      var hLevel = p.headingLevel || 1;
      // Close open section-bodies at same or deeper heading level
      while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].level >= hLevel) {
        html += '</div>';
        sectionStack.pop();
      }
      // NotePlan convention: trailing "…" (U+2026) marks a collapsed heading
      var hRawContent = p.content || '';
      var hCollapsed = /\u2026\s*$/.test(hRawContent);
      var hDisplay = hRawContent.replace(/\s*\u2026\s*$/, '');
      var hClass = State.tasksOnly ? 'cl-section-heading' : 'cl-note-heading cl-note-h' + hLevel;
      var chevronDir = hCollapsed ? 'right' : 'down';
      html += '<div class="' + hClass + '" data-line-index="' + p.lineIndex + '">';
      html += '<span class="cl-heading-text">' + renderInlineMarkdown(hDisplay) + '</span>';
      html += '<span class="cl-heading-toggle' + (hCollapsed ? ' cl-always-visible' : '') + '" data-action="toggleHeadingCollapse" data-line-index="' + p.lineIndex + '" title="Toggle collapse">';
      html += '<svg width="10" height="10" viewBox="0 0 10 10" class="cl-heading-chevron cl-chevron-' + chevronDir + '"><polyline points="2,3 5,7 8,3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
      html += '</span>';
      html += '</div>';
      html += '<div class="cl-section-body"' + (hCollapsed ? ' style="display:none"' : '') + ' data-heading-line="' + p.lineIndex + '">';
      sectionStack.push({ level: hLevel, collapsed: hCollapsed });
    } else if (isTask || isChecklist) {
      var parsed = parseTaskContentClient(p.content);
      var status = (p.type === 'done' || p.type === 'checklistDone') ? 'done' : (p.type === 'cancelled' || p.type === 'checklistCancelled') ? 'cancelled' : 'open';
      var raw = (p.rawContent || '').trimStart();

      // Count children and gather them for the task object
      var children = [];
      for (var chi = pi + 1; chi < paras.length; chi++) {
        if ((paras[chi].indentLevel || 0) <= pIndent) break;
        var cp = paras[chi];
        var cpType = cp.type;
        if (cpType === 'open' || cpType === 'done' || cpType === 'cancelled') {
          var cpParsed = parseTaskContentClient(cp.content || '');
          children.push({ type: 'task', content: cpParsed.cleanContent, rawContent: cp.content, status: cpType === 'done' ? 'done' : cpType === 'cancelled' ? 'cancelled' : 'open', lineIndex: cp.lineIndex, id: nc.filename + ':' + cp.lineIndex, priority: cpParsed.priority, scheduledDate: cpParsed.scheduledDate, scheduledWeek: cpParsed.scheduledWeek, tags: cpParsed.tags, mentions: cpParsed.mentions });
        } else if (cpType === 'checklist' || cpType === 'checklistDone' || cpType === 'checklistCancelled') {
          children.push({ type: 'checklist', content: cp.content || '', status: cpType === 'checklistDone' ? 'done' : cpType === 'checklistCancelled' ? 'cancelled' : 'open', lineIndex: cp.lineIndex });
        } else {
          children.push({ type: 'note', content: cp.content || '', lineIndex: cp.lineIndex });
        }
      }

      // Skip children in subsequent iterations
      if (children.length > 0) skipUntilIndent = pIndent;

      var taskObj = {
        id: nc.filename + ':' + p.lineIndex, content: parsed.cleanContent, rawContent: p.content,
        type: isChecklist ? 'checklist' : 'task', status: status, priority: parsed.priority,
        scheduledDate: parsed.scheduledDate, scheduledWeek: parsed.scheduledWeek,
        tags: parsed.tags, mentions: parsed.mentions, repeat: parsed.repeat, isDelegated: !isChecklist && raw.startsWith('+'),
        noteFilename: nc.filename, noteTitle: nc.title, folderPath: '', folderName: '',
        lineIndex: p.lineIndex, children: children,
      };
      var indent = pIndent * 20;
      if (indent > 0) html += '<div class="cl-indent-wrap" style="padding-left:' + indent + 'px;">';
      var taskOverdue = (status === 'open' && taskObj.scheduledDate && taskObj.scheduledDate < State.today);
      var taskFuture = (status === 'open' && taskObj.scheduledDate && taskObj.scheduledDate > State.today);
      html += renderTaskRow(taskObj, { showSource: false, lineIndex: p.lineIndex, indentLevel: pIndent, childCount: children.length, showStar: true, isOverdue: taskOverdue, alwaysShowDate: true, dimmed: taskFuture });
      if (indent > 0) html += '</div>';
    } else {
      var indent = pIndent * 20;
      var isList = (p.type === 'list' || p.type === 'list-bullet');
      if (!isList && p.rawContent) {
        var rawTrim = p.rawContent.trimStart();
        if (/^[-*]\s+(?!\[)/.test(rawTrim)) isList = true;
      }
      var isNumbered = false;
      var numLabel = '';
      if (!isList && p.rawContent) {
        var numMatch = p.rawContent.trimStart().match(/^(\d+)\.\s+/);
        if (numMatch) { isNumbered = true; numLabel = numMatch[1] + '.'; }
      }

      if (isList) {
        html += '<div class="cl-note-list-item" style="padding-left:' + indent + 'px;"><span class="cl-bullet">\u2022</span><span>' + renderInlineMarkdown(p.content) + '</span></div>';
      } else if (isNumbered) {
        html += '<div class="cl-note-list-item" style="padding-left:' + indent + 'px;"><span class="cl-num-marker">' + numLabel + '</span><span>' + renderInlineMarkdown(p.content) + '</span></div>';
      } else if (p.type === 'quote' || (p.content && p.content.match(/^\s*>\s/))) {
        var quoteText = (p.content || '').replace(/^\s*>\s?/, '');
        html += '<div class="cl-note-quote" style="margin-left:' + indent + 'px;">' + renderInlineMarkdown(quoteText) + '</div>';
      } else {
        html += '<div class="cl-note-para" style="padding-left:' + indent + 'px;">' + renderInlineMarkdown(p.content) + '</div>';
      }
    }
  }
  // Close any remaining open section-bodies
  while (sectionStack.length > 0) { html += '</div>'; sectionStack.pop(); }
  html += '</div>';

  // Review footer (amber card) — shown when this note is overdue for review.
  if (isReviewDue(noteReviewDueDays, fm.status)) {
    var label = reviewDueLabel(noteReviewDueDays, !!fm.reviewed);
    html += '<div class="cl-review-footer">' +
      '<span class="cl-review-due-label">' + esc(label) + '</span>' +
      '<button class="cl-review-mark-btn" type="button" data-action="markReviewedFromFooter">Mark as Reviewed</button>' +
      '</div>';
  }

  return html;
}

function parseTaskContentClient(content) {
  var result = { priority: 0, scheduledDate: null, scheduledWeek: null, tags: [], mentions: [], repeat: null, cleanContent: '' };
  var c = content || '';
  var rm = c.match(/@repeat\(([^)]*)\)/);
  if (rm) result.repeat = rm[1];
  if (c.startsWith('!!! ')) { result.priority = 3; c = c.substring(4); }
  else if (c.startsWith('!! ')) { result.priority = 2; c = c.substring(3); }
  else if (c.startsWith('! ')) { result.priority = 1; c = c.substring(2); }
  var dm = c.match(/\s*>(\d{4}-\d{2}-\d{2})/);
  if (dm) result.scheduledDate = dm[1];
  var wm = c.match(/\s*>(\d{4}-W\d{2})/);
  if (wm) result.scheduledWeek = wm[1];
  var tagMatches = c.match(/#[\p{L}\p{N}_\-\/]+/gu);
  if (tagMatches) result.tags = tagMatches;
  var menMatches = c.match(/@[\p{L}\p{N}_\-]+/gu);
  if (menMatches) {
    for (var i = 0; i < menMatches.length; i++) {
      if (!menMatches[i].startsWith('@done') && !menMatches[i].startsWith('@due') && !menMatches[i].startsWith('@repeat')) result.mentions.push(menMatches[i]);
    }
  }
  var clean = c;
  clean = clean.replace(/\s*>(\d{4}-\d{2}-\d{2})(\s+\d{1,2}:\d{2}\s*(AM|PM)(\s*-\s*\d{1,2}:\d{2}\s*(AM|PM))?)?/gi, '');
  clean = clean.replace(/\s*>\d{4}-W\d{2}/g, '');
  clean = clean.replace(/\s*@done\([^)]*\)/g, '');
  clean = clean.replace(/\s*@repeat\([^)]*\)/g, '');
  result.cleanContent = clean.trim();
  return result;
}

// ─── Event Delegation ──────────────────────────────────────
var _mainListenersAttached = false;
function attachMainEventListeners() {
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

// ─── Init ──────────────────────────────────────────────────
function renderInitialLoading() {
  var sidebar = document.getElementById('cl-sidebar');
  var main = document.getElementById('cl-main');
  if (sidebar) {
    var inner = document.createElement('div');
    inner.className = 'cl-sidebar-inner';
    for (var i = 0; i < 5; i++) {
      var row = document.createElement('div');
      row.className = 'cl-skeleton-nav';
      var dot = document.createElement('div'); dot.className = 'cl-skeleton-dot';
      var bar = document.createElement('div'); bar.className = 'cl-skeleton-bar';
      row.appendChild(dot); row.appendChild(bar);
      inner.appendChild(row);
    }
    var div = document.createElement('div'); div.className = 'cl-nav-divider';
    inner.appendChild(div);
    for (var j = 0; j < 4; j++) {
      var row2 = document.createElement('div');
      row2.className = 'cl-skeleton-nav';
      var dot2 = document.createElement('div'); dot2.className = 'cl-skeleton-dot';
      var bar2 = document.createElement('div'); bar2.className = 'cl-skeleton-bar';
      bar2.style.width = (50 + (j * 13) % 40) + '%';
      row2.appendChild(dot2); row2.appendChild(bar2);
      inner.appendChild(row2);
    }
    sidebar.replaceChildren(inner);
  }
  if (main) {
    var overlay = document.createElement('div');
    overlay.className = 'cl-loading-overlay';
    var spin = document.createElement('div'); spin.className = 'cl-spinner';
    var lbl = document.createElement('div'); lbl.className = 'cl-loading-label';
    lbl.textContent = 'Loading your tasks\u2026';
    overlay.appendChild(spin);
    overlay.appendChild(lbl);
    main.replaceChildren(overlay);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  renderInitialLoading();
  setTimeout(function() {
    sendMessageToPlugin('ready', '{}');
  }, 100);

  attachDragListeners(document.getElementById('cl-main'));

  // Mobile sidebar toggle
  var toggle = document.getElementById('cl-sidebar-toggle');
  var overlay = document.getElementById('cl-sidebar-overlay');
  if (toggle) {
    toggle.addEventListener('click', function() {
      var sidebar = document.getElementById('cl-sidebar');
      if (sidebar) sidebar.classList.toggle('cl-sidebar-open');
      if (overlay) overlay.classList.toggle('cl-sidebar-open');
    });
  }
  if (overlay) {
    overlay.addEventListener('click', function() {
      var sidebar = document.getElementById('cl-sidebar');
      if (sidebar) sidebar.classList.remove('cl-sidebar-open');
      overlay.classList.remove('cl-sidebar-open');
    });
  }

  // Sidebar resizer (desktop only — CSS hides it on mobile)
  setupSidebarResizer();
});

