// Task list filtering and view bucketing. `getTasksForView` decides which
// open tasks belong to each of the five built-in views (inbox/today/upcoming/
// anytime/someday) and dedupes the today/upcoming views by blockId so a task
// referenced from both the project note and its calendar entry shows up once.
// `getFilteredTasks` layers tag/folder/mention/text filters on top.

import { State } from '../state.js';

export function getTasksForView(view) {
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
        if (
          (t.scheduledDate && t.scheduledDate > today) ||
          (t.scheduledWeek && t.scheduledWeek > currentWeek) ||
          // Calendar-source tasks living on a future daily note. Symmetric to
          // Inbox's sourceDate <= today filter — the source date IS the
          // scheduled date for these.
          (t.sourceType === 'calendar' && t.sourceDate && t.sourceDate > today)
        ) match = true;
        break;
      case 'anytime':
        if (t.sourceType !== 'calendar') {
          if (!t.tags || t.tags.indexOf('#someday') === -1) {
            if (!t.scheduledDate || t.scheduledDate <= today) {
              if (!t.scheduledWeek || t.scheduledWeek <= currentWeek) match = true;
            }
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

export function getFilteredTasks(view) {
  var tasks = getTasksForView(view);
  if (State.filters.tag) {
    tasks = tasks.filter(function(t) { return t.tags && t.tags.indexOf(State.filters.tag) >= 0; });
  }
  if (State.filters.folder) {
    tasks = tasks.filter(function(t) { return (t.folderName || '') === State.filters.folder; });
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

export function getViewCount(view) { return getTasksForView(view).length; }
