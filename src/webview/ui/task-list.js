// Building blocks for view rendering: individual task rows, the filter bar,
// grouping toggle/grouped output, and the quick-add input. Each function
// returns an HTML string — the view renderers in index.js concatenate them
// into the final markup.

import { State } from '../state.js';
import { esc, capitalize, formatDateHeader } from '../lib/helpers.js';
import { renderInlineMarkdown } from '../lib/markdown.js';
import { getTasksForView } from '../lib/task-categorization.js';

export function renderTaskRow(task, options) {
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
  // Closed tasks (done / cancelled) shouldn't draw the eye — skip the
  // today-star and priority badge for them.
  var isClosed = (task.status === 'done' || task.status === 'cancelled');
  if (showStar && !isClosed && task.scheduledDate === State.today) {
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
  var badgeSep = repeatBadge ? '  ' : '';
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
    if (hasNotes) indicators.push('<span class="cl-child-icon" title="Has notes">≡</span>');
    if (clCount > 0) indicators.push('<span class="cl-child-icon cl-child-checklist" title="Checklist">☑ ' + clDone + '/' + clCount + '</span>');
    if (subCount > 0) indicators.push('<span class="cl-child-icon" title="Sub-tasks">⤷ ' + subCount + '</span>');
    if (indicators.length > 0) metaParts = metaParts.concat(indicators);
  }
  if (metaParts.length > 0) {
    html += '<div class="cl-task-meta">' + metaParts.join('  &middot; ') + '</div>';
  }
  html += '</div>';

  // Right side badges
  var badges = '';
  if (task.priority > 0 && !isClosed) {
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

// ─── Filter Bar ─────────────────────────────────────────────
// `view`, when provided, makes the filter bar derive its tag/folder pills
// from the unfiltered task set for that view, so users can switch between
// active filters without having to clear them first.
export function renderFilterBar(tasks, view, extrasHTML) {
  var sourceTasks = view ? getTasksForView(view) : tasks;
  var tags = extractUniqueTags(sourceTasks);
  var folders = view ? extractUniqueFolders(sourceTasks) : [];
  var hasTagOrFolder = tags.length > 0 || folders.length >= 2;
  var hasExtras = !!extrasHTML;
  if (!hasTagOrFolder && !hasExtras) return '';
  var html = '<div class="cl-filter-bar">';
  if (hasTagOrFolder) {
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
  }
  if (hasExtras) {
    if (hasTagOrFolder) html += '<span class="cl-filter-divider"></span>';
    html += extrasHTML;
  }
  html += '</div>';
  return html;
}

export function extractUniqueTags(tasks) {
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

export function extractUniqueFolders(tasks) {
  var folderMap = {};
  for (var i = 0; i < tasks.length; i++) {
    var f = tasks[i].folderName;
    if (f) folderMap[f] = true;
  }
  return Object.keys(folderMap).sort();
}

// ─── Grouping ───────────────────────────────────────────────
export function renderGroupingToggle(view) {
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

export function renderGroupedTasks(tasks, grouping, options) {
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

// ─── Quick Add ──────────────────────────────────────────────
export function renderQuickAdd(view) {
  return '<div class="cl-quick-add" data-view="' + view + '">' +
    '<span class="cl-quick-add-icon">+</span>' +
    '<input class="cl-quick-add-input" placeholder="New Task" data-action="quickAdd"/>' +
    '</div>';
}
