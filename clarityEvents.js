/* global sendMessageToPlugin */

// ─── State ─────────────────────────────────────────────────
var State = {
  tasks: [],
  folders: [],
  notes: [],
  currentView: 'inbox',
  currentNoteFilename: null,
  expandedTaskId: null,
  filters: { tag: null, mention: null, text: '', noteStatus: 'all' },
  grouping: 'note',
  movedFromInbox: [],
  editDraft: null,
  focusedTaskIndex: -1,
  today: '',
  currentWeek: '',
  tasksOnly: false,
  noteContent: null,
};

// ─── Message Handling ──────────────────────────────────────
function onMessageFromPlugin(type, data) {
  switch (type) {
    case 'INIT_DATA':
      State.tasks = data.tasks || [];
      State.folders = data.folders || [];
      State.notes = data.notes || [];
      State.today = data.today || '';
      State.currentWeek = data.currentWeek || '';
      if (data.lastView) State.currentView = data.lastView;
      renderSidebar();
      renderCurrentView();
      break;
    case 'NOTE_CONTENT':
      State.noteContent = data;
      if (State.currentView === 'note') renderCurrentView();
      break;
    case 'TASK_CREATED':
    case 'TASK_SAVED':
    case 'TASK_TOGGLED':
      sendMessageToPlugin('ready', '{}');
      break;
    default:
      console.log('Clarity WebView: unknown message type: ' + type);
  }
}

// ─── Helpers ───────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

// ─── View Categorization ───────────────────────────────────
function getTasksForView(view) {
  var today = State.today;
  var currentWeek = State.currentWeek;
  var result = [];
  var seenBlockIds = {};
  var needsDedup = (view === 'today' || view === 'upcoming');

  for (var i = 0; i < State.tasks.length; i++) {
    var t = State.tasks[i];
    if (t.status !== 'open') continue;
    if (t.isDelegated) continue;
    var match = false;
    switch (view) {
      case 'inbox':
        if (t.sourceType === 'calendar' && t.sourceDate && t.sourceDate <= today) match = true;
        break;
      case 'today':
        if (t.scheduledDate && t.scheduledDate <= today) match = true;
        break;
      case 'upcoming':
        if ((t.scheduledDate && t.scheduledDate > today) || (t.scheduledWeek && t.scheduledWeek > currentWeek)) match = true;
        break;
      case 'anytime':
        if (!t.tags || t.tags.indexOf('#someday') === -1) {
          if (!t.scheduledDate || t.scheduledDate <= today) {
            if (!t.scheduledWeek || t.scheduledWeek <= currentWeek) match = true;
          }
        }
        break;
      case 'someday':
        if (t.tags && t.tags.indexOf('#someday') >= 0) match = true;
        break;
    }
    if (match) {
      // Deduplicate by blockId in Today/Upcoming — prefer project note over calendar note
      if (needsDedup && t.blockId) {
        if (seenBlockIds[t.blockId]) {
          // Replace calendar-source duplicate with project-note version
          if (t.sourceType === 'note' && seenBlockIds[t.blockId].sourceType === 'calendar') {
            var idx = result.indexOf(seenBlockIds[t.blockId]);
            if (idx >= 0) result[idx] = t;
            seenBlockIds[t.blockId] = t;
          }
          continue;
        }
        seenBlockIds[t.blockId] = t;
      }
      result.push(t);
    }
  }
  return result;
}

function getFilteredTasks(view) {
  var tasks = getTasksForView(view);
  if (State.filters.tag) {
    tasks = tasks.filter(function(t) { return t.tags && t.tags.indexOf(State.filters.tag) >= 0; });
  }
  if (State.filters.mention) {
    tasks = tasks.filter(function(t) { return t.mentions && t.mentions.indexOf(State.filters.mention) >= 0; });
  }
  if (State.filters.text) {
    var q = State.filters.text.toLowerCase();
    tasks = tasks.filter(function(t) { return t.content.toLowerCase().indexOf(q) >= 0; });
  }
  return tasks;
}

function getViewCount(view) { return getTasksForView(view).length; }

// ─── Inline Markdown ───────────────────────────────────────
function renderInlineMarkdown(text) {
  if (!text) return '';
  var s = esc(text);

  // Extract links into placeholders first to protect URLs from tag/mention regexes
  var placeholders = [];
  function placeholder(html) {
    var key = '\x00PH' + placeholders.length + '\x00';
    placeholders.push(html);
    return key;
  }

  // Markdown links [text](url) — extract before escaping corrupts URLs
  s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(m, linkText, url) {
    return placeholder('<a class="cl-link" href="' + url + '" target="_blank">' + linkText + '</a>');
  });

  // Wiki links [[text]]
  s = s.replace(/\[\[([^\]]+)\]\]/g, function(m, linkText) {
    return placeholder('<span class="cl-wikilink">' + linkText + '</span>');
  });

  // Bare URLs (after markdown/wiki links are already placeholders)
  s = s.replace(/(https?:\/\/[^\s<>\[\]]+)/g, function(m, url) {
    return placeholder('<a class="cl-link" href="' + url + '" target="_blank">' + url + '</a>');
  });

  // Formatting
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, '<em>$1</em>');
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  s = s.replace(/==(.+?)==/g, '<mark>$1</mark>');

  // Comments: // ... and /* ... */
  s = s.replace(/\/\/\s.*$/g, function(m) {
    return placeholder('<span class="cl-comment">' + m + '</span>');
  });
  s = s.replace(/\/\*.*?\*\//g, function(m) {
    return placeholder('<span class="cl-comment">' + m + '</span>');
  });

  // Block IDs: ^abc123 → skyblue asterisk
  s = s.replace(/\s*\^[\da-zA-Z]{4,}/g, function(m) {
    return placeholder(' <span class="cl-block-id">*</span>');
  });

  // Tags and mentions — now safe because URLs are placeholders
  s = s.replace(/(#[\w\-\/]+)/g, '<span class="cl-tag-inline">$1</span>');
  // Mentions: only match @word when preceded by space or start (not inside emails)
  s = s.replace(/(^|[\s(])(@(?!done|due|repeat)[\w\-]+)/g, function(m, pre, mention) {
    return pre + '<span class="cl-mention-inline">' + mention + '</span>';
  });

  // Restore placeholders
  for (var i = 0; i < placeholders.length; i++) {
    s = s.replace('\x00PH' + i + '\x00', placeholders[i]);
  }

  return s;
}

// ─── Sidebar ───────────────────────────────────────────────
function renderSidebar() {
  var el = document.getElementById('cl-sidebar');
  if (!el) return;

  var views = [
    { id: 'inbox', icon: '📥', label: 'Inbox' },
    { id: 'today', icon: '⭐', label: 'Today' },
    { id: 'upcoming', icon: '📅', label: 'Upcoming' },
    { id: 'anytime', icon: '📋', label: 'Anytime' },
    { id: 'someday', icon: '💤', label: 'Someday' },
  ];

  var html = '<div class="cl-sidebar-inner">';
  for (var vi = 0; vi < views.length; vi++) {
    var v = views[vi];
    var count = getViewCount(v.id);
    var active = State.currentView === v.id ? ' cl-nav-active' : '';
    html += '<div class="cl-nav-item' + active + '" data-view="' + v.id + '">';
    html += '<span class="cl-nav-icon">' + v.icon + '</span>';
    html += '<span class="cl-nav-label">' + v.label + '</span>';
    if (count > 0 && (v.id === 'inbox' || v.id === 'today')) {
      html += '<span class="cl-nav-count">' + count + '</span>';
    }
    html += '</div>';
  }

  html += '<div class="cl-nav-divider"></div>';

  // Areas & Projects
  var currentParent = '';
  for (var fi = 0; fi < State.folders.length; fi++) {
    var folder = State.folders[fi];
    if (folder.parentFolder !== currentParent) {
      currentParent = folder.parentFolder;
      html += '<div class="cl-area-header">' + esc(currentParent) + '</div>';
    }
    var notes = folder.notes || [];
    for (var ni = 0; ni < notes.length; ni++) {
      var n = notes[ni];
      var pct = n.taskCount > 0 ? Math.round((n.doneCount / n.taskCount) * 100) : 0;
      var color = n.bgColorDark || '#3B82F6';
      var noteActive = (State.currentView === 'note' && State.currentNoteFilename === n.filename) ? ' cl-nav-active' : '';
      var circumference = 2 * Math.PI * 7;
      var offset = circumference - (pct / 100) * circumference;
      html += '<div class="cl-nav-item cl-project-item' + noteActive + '" data-view="note" data-filename="' + esc(n.filename) + '">';
      html += '<svg class="cl-progress-ring" width="18" height="18" viewBox="0 0 18 18">';
      html += '<circle cx="9" cy="9" r="7" fill="none" stroke="' + color + '" stroke-opacity="0.2" stroke-width="2"/>';
      if (pct > 0) {
        html += '<circle cx="9" cy="9" r="7" fill="none" stroke="' + color + '" stroke-width="2" stroke-dasharray="' + circumference.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '" transform="rotate(-90 9 9)" stroke-linecap="round"/>';
      }
      html += '</svg>';
      html += '<span class="cl-project-title">' + esc(n.title) + '</span>';
      html += '</div>';
    }
  }

  html += '</div>';
  el.innerHTML = html;

  var navItems = el.querySelectorAll('.cl-nav-item');
  for (var ci = 0; ci < navItems.length; ci++) {
    navItems[ci].addEventListener('click', handleNavClick);
  }
}

function handleNavClick(e) {
  var item = e.currentTarget;
  var view = item.dataset.view;
  if (!view) return;
  State.currentView = view;
  State.focusedTaskIndex = -1;
  State.filters = { tag: null, mention: null, text: '', noteStatus: 'all' };
  State.tasksOnly = false;
  State.expandedTaskId = null;
  State.editDraft = null;

  if (view === 'inbox') State.grouping = 'date';
  else if (view === 'today') State.grouping = 'note';
  else if (view === 'anytime') State.grouping = 'folder';
  else if (view === 'someday') State.grouping = 'note';

  if (view === 'note') {
    State.currentNoteFilename = item.dataset.filename || null;
    sendMessageToPlugin('requestNoteContent', JSON.stringify({ filename: State.currentNoteFilename }));
  }

  sendMessageToPlugin('saveView', JSON.stringify({ view: view }));
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
  var dimmed = options.dimmed || false;

  var classes = 'cl-task-row';
  if (task.status === 'done') classes += ' cl-done';
  if (task.status === 'cancelled') classes += ' cl-cancelled';
  if (isOverdue) classes += ' cl-overdue';
  if (dimmed) classes += ' cl-dimmed';

  var html = '<div class="' + classes + '" data-task-id="' + esc(task.id) + '">';

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
  html += '<span class="cl-task-text">' + renderInlineMarkdown(task.content) + '</span>';
  if (showStar && task.scheduledDate === State.today) {
    html += ' <span class="cl-star">⭐</span>';
  }
  html += '</div>';

  var metaParts = [];
  if (showSource && task.noteTitle && task.sourceType === 'note') {
    metaParts.push(esc(task.noteTitle));
  }
  if (isOverdue && task.scheduledDate) {
    metaParts.push('<span class="cl-overdue-date">' + task.scheduledDate + '</span>');
  } else if (task.scheduledDate && task.scheduledDate !== State.today && !isOverdue) {
    metaParts.push(task.scheduledDate);
  }
  if (task.isDelegated && task.mentions.length > 0) {
    metaParts.push('delegated to <span class="cl-mention-inline">' + esc(task.mentions[0]) + '</span>');
  }
  if (metaParts.length > 0) {
    html += '<div class="cl-task-meta">' + metaParts.join(' &middot; ') + '</div>';
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
function renderFilterBar(tasks) {
  var tags = extractUniqueTags(tasks);
  if (tags.length === 0) return '';
  var html = '<div class="cl-filter-bar">';
  var activeTag = State.filters.tag;
  html += '<span class="cl-filter-pill' + (!activeTag ? ' cl-filter-active' : '') + '" data-action="filterTag" data-tag="">All</span>';
  for (var i = 0; i < tags.length; i++) {
    var active = (activeTag === tags[i]) ? ' cl-filter-active' : '';
    html += '<span class="cl-filter-pill' + active + '" data-action="filterTag" data-tag="' + esc(tags[i]) + '">' + esc(tags[i]) + '</span>';
  }
  html += '</div>';
  return html;
}

function extractUniqueTags(tasks) {
  var tagMap = {};
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].tags) {
      for (var j = 0; j < tasks[i].tags.length; j++) {
        if (tasks[i].tags[j] !== '#someday') tagMap[tasks[i].tags[j]] = true;
      }
    }
  }
  return Object.keys(tagMap).sort();
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
  if (grouping === 'priority') groupOrder.reverse();

  var html = '';
  for (var gi = 0; gi < groupOrder.length; gi++) {
    var name = groupOrder[gi];
    var displayName = (grouping === 'date') ? formatDateHeader(name) : name;
    html += '<div class="cl-group-header">' + esc(displayName) + '</div>';
    var group = groups[groupOrder[gi]];
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

// ─── Date Formatting ───────────────────────────────────────
function formatDateHeader(dateStr) {
  if (!dateStr || dateStr === 'No Date') return dateStr;
  try {
    var parts = dateStr.split('-');
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    var days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getMonth()] + ' ' + d.getDate() + ' \u2014 ' + days[d.getDay()];
  } catch (e) { return dateStr; }
}

function formatUpcomingDateHeader(dateStr) {
  try {
    var parts = dateStr.split('-');
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    var days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var label = days[d.getDay()] + ', ' + months[d.getMonth()] + ' ' + d.getDate();
    var tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    var tmrStr = tomorrow.getFullYear() + '-' + String(tomorrow.getMonth() + 1).padStart(2, '0') + '-' + String(tomorrow.getDate()).padStart(2, '0');
    if (dateStr === tmrStr) label += ' <span style="opacity:0.5;font-weight:400;">Tomorrow</span>';
    return label;
  } catch (e) { return dateStr; }
}

function formatWeekHeader(weekStr) {
  try {
    var parts = weekStr.split('-W');
    var year = parseInt(parts[0]);
    var week = parseInt(parts[1]);
    var jan1 = new Date(year, 0, 1);
    var dayOffset = (jan1.getDay() + 6) % 7;
    var weekStart = new Date(year, 0, 1 + (week - 1) * 7 - dayOffset);
    var weekEnd = new Date(weekStart.getTime() + 6 * 86400000);
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return 'Week ' + week + ' \u2014 ' + months[weekStart.getMonth()] + ' ' + weekStart.getDate() + '\u2013' + weekEnd.getDate();
  } catch (e) { return weekStr; }
}

function formatShortDate(dateStr) {
  try {
    var parts = dateStr.split('-');
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return months[d.getMonth()] + ' ' + d.getDate();
  } catch (e) { return dateStr; }
}

// ─── View Router ───────────────────────────────────────────
function renderCurrentView() {
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
  html += '<div class="cl-view-title"><span class="cl-view-icon">📥</span><h1>Inbox</h1>';
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
  html += '<div class="cl-view-title"><span class="cl-view-icon">⭐</span><h1>Today</h1>';
  html += '<span class="cl-view-count">' + tasks.length + '</span></div>';
  html += renderGroupingToggle('today');
  html += '</div>';
  html += renderFilterBar(tasks);
  html += renderQuickAdd('today');
  html += '<div class="cl-task-list">';

  var overdue = [];
  var todayTasks = [];
  for (var i = 0; i < tasks.length; i++) {
    if (tasks[i].scheduledDate && tasks[i].scheduledDate < today) overdue.push(tasks[i]);
    else todayTasks.push(tasks[i]);
  }

  if (overdue.length > 0) {
    html += '<div class="cl-group-header cl-overdue-header">Overdue</div>';
    for (var oi = 0; oi < overdue.length; oi++) {
      html += renderTaskRow(overdue[oi], { isOverdue: true, showSource: true });
    }
  }

  html += renderGroupedTasks(todayTasks, State.grouping);
  html += '</div>';
  return html;
}

// ─── Upcoming View ─────────────────────────────────────────
function renderUpcomingView() {
  var tasks = getFilteredTasks('upcoming');
  var html = '<div class="cl-view-header">';
  html += '<div class="cl-view-title"><span class="cl-view-icon">📅</span><h1>Upcoming</h1></div></div>';
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
  html += '<div class="cl-view-title"><span class="cl-view-icon">📋</span><h1>Anytime</h1>';
  html += '<span class="cl-view-count">' + tasks.length + '</span></div>';
  html += renderGroupingToggle('anytime');
  html += '</div>';
  html += renderFilterBar(tasks);
  html += renderQuickAdd('anytime');
  html += '<div class="cl-task-list">';
  html += renderGroupedTasks(tasks, State.grouping, { showStar: true });
  html += '</div>';
  return html;
}

// ─── Someday View ──────────────────────────────────────────
function renderSomedayView() {
  var tasks = getFilteredTasks('someday');
  var html = '<div class="cl-view-header">';
  html += '<div class="cl-view-title"><span class="cl-view-icon">💤</span><h1>Someday</h1>';
  html += '<span class="cl-view-count">' + tasks.length + '</span></div>';
  html += renderGroupingToggle('someday');
  html += '</div>';
  html += renderFilterBar(tasks);
  html += renderQuickAdd('someday');
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
  var bgColor = fm['bg-color-dark'] || '#3B82F6';

  var taskCount = 0;
  var doneCount = 0;
  for (var ci = 0; ci < paras.length; ci++) {
    var pt = paras[ci].type;
    if (pt === 'open' || pt === 'done' || pt === 'cancelled') { taskCount++; if (pt === 'done') doneCount++; }
  }
  var pct = taskCount > 0 ? Math.round((doneCount / taskCount) * 100) : 0;
  var circumference = 2 * Math.PI * 9;
  var offset = circumference - (pct / 100) * circumference;

  var html = '<div class="cl-view-header">';
  html += '<div class="cl-view-title">';
  html += '<svg class="cl-progress-ring" width="24" height="24" viewBox="0 0 24 24">';
  html += '<circle cx="12" cy="12" r="9" fill="none" stroke="' + bgColor + '" stroke-opacity="0.2" stroke-width="2.5"/>';
  if (pct > 0) {
    html += '<circle cx="12" cy="12" r="9" fill="none" stroke="' + bgColor + '" stroke-width="2.5" stroke-dasharray="' + circumference.toFixed(1) + '" stroke-dashoffset="' + offset.toFixed(1) + '" transform="rotate(-90 12 12)" stroke-linecap="round"/>';
  }
  html += '</svg>';
  html += '<h1>' + esc(nc.title) + '</h1></div>';

  var folderPath = (nc.filename || '').replace(/\/[^/]+$/, '');
  html += '<div class="cl-note-breadcrumb">' + esc(folderPath) + ' &middot; ' + doneCount + '/' + taskCount + ' done</div>';

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
  for (var pi = 0; pi < paras.length; pi++) {
    var p = paras[pi];
    if (pi === 0 && p.content === '---') {
      for (var fmi = 1; fmi < paras.length; fmi++) { if (paras[fmi].content === '---') { pi = fmi; break; } }
      continue;
    }
    if (p.type === 'title' && p.headingLevel === 1 && pi <= 3) continue;

    var isTask = (p.type === 'open' || p.type === 'done' || p.type === 'cancelled');
    var isChecklist = (p.type === 'checklist' || p.type === 'checklistDone' || p.type === 'checklistCancelled');
    var isHeading = p.type === 'title';

    if (State.tasksOnly && !isTask && !isChecklist && !isHeading) continue;

    if (State.filters.noteStatus && State.filters.noteStatus !== 'all' && (isTask || isChecklist)) {
      var taskStatus = (p.type === 'done' || p.type === 'checklistDone') ? 'done' : (p.type === 'open' || p.type === 'checklist') ? 'open' : 'cancelled';
      if (State.filters.noteStatus !== taskStatus) continue;
    }

    if (isHeading) {
      var hClass = State.tasksOnly ? 'cl-section-heading' : 'cl-note-heading cl-note-h' + p.headingLevel;
      html += '<div class="' + hClass + '">' + renderInlineMarkdown(p.content) + '</div>';
    } else if (isTask || isChecklist) {
      var parsed = parseTaskContentClient(p.content);
      var status = (p.type === 'done' || p.type === 'checklistDone') ? 'done' : (p.type === 'cancelled' || p.type === 'checklistCancelled') ? 'cancelled' : 'open';
      var raw = (p.rawContent || '').trimStart();
      var taskObj = {
        id: nc.filename + ':' + p.lineIndex, content: parsed.cleanContent, rawContent: p.content,
        type: isChecklist ? 'checklist' : 'task', status: status, priority: parsed.priority,
        scheduledDate: parsed.scheduledDate, scheduledWeek: parsed.scheduledWeek,
        tags: parsed.tags, mentions: parsed.mentions, isDelegated: raw.startsWith('+'),
        noteFilename: nc.filename, noteTitle: nc.title, folderPath: '', folderName: '',
        lineIndex: p.lineIndex, children: [],
      };
      var indent = (p.indentLevel || 0) * 20;
      if (indent > 0) html += '<div style="padding-left:' + indent + 'px;">';
      html += renderTaskRow(taskObj, { showSource: false });
      if (indent > 0) html += '</div>';
    } else {
      html += '<div class="cl-note-para" style="padding-left:' + ((p.indentLevel || 0) * 20) + 'px;">' + renderInlineMarkdown(p.content) + '</div>';
    }
  }
  html += '</div>';
  return html;
}

function parseTaskContentClient(content) {
  var result = { priority: 0, scheduledDate: null, scheduledWeek: null, tags: [], mentions: [], cleanContent: '' };
  var c = content || '';
  if (c.startsWith('!!! ')) { result.priority = 3; c = c.substring(4); }
  else if (c.startsWith('!! ')) { result.priority = 2; c = c.substring(3); }
  else if (c.startsWith('! ')) { result.priority = 1; c = c.substring(2); }
  var dm = c.match(/\s*>(\d{4}-\d{2}-\d{2})/);
  if (dm) result.scheduledDate = dm[1];
  var wm = c.match(/\s*>(\d{4}-W\d{2})/);
  if (wm) result.scheduledWeek = wm[1];
  var tagMatches = c.match(/#[\w\-\/]+/g);
  if (tagMatches) result.tags = tagMatches;
  var menMatches = c.match(/@[\w\-]+/g);
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
    // Let links work normally
    if (e.target.closest('a.cl-link')) return;

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
      case 'filterTag':
        State.filters.tag = target.dataset.tag || null;
        renderCurrentView();
        break;
      case 'filterNoteStatus':
        State.filters.noteStatus = target.dataset.status || 'all';
        renderCurrentView();
        break;
      case 'toggleTasksOnly':
        State.tasksOnly = !State.tasksOnly;
        renderCurrentView();
        break;
      case 'setGrouping':
        State.grouping = target.dataset.grouping || 'note';
        renderCurrentView();
        break;
      case 'dismissMoved':
        State.movedFromInbox = [];
        renderCurrentView();
        break;
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
      sendMessageToPlugin('createTask', JSON.stringify(msg));
      e.target.value = '';
    }
  });
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
  State.editDraft = {
    content: task.content,
    rawContent: task.rawContent,
    priority: task.priority,
    scheduledDate: task.scheduledDate,
    scheduledWeek: task.scheduledWeek,
    tags: task.tags ? task.tags.slice() : [],
    mentions: task.mentions ? task.mentions.slice() : [],
    moveToFilename: null,
    notes: [],
    checklists: [],
  };

  for (var ci = 0; ci < task.children.length; ci++) {
    var child = task.children[ci];
    if (child.type === 'note') State.editDraft.notes.push({ content: child.content, lineIndex: child.lineIndex });
    else if (child.type === 'checklist') State.editDraft.checklists.push({ content: child.content, status: child.status, lineIndex: child.lineIndex });
  }

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

  var titleEl = editor.querySelector('.cl-editor-title');
  if (titleEl) titleEl.focus();
  attachEditorListeners(editor);
}

function collapseTask() {
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

  html += '<div class="cl-editor-row">';
  html += '<div class="cl-cb" data-action="toggle"></div>';
  html += '<input class="cl-editor-title" value="' + esc(task.content) + '" data-field="title"/>';
  html += '</div>';

  var notesText = draft.notes.map(function(n) { return n.content; }).join('\n');
  html += '<div class="cl-editor-section">';
  html += '<textarea class="cl-editor-notes" placeholder="Notes..." data-field="notes">' + esc(notesText) + '</textarea>';
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

  var moveLabel = task.sourceType === 'calendar' ? 'Move to...' : esc(task.noteTitle);
  html += '<div class="cl-meta-chip" data-action="openNotePicker"><span class="cl-meta-icon">\uD83D\uDCC1</span>' + moveLabel + '</div>';

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
  return html;
}

function attachEditorListeners(editor) {
  editor.addEventListener('click', function(e) {
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
        var newTag = prompt('Add tag (e.g. #w/milx):');
        if (newTag && newTag.trim()) {
          if (!newTag.startsWith('#')) newTag = '#' + newTag;
          State.editDraft.tags.push(newTag.trim());
          reRenderEditorMeta();
        }
        break;
      case 'addMention':
        var newMention = prompt('Add mention (e.g. @SerhiiP):');
        if (newMention && newMention.trim()) {
          if (!newMention.startsWith('@')) newMention = '@' + newMention;
          State.editDraft.mentions.push(newMention.trim());
          reRenderEditorMeta();
        }
        break;
      case 'openDatePicker':
        showDatePicker(target);
        break;
      case 'openNotePicker':
        showNotePicker(target);
        break;
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
  var draft = State.editDraft;
  var taskId = State.expandedTaskId;
  var parts = taskId.split(':');
  var filename = parts.slice(0, -1).join(':');
  var lineIndex = parseInt(parts[parts.length - 1]);

  var editor = document.getElementById('cl-editor');
  if (editor) {
    var titleInput = editor.querySelector('.cl-editor-title');
    if (titleInput) draft.content = titleInput.value;
    var notesArea = editor.querySelector('.cl-editor-notes');
    if (notesArea) {
      var noteLines = notesArea.value.split('\n').filter(function(l) { return l.trim(); });
      draft.notes = noteLines.map(function(l, i) {
        return { content: l, lineIndex: draft.notes[i] ? draft.notes[i].lineIndex : -1 };
      });
    }
  }

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
  var input = picker.querySelector('.cl-picker-input');
  input.addEventListener('input', function() {
    document.getElementById('cl-note-results').innerHTML = renderNoteResults(input.value);
  });

  picker.addEventListener('click', function(e) {
    var target = e.target.closest('[data-action="selectNote"]');
    if (target) {
      State.editDraft.moveToFilename = target.dataset.filename;
      var editor = document.getElementById('cl-editor');
      if (editor) {
        var chip = editor.querySelector('[data-action="openNotePicker"]');
        if (chip) chip.innerHTML = '<span class="cl-meta-icon">\uD83D\uDCC1</span>' + esc(target.dataset.title);
      }
      closePickers();
    }
  });
}

function renderNoteResults(query) {
  var q = (query || '').toLowerCase();
  var html = '';
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

function closePickers() {
  var pickers = document.querySelectorAll('.cl-picker');
  for (var i = 0; i < pickers.length; i++) pickers[i].remove();
}

// ─── Date Helpers ──────────────────────────────────────────
function addDays(dateStr, n) {
  var parts = dateStr.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  d.setDate(d.getDate() + n);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getNextMonday(dateStr) {
  var parts = dateStr.split('-');
  var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  var day = d.getDay();
  var daysUntilMon = (day === 0) ? 1 : (8 - day);
  d.setDate(d.getDate() + daysUntilMon);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function addWeeks(weekStr, n) {
  var parts = weekStr.split('-W');
  var year = parseInt(parts[0]);
  var week = parseInt(parts[1]) + n;
  while (week > 52) { year++; week -= 52; }
  return year + '-W' + String(week).padStart(2, '0');
}

// ─── Keyboard Shortcuts ────────────────────────────────────
document.addEventListener('keydown', function(e) {
  // Cmd+Enter: save expanded task
  if (e.metaKey && e.key === 'Enter') {
    if (State.expandedTaskId) { e.preventDefault(); saveExpandedTask(); }
    return;
  }

  // Escape: close picker or collapse editor
  if (e.key === 'Escape') {
    var picker = document.querySelector('.cl-picker');
    if (picker) { picker.remove(); return; }
    if (State.expandedTaskId) { collapseTask(); return; }
  }

  // Cmd+T: schedule for today
  if (e.metaKey && e.key === 't') {
    if (State.editDraft) {
      e.preventDefault();
      State.editDraft.scheduledDate = State.today;
      State.editDraft.scheduledWeek = null;
      State.editDraft.tags = State.editDraft.tags.filter(function(t) { return t !== '#someday'; });
      updateDateChip();
    }
    return;
  }

  // Cmd+O: remove schedule
  if (e.metaKey && e.key === 'o') {
    if (State.editDraft) {
      e.preventDefault();
      State.editDraft.scheduledDate = null;
      State.editDraft.scheduledWeek = null;
      updateDateChip();
    }
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
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    sendMessageToPlugin('ready', '{}');
  }, 100);
});
