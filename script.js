/* global DataStore, Editor, HTMLView, CommandBar, NotePlan */

var PLUGIN_ID = 'asktru.Clarity';
var WINDOW_ID = 'asktru.Clarity.dashboard';

// ─── Settings ──────────────────────────────────────────────
function getSettings() {
  var s = DataStore.settings || {};
  return {
    inboxLookbackDays: s.inboxLookbackDays || 14,
    excludedFolders: (s.excludedFolders || '').split(',').map(function(f) { return f.trim(); }).filter(Boolean),
    lastView: s.lastView || 'inbox',
  };
}

function saveSetting(key, value) {
  var s = DataStore.settings || {};
  s[key] = value;
  DataStore.settings = s;
}

// ─── Theme ─────────────────────────────────────────────────
function npColor(argbHex) {
  if (!argbHex || typeof argbHex !== 'string') return '';
  var hex = argbHex.replace(/^#/, '');
  if (hex.length === 8) {
    var a = parseInt(hex.substring(0, 2), 16) / 255;
    var r = parseInt(hex.substring(2, 4), 16);
    var g = parseInt(hex.substring(4, 6), 16);
    var b = parseInt(hex.substring(6, 8), 16);
    return 'rgba(' + r + ',' + g + ',' + b + ',' + a.toFixed(3) + ')';
  }
  if (hex.length === 6) return '#' + hex;
  return '';
}

function getThemeCSS() {
  try {
    var theme = Editor.currentTheme;
    if (!theme) return '';
    var vals = theme.values || {};
    var editor = vals.editor || {};
    var styles = [];
    var bg = npColor(editor.backgroundColor);
    var altBg = npColor(editor.altBackgroundColor);
    var text = npColor(editor.textColor);
    var tint = npColor(editor.tintColor);
    if (bg) styles.push('--bg-main-color: ' + bg);
    if (altBg) styles.push('--bg-alt-color: ' + altBg);
    if (text) styles.push('--fg-main-color: ' + text);
    if (tint) styles.push('--tint-color: ' + tint);
    if (styles.length > 0) return ':root { ' + styles.join('; ') + '; }';
  } catch (e) {}
  return '';
}

function isLightTheme() {
  try {
    var theme = Editor.currentTheme;
    if (!theme) return false;
    if (theme.mode === 'light') return true;
    if (theme.mode === 'dark') return false;
  } catch (e) {}
  return false;
}

// ─── HTML Shell ────────────────────────────────────────────
function buildFullHTML() {
  var themeCSS = getThemeCSS();
  var themeAttr = isLightTheme() ? 'light' : 'dark';
  var faLinks =
    '  <link href="../np.Shared/fontawesome.css" rel="stylesheet">\n' +
    '  <link href="../np.Shared/regular.min.flat4NP.css" rel="stylesheet">\n' +
    '  <link href="../np.Shared/solid.min.flat4NP.css" rel="stylesheet">\n';

  return '<!DOCTYPE html>\n<html data-theme="' + themeAttr + '">\n<head>\n' +
    '  <meta charset="utf-8">\n' +
    '  <meta name="viewport" content="width=device-width, initial-scale=1">\n' +
    '  <title>Clarity</title>\n' +
    faLinks +
    '  <link rel="stylesheet" href="clarity.css">\n' +
    '  <style>' + themeCSS + '</style>\n' +
    '</head>\n<body>\n' +
    '  <div id="cl-root"><div id="cl-sidebar"></div><div id="cl-main"></div></div>\n' +
    '  <script>var receivingPluginID = \'' + PLUGIN_ID + '\';<\/script>\n' +
    '  <script type="text/javascript" src="clarityEvents.js"><\/script>\n' +
    '  <script type="text/javascript" src="../np.Shared/pluginToHTMLCommsBridge.js"><\/script>\n' +
    '</body>\n</html>';
}

// ─── Entry Point ───────────────────────────────────────────
async function showClarity() {
  try {
    CommandBar.showLoading(true, 'Loading Clarity...');
    await CommandBar.onAsyncThread();

    var fullHTML = buildFullHTML();

    await CommandBar.onMainThread();
    CommandBar.showLoading(false);

    var winOptions = {
      customId: WINDOW_ID,
      savedFilename: '../../asktru.Clarity/clarity.html',
      shouldFocus: true,
      reuseUsersWindowRect: true,
      headerBGColor: 'transparent',
      autoTopPadding: true,
      showReloadButton: true,
      reloadPluginID: PLUGIN_ID,
      reloadCommandName: 'Clarity',
      icon: 'fa-crystal-ball',
      iconColor: '#3B82F6',
    };

    var result = await HTMLView.showInMainWindow(fullHTML, 'Clarity', winOptions);
    if (!result || !result.success) {
      await HTMLView.showWindowWithOptions(fullHTML, 'Clarity', winOptions);
    }
  } catch (err) {
    CommandBar.showLoading(false);
    console.log('Clarity error: ' + String(err));
  }
}

// ─── Send to HTML ──────────────────────────────────────────
async function sendToHTMLWindow(type, data) {
  try {
    if (typeof HTMLView === 'undefined' || typeof HTMLView.runJavaScript !== 'function') return;
    var payload = {};
    var keys = Object.keys(data);
    for (var k = 0; k < keys.length; k++) payload[keys[k]] = data[keys[k]];
    payload.NPWindowID = WINDOW_ID;
    var stringifiedPayload = JSON.stringify(payload);
    var doubleStringified = JSON.stringify(stringifiedPayload);
    var jsCode = '(function(){try{var pd=' + doubleStringified + ';var p=JSON.parse(pd);window.postMessage({type:"' + type + '",payload:p},"*");}catch(e){console.error("sendToHTMLWindow error:",e);}})();';
    await HTMLView.runJavaScript(jsCode, WINDOW_ID);
  } catch (err) {
    console.log('sendToHTMLWindow error: ' + String(err));
  }
}

// ─── Message Handler ───────────────────────────────────────
async function onMessageFromHTMLView(actionType, data) {
  try {
    var msg = typeof data === 'string' ? JSON.parse(data) : data;
    switch (actionType) {
      case 'ready':
        await handleReady();
        break;
      case 'saveView':
        saveSetting('lastView', msg.view || 'inbox');
        break;

      case 'toggleTask': {
        var tNote = findNoteByFilename(msg.filename);
        if (!tNote) break;
        var tPara = findParagraph(tNote, msg.lineIndex);
        if (!tPara) break;
        var raw = (tPara.rawContent || '').trimStart();
        var isCl = raw.startsWith('+');
        if (tPara.type === 'open' || tPara.type === 'checklist') {
          tPara.type = isCl ? 'checklistDone' : 'done';
          var now = new Date();
          var doneTag = '@done(' + now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + ')';
          tPara.content = (tPara.content || '').trimEnd() + ' ' + doneTag;
        } else {
          tPara.type = isCl ? 'checklist' : 'open';
          tPara.content = (tPara.content || '').replace(/\s*@done\([^)]*\)/, '');
        }
        tNote.updateParagraph(tPara);
        await sendToHTMLWindow('TASK_TOGGLED', { id: msg.filename + ':' + msg.lineIndex });
        break;
      }

      case 'saveTask': {
        var sNote = findNoteByFilename(msg.filename);
        if (!sNote) break;
        var sPara = findParagraph(sNote, msg.lineIndex);
        if (!sPara) break;

        var priPrefix = '';
        if (msg.priority === 1) priPrefix = '! ';
        else if (msg.priority === 2) priPrefix = '!! ';
        else if (msg.priority === 3) priPrefix = '!!! ';

        var newContent = priPrefix + msg.content;
        var msgTags = msg.tags || [];
        for (var sti = 0; sti < msgTags.length; sti++) {
          if (newContent.indexOf(msgTags[sti]) === -1) newContent += ' ' + msgTags[sti];
        }
        var msgMentions = msg.mentions || [];
        for (var smi = 0; smi < msgMentions.length; smi++) {
          if (newContent.indexOf(msgMentions[smi]) === -1) newContent += ' ' + msgMentions[smi];
        }
        if (msg.scheduledDate) newContent += ' >' + msg.scheduledDate;
        else if (msg.scheduledWeek) newContent += ' >' + msg.scheduledWeek;

        sPara.content = newContent;
        sNote.updateParagraph(sPara);

        // Update child notes
        var msgNotes = msg.notes || [];
        for (var ni = 0; ni < msgNotes.length; ni++) {
          if (msgNotes[ni].lineIndex >= 0) {
            var notePara = findParagraph(sNote, msgNotes[ni].lineIndex);
            if (notePara) { notePara.content = msgNotes[ni].content; sNote.updateParagraph(notePara); }
          }
        }

        // Update checklists
        var msgCl = msg.checklists || [];
        for (var cli = 0; cli < msgCl.length; cli++) {
          var clPara = findParagraph(sNote, msgCl[cli].lineIndex);
          if (clPara) {
            clPara.type = msgCl[cli].status === 'done' ? 'checklistDone' : 'checklist';
            sNote.updateParagraph(clPara);
          }
        }

        // Move task if requested
        if (msg.moveToFilename && msg.moveToFilename !== msg.filename) {
          var targetNote = findNoteByFilename(msg.moveToFilename);
          if (targetNote) {
            targetNote.appendParagraph(newContent, (sPara.type === 'checklist' || sPara.type === 'checklistDone') ? 'checklist' : 'open');
            // Move children
            var srcParas = sNote.paragraphs;
            var childIndices = [];
            for (var cmi = msg.lineIndex + 1; cmi < srcParas.length; cmi++) {
              if ((srcParas[cmi].indentLevel || 0) <= (sPara.indentLevel || 0)) break;
              childIndices.push(cmi);
              targetNote.appendParagraph(srcParas[cmi].content, srcParas[cmi].type);
            }
            // Remove from source (reverse order)
            for (var ri = childIndices.length - 1; ri >= 0; ri--) {
              sNote.removeParagraphAtIndex(childIndices[ri]);
            }
            sNote.removeParagraphAtIndex(msg.lineIndex);
          }
        }

        await sendToHTMLWindow('TASK_SAVED', { id: msg.filename + ':' + msg.lineIndex });
        break;
      }

      case 'createTask': {
        var ctFilename = msg.filename;
        var ctNote = findNoteByFilename(ctFilename);
        if (!ctNote) {
          var dm = ctFilename.replace(/\.(md|txt)$/, '').match(/^(\d{4})(\d{2})(\d{2})$/);
          if (dm) {
            try { ctNote = DataStore.calendarNoteByDateString(dm[1] + '-' + dm[2] + '-' + dm[3]); } catch (e) {}
          }
        }
        if (!ctNote) break;
        var ctContent = msg.content || '';
        if (msg.scheduledDate) ctContent += ' >' + msg.scheduledDate;
        var ctTags = msg.tags || [];
        for (var cti = 0; cti < ctTags.length; cti++) ctContent += ' ' + ctTags[cti];
        ctNote.appendParagraph(ctContent, 'open');
        await sendToHTMLWindow('TASK_CREATED', { filename: ctFilename });
        break;
      }

      case 'requestNoteContent': {
        var rcNote = findNoteByFilename(msg.filename);
        if (!rcNote) break;
        var rcParas = rcNote.paragraphs;
        var rcResult = [];
        for (var rci = 0; rci < rcParas.length; rci++) {
          var rp = rcParas[rci];
          rcResult.push({
            type: rp.type, content: rp.content || '', lineIndex: rp.lineIndex,
            indentLevel: rp.indentLevel || 0, headingLevel: rp.headingLevel || 0,
            rawContent: rp.rawContent || '',
          });
        }
        var rcFm = parseFrontmatter(rcNote.content || '');
        await sendToHTMLWindow('NOTE_CONTENT', {
          filename: msg.filename, title: rcNote.title || '',
          paragraphs: rcResult, frontmatter: rcFm.frontmatter,
        });
        break;
      }

      default:
        console.log('Clarity: unknown action: ' + actionType);
    }
  } catch (err) {
    console.log('Clarity onMessageFromHTMLView error: ' + String(err));
  }
}

async function handleReady() {
  var config = getSettings();
  await CommandBar.onAsyncThread();
  var tasks = gatherAllTasks();
  var tree = getFolderTree();
  await CommandBar.onMainThread();
  await sendToHTMLWindow('INIT_DATA', {
    tasks: tasks,
    folders: tree.folders,
    notes: tree.notes,
    lastView: config.lastView,
    today: getTodayStr(),
    currentWeek: getCurrentWeekStr(),
  });
}

// ─── Date Utilities ────────────────────────────────────────
function getTodayStr() {
  var d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getCurrentWeekStr() {
  var d = new Date();
  var jan1 = new Date(d.getFullYear(), 0, 1);
  var dayOfYear = Math.floor((d - jan1) / 86400000) + 1;
  var weekNum = Math.ceil((dayOfYear + jan1.getDay()) / 7);
  return d.getFullYear() + '-W' + String(weekNum).padStart(2, '0');
}

function getCalendarNoteInfo(note) {
  var filename = (note.filename || '').replace(/\.(md|txt)$/, '');
  var dailyMatch = filename.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dailyMatch) {
    return { isCalendar: true, calendarType: 'day', date: dailyMatch[1] + '-' + dailyMatch[2] + '-' + dailyMatch[3] };
  }
  var weeklyMatch = filename.match(/^(\d{4}-W\d{2})$/);
  if (weeklyMatch) {
    return { isCalendar: true, calendarType: 'week', week: weeklyMatch[1] };
  }
  return { isCalendar: false };
}

// ─── Frontmatter ───────────────────────────────────────────
function parseFrontmatter(content) {
  if (!content) return { frontmatter: {}, body: content || '' };
  var lines = content.split('\n');
  if (lines[0].trim() !== '---') return { frontmatter: {}, body: content };
  var endIdx = -1;
  for (var i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') { endIdx = i; break; }
  }
  if (endIdx < 0) return { frontmatter: {}, body: content };
  var fm = {};
  for (var j = 1; j < endIdx; j++) {
    var line = lines[j];
    var colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    var key = line.substring(0, colonIdx).trim();
    var val = line.substring(colonIdx + 1).trim();
    if ((val.startsWith("'") && val.endsWith("'")) || (val.startsWith('"') && val.endsWith('"'))) {
      val = val.substring(1, val.length - 1);
    }
    fm[key] = val;
  }
  return { frontmatter: fm, body: lines.slice(endIdx + 1).join('\n') };
}

// ─── Task Content Parsing ──────────────────────────────────
function parseTaskContent(content) {
  var result = { priority: 0, scheduledDate: null, scheduledWeek: null, tags: [], mentions: [], blockId: null, cleanContent: '' };
  var c = content || '';

  // Block ID: ^abc123
  var blockMatch = c.match(/\^([\da-zA-Z]{4,})/);
  if (blockMatch) result.blockId = blockMatch[1];

  if (c.startsWith('!!! ')) { result.priority = 3; c = c.substring(4); }
  else if (c.startsWith('!! ')) { result.priority = 2; c = c.substring(3); }
  else if (c.startsWith('! ')) { result.priority = 1; c = c.substring(2); }

  var dateMatch = c.match(/\s*>(\d{4}-\d{2}-\d{2})/);
  if (dateMatch) result.scheduledDate = dateMatch[1];

  var weekMatch = c.match(/\s*>(\d{4}-W\d{2})/);
  if (weekMatch) result.scheduledWeek = weekMatch[1];

  var tagMatches = c.match(/#[\w\-\/]+/g);
  if (tagMatches) result.tags = tagMatches;

  var mentionMatches = c.match(/@[\w\-]+(?:\([^)]*\))?/g);
  if (mentionMatches) {
    for (var mi = 0; mi < mentionMatches.length; mi++) {
      var m = mentionMatches[mi];
      if (!m.startsWith('@done') && !m.startsWith('@due') && !m.startsWith('@repeat')) {
        result.mentions.push(m.replace(/\([^)]*\)$/, ''));
      }
    }
  }

  var clean = c;
  clean = clean.replace(/\s*>(\d{4}-\d{2}-\d{2})(\s+\d{1,2}:\d{2}\s*(AM|PM)(\s*-\s*\d{1,2}:\d{2}\s*(AM|PM))?)?/gi, '');
  clean = clean.replace(/\s*>\d{4}-W\d{2}/g, '');
  clean = clean.replace(/\s*>today/g, '');
  clean = clean.replace(/\s*@done\([^)]*\)/g, '');
  clean = clean.replace(/\s*@repeat\([^)]*\)/g, '');
  result.cleanContent = clean.trim();

  return result;
}

// ─── Task Gathering ────────────────────────────────────────
function gatherAllTasks() {
  var config = getSettings();
  var today = getTodayStr();
  var tasks = [];
  var excludedPrefixes = ['@Archive', '@Trash', '@Templates', '@Meta'];
  var excludedExact = ['Meetings'];
  for (var ei = 0; ei < config.excludedFolders.length; ei++) {
    if (config.excludedFolders[ei]) excludedExact.push(config.excludedFolders[ei]);
  }

  var calNotes = DataStore.calendarNotes;
  var lookbackDate = new Date();
  lookbackDate.setDate(lookbackDate.getDate() - config.inboxLookbackDays);
  var lookbackStr = lookbackDate.getFullYear() + '-' + String(lookbackDate.getMonth() + 1).padStart(2, '0') + '-' + String(lookbackDate.getDate()).padStart(2, '0');

  for (var ci = 0; ci < calNotes.length; ci++) {
    var calNote = calNotes[ci];
    var calInfo = getCalendarNoteInfo(calNote);
    if (!calInfo.isCalendar || calInfo.calendarType !== 'day') continue;
    if (calInfo.date < lookbackStr || calInfo.date > today) continue;
    extractTasksFromNote(calNote, tasks, 'calendar', calInfo.date);
  }

  var projNotes = DataStore.projectNotes;
  for (var pi = 0; pi < projNotes.length; pi++) {
    var note = projNotes[pi];
    var folder = (note.filename || '').split('/')[0];
    var excluded = false;
    for (var epi = 0; epi < excludedPrefixes.length; epi++) {
      if (folder.indexOf(excludedPrefixes[epi]) === 0) { excluded = true; break; }
    }
    if (!excluded) {
      for (var exi = 0; exi < excludedExact.length; exi++) {
        if (folder === excludedExact[exi]) { excluded = true; break; }
      }
    }
    if (excluded) continue;
    extractTasksFromNote(note, tasks, 'note', null);
  }

  return tasks;
}

function extractTasksFromNote(note, tasks, sourceType, sourceDate) {
  var paras = note.paragraphs;
  if (!paras || paras.length === 0) return;

  var filename = note.filename || '';
  var noteTitle = note.title || filename.replace(/\.md$/, '').split('/').pop();
  var folderPath = filename.replace(/\/[^/]+$/, '') || '';
  var folderName = folderPath.split('/').pop() || '';

  for (var i = 0; i < paras.length; i++) {
    var p = paras[i];
    var pType = p.type;
    var isTask = (pType === 'open' || pType === 'done' || pType === 'cancelled');
    var isChecklist = (pType === 'checklist' || pType === 'checklistDone' || pType === 'checklistCancelled');
    if (!isTask && !isChecklist) continue;
    if ((p.indentLevel || 0) > 0) continue;

    var status = 'open';
    if (pType === 'done' || pType === 'checklistDone') status = 'done';
    else if (pType === 'cancelled' || pType === 'checklistCancelled') status = 'cancelled';

    var rawLine = (p.rawContent || '').trimStart();
    var isDelegated = rawLine.startsWith('+');
    var parsed = parseTaskContent(p.content || '');

    var children = [];
    for (var ci = i + 1; ci < paras.length; ci++) {
      var cp = paras[ci];
      if ((cp.indentLevel || 0) <= (p.indentLevel || 0)) break;
      var cpType = cp.type;
      if (cpType === 'open' || cpType === 'done' || cpType === 'cancelled') {
        var cpParsed = parseTaskContent(cp.content || '');
        var cpStatus = cpType === 'done' ? 'done' : cpType === 'cancelled' ? 'cancelled' : 'open';
        children.push({
          type: 'task', content: cpParsed.cleanContent, rawContent: cp.content,
          status: cpStatus, lineIndex: cp.lineIndex, id: filename + ':' + cp.lineIndex,
          priority: cpParsed.priority, scheduledDate: cpParsed.scheduledDate,
          scheduledWeek: cpParsed.scheduledWeek, tags: cpParsed.tags, mentions: cpParsed.mentions,
        });
      } else if (cpType === 'checklist' || cpType === 'checklistDone' || cpType === 'checklistCancelled') {
        var clStatus = cpType === 'checklistDone' ? 'done' : cpType === 'checklistCancelled' ? 'cancelled' : 'open';
        children.push({ type: 'checklist', content: cp.content || '', status: clStatus, lineIndex: cp.lineIndex });
      } else {
        children.push({ type: 'note', content: cp.content || '', lineIndex: cp.lineIndex });
      }
    }

    tasks.push({
      id: filename + ':' + p.lineIndex,
      content: parsed.cleanContent,
      rawContent: p.content || '',
      type: isChecklist ? 'checklist' : 'task',
      status: status,
      priority: parsed.priority,
      scheduledDate: parsed.scheduledDate,
      scheduledWeek: parsed.scheduledWeek,
      tags: parsed.tags,
      mentions: parsed.mentions,
      blockId: parsed.blockId,
      isDelegated: isDelegated,
      noteFilename: filename,
      noteTitle: noteTitle,
      folderPath: folderPath,
      folderName: folderName,
      lineIndex: p.lineIndex,
      indentLevel: p.indentLevel || 0,
      children: children,
      sourceType: sourceType,
      sourceDate: sourceDate,
    });
  }
}

// ─── Folder/Note Tree ──────────────────────────────────────
function getFolderTree() {
  var config = getSettings();
  var excludedPrefixes = ['@Archive', '@Trash', '@Templates', '@Meta'];
  var excludedExact = ['Meetings'];
  for (var ei = 0; ei < config.excludedFolders.length; ei++) {
    if (config.excludedFolders[ei]) excludedExact.push(config.excludedFolders[ei]);
  }

  var folderMap = {};
  var noteList = [];
  var projNotes = DataStore.projectNotes;

  for (var i = 0; i < projNotes.length; i++) {
    var note = projNotes[i];
    var filename = note.filename || '';
    var parts = filename.split('/');
    if (parts.length < 2) continue;

    var topFolder = parts[0];
    var excluded = false;
    for (var epi = 0; epi < excludedPrefixes.length; epi++) {
      if (topFolder.indexOf(excludedPrefixes[epi]) === 0) { excluded = true; break; }
    }
    if (!excluded) {
      for (var exi = 0; exi < excludedExact.length; exi++) {
        if (topFolder === excludedExact[exi]) { excluded = true; break; }
      }
    }
    if (excluded) continue;

    var content = note.content || '';
    var fm = {};
    if (content.indexOf('---') === 0) {
      fm = parseFrontmatter(content).frontmatter;
    }
    var hasProjectOrAreaType = (fm.type === 'project' || fm.type === 'area');
    var bgColorDark = fm['bg-color-dark'] || '#3B82F6';

    var paras = note.paragraphs;
    var taskCount = 0;
    var doneCount = 0;
    for (var pi = 0; pi < paras.length; pi++) {
      var pt = paras[pi].type;
      if (pt === 'open' || pt === 'done' || pt === 'cancelled') {
        taskCount++;
        if (pt === 'done') doneCount++;
      }
    }

    if (taskCount === 0 && !hasProjectOrAreaType) continue;

    var folderPath = filename.replace(/\/[^/]+$/, '');
    var folderName = folderPath.split('/').pop() || folderPath;
    var topGrouping = parts[0] || '';

    if (!folderMap[folderPath]) {
      folderMap[folderPath] = { path: folderPath, name: folderName, parentFolder: topGrouping, notes: [] };
    }

    var noteMeta = {
      filename: filename,
      title: note.title || filename.replace(/\.md$/, '').split('/').pop(),
      folderPath: folderPath,
      taskCount: taskCount,
      doneCount: doneCount,
      hasProjectOrAreaType: hasProjectOrAreaType,
      bgColorDark: bgColorDark,
    };
    folderMap[folderPath].notes.push(noteMeta);
    noteList.push(noteMeta);
  }

  var folders = [];
  var folderKeys = Object.keys(folderMap).sort();
  for (var fi = 0; fi < folderKeys.length; fi++) {
    folders.push(folderMap[folderKeys[fi]]);
  }
  return { folders: folders, notes: noteList };
}

// ─── Note Finder ───────────────────────────────────────────
function findNoteByFilename(filename) {
  var note = DataStore.projectNoteByFilename(filename);
  if (note) return note;
  var calNotes = DataStore.calendarNotes;
  for (var i = 0; i < calNotes.length; i++) {
    if (calNotes[i].filename === filename) return calNotes[i];
  }
  var dailyMatch = filename.replace(/\.(md|txt)$/, '').match(/^(\d{4})(\d{2})(\d{2})$/);
  if (dailyMatch) {
    var dateStr = dailyMatch[1] + '-' + dailyMatch[2] + '-' + dailyMatch[3];
    try { return DataStore.calendarNoteByDateString(dateStr); } catch (e) {}
  }
  return null;
}

function findParagraph(note, lineIndex) {
  var paras = note.paragraphs;
  for (var i = 0; i < paras.length; i++) {
    if (paras[i].lineIndex === lineIndex) return paras[i];
  }
  return null;
}
