// View renderers. `renderCurrentView` dispatches to the six per-view
// builders (inbox/today/upcoming/anytime/someday + note/project). Each
// returns an HTML string that the router slots into #cl-main, then it
// (re)wires the main event delegation handlers.

import { State } from '../state.js';
import { esc, capitalize, formatDateHeader, formatUpcomingDateHeader, formatWeekHeader } from '../lib/helpers.js';
import { renderInlineMarkdown, isTableSeparatorLine, renderMarkdownTable } from '../lib/markdown.js';
import { reviewDueDaysFromFm, isReviewDue, reviewDueLabel } from '../lib/review.js';
import { renderProjectIcon, getViewIcon, buildDeadlineBadgeVerbose } from '../lib/icons.js';
import { getFilteredTasks } from '../lib/task-categorization.js';
import {
  renderTaskRow,
  renderFilterBar,
  renderGroupingToggle,
  renderGroupedTasks,
  renderQuickAdd,
} from './task-list.js';
import { attachMainEventListeners } from '../index.js';

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
  html += '<div class="cl-tasks-only-toggle' + (State.tasksOnly ? ' cl-filter-active' : '') + '" data-action="toggleTasksOnly">' + (State.tasksOnly ? '☑' : '☐') + ' Tasks only</div>';
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
      var hCollapsed = /…\s*$/.test(hRawContent);
      var hDisplay = hRawContent.replace(/\s*…\s*$/, '');
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
        html += '<div class="cl-note-list-item" style="padding-left:' + indent + 'px;"><span class="cl-bullet">•</span><span>' + renderInlineMarkdown(p.content) + '</span></div>';
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

// Used internally by renderNoteView for both top-level and child tasks.
export function parseTaskContentClient(content) {
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
