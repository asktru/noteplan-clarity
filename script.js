/* global DataStore, Editor, HTMLView, CommandBar, NotePlan */

var PLUGIN_ID = 'asktru.Clarity';
var WINDOW_ID = 'asktru.Clarity.dashboard';
var WINDOW_ID_FLOATING = 'asktru.Clarity.dashboardWindow';

// ─── Settings ──────────────────────────────────────────────
function getSettings() {
  var s = DataStore.settings || {};
  return {
    inboxLookbackDays: s.inboxLookbackDays || 14,
    upcomingLookaheadDays: s.upcomingLookaheadDays || 30,
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

// Tailwind-500 color palette — used by Memo AI and similar tools that write
// class-style names like "purple-950" into bg-color-dark frontmatter.
var TAILWIND_COLORS = {
  slate: '#64748B', gray: '#6B7280', zinc: '#71717A', neutral: '#737373', stone: '#78716C',
  red: '#EF4444', orange: '#F97316', amber: '#F59E0B', yellow: '#EAB308',
  lime: '#84CC16', green: '#22C55E', emerald: '#10B981', teal: '#14B8A6',
  cyan: '#06B6D4', sky: '#0EA5E9', blue: '#3B82F6', indigo: '#6366F1',
  violet: '#8B5CF6', purple: '#A855F7', fuchsia: '#D946EF', pink: '#EC4899', rose: '#F43F5E',
};

// Normalize any of the color formats we see in the wild into a browser-valid
// CSS color string. Falls back to the default blue for anything unrecognized.
function normalizeColor(value, fallback) {
  var dflt = fallback || '#3B82F6';
  if (!value || typeof value !== 'string') return dflt;
  var v = value.trim();
  if (!v) return dflt;
  if (v.charAt(0) === '#') {
    var converted = npColor(v);
    if (converted) return converted;
    return dflt;
  }
  // Tailwind-style: "purple-950", "blue-500", or bare "purple"
  var m = v.toLowerCase().match(/^([a-z]+)(?:-\d+)?$/);
  if (m && TAILWIND_COLORS[m[1]]) return TAILWIND_COLORS[m[1]];
  return dflt;
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
function buildFullHTML(windowID) {
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
    '  <button class="cl-sidebar-toggle" id="cl-sidebar-toggle" aria-label="Toggle Clarity sidebar">\u2190</button>\n' +
    '  <div class="cl-sidebar-overlay" id="cl-sidebar-overlay"></div>\n' +
    '  <div id="cl-root"><div id="cl-sidebar"></div><div id="cl-resizer"></div><div id="cl-main"></div><div id="cl-right-sidebar" hidden></div></div>\n' +
    '  <script>var receivingPluginID = \'' + PLUGIN_ID + '\'; var npWindowID = \'' + (windowID || WINDOW_ID) + '\';<\/script>\n' +
    '  <script type="text/javascript" src="clarityEvents.js"><\/script>\n' +
    '  <script type="text/javascript" src="../np.Shared/pluginToHTMLCommsBridge.js"><\/script>\n' +
    '</body>\n</html>';
}

// ─── Entry Point ───────────────────────────────────────────
async function showClarity(targetWindowID) {
  try {
    CommandBar.showLoading(true, 'Loading Clarity...');
    await CommandBar.onAsyncThread();

    var winID = targetWindowID || WINDOW_ID;
    var isFloating = winID === WINDOW_ID_FLOATING;

    var fullHTML = buildFullHTML(winID);

    await CommandBar.onMainThread();
    CommandBar.showLoading(false);

    var winOptions = {
      customId: winID,
      savedFilename: isFloating ? '../../asktru.Clarity/clarity_window.html' : '../../asktru.Clarity/clarity.html',
      shouldFocus: true,
      reuseUsersWindowRect: true,
      headerBGColor: 'transparent',
      autoTopPadding: true,
      showReloadButton: true,
      reloadPluginID: PLUGIN_ID,
      reloadCommandName: isFloating ? 'Open in separate window' : 'Open in sidebar',
      icon: 'fa-crystal-ball',
      iconColor: '#3B82F6',
    };

    if (isFloating) {
      winOptions.width = 1100;
      winOptions.height = 800;
      await HTMLView.showWindowWithOptions(fullHTML, 'Clarity', winOptions);
    } else {
      var result = await HTMLView.showInMainWindow(fullHTML, 'Clarity', winOptions);
      if (!result || !result.success) {
        await HTMLView.showWindowWithOptions(fullHTML, 'Clarity', winOptions);
      }
    }
  } catch (err) {
    CommandBar.showLoading(false);
    console.log('Clarity error: ' + String(err));
  }
}

// Open the same dashboard in a separate (floating) window, distinct from the
// sidebar embed so the two views stay independently routed.
async function showClarityWindow() {
  await showClarity(WINDOW_ID_FLOATING);
}

// ─── Show Current Note in Clarity ──────────────────────────
// Plugin command: jump from the editor to Clarity's note view for the
// currently open note. If Clarity isn't running yet, settings are pre-seeded
// so the cold-open lands directly on the note. If Clarity is already running,
// the SHOW_NOTE message takes care of navigation.
async function showCurrentNoteInClarity() {
  try {
    var note = Editor && Editor.note;
    var filename = note && note.filename;
    if (!filename) {
      await CommandBar.prompt('Show in Clarity', 'No note is currently open in the editor.');
      return;
    }
    // Pre-seed settings so a cold open of Clarity lands on this note.
    saveSetting('lastView', 'note');
    saveSetting('lastNoteFilename', filename);
    // Open (or focus) the Clarity window.
    await showClarity();
    // If Clarity was already open, INIT_DATA won't re-fire, so push a
    // navigation message. Safe to send even on a cold open (it just becomes
    // a no-op redundant nudge after INIT_DATA has already navigated).
    await sendToHTMLWindow(WINDOW_ID, 'SHOW_NOTE', { filename: filename });
  } catch (err) {
    console.log('showCurrentNoteInClarity error: ' + String(err));
  }
}

// ─── Open Current Note in Clarity (separate window) ────────
// Same as showCurrentNoteInClarity but targets the floating window. Does NOT
// write note frontmatter — only pre-seeds settings and sends SHOW_NOTE.
async function openCurrentNoteInClarityWindow() {
  try {
    var note = Editor && Editor.note;
    var filename = note && note.filename;
    if (!filename) {
      await CommandBar.prompt('Open current note in separate window', 'No note is currently open in the editor.');
      return;
    }
    // Pre-seed settings so a cold open of Clarity lands on this note.
    saveSetting('lastView', 'note');
    saveSetting('lastNoteFilename', filename);
    // Open (or focus) the floating Clarity window.
    await showClarityWindow();
    // Push navigation to the floating window (no-op redundant nudge on a cold open).
    await sendToHTMLWindow(WINDOW_ID_FLOATING, 'SHOW_NOTE', { filename: filename });
  } catch (err) {
    console.log('openCurrentNoteInClarityWindow error: ' + String(err));
  }
}

// ─── Send to HTML ──────────────────────────────────────────
async function sendToHTMLWindow(windowId, type, data) {
  try {
    if (typeof HTMLView === 'undefined' || typeof HTMLView.runJavaScript !== 'function') return;
    var payload = {};
    var keys = Object.keys(data);
    for (var k = 0; k < keys.length; k++) payload[keys[k]] = data[keys[k]];
    payload.NPWindowID = windowId;
    var stringifiedPayload = JSON.stringify(payload);
    var doubleStringified = JSON.stringify(stringifiedPayload);
    var jsCode = '(function(){try{var pd=' + doubleStringified + ';var p=JSON.parse(pd);window.postMessage({type:"' + type + '",payload:p},"*");}catch(e){console.error("sendToHTMLWindow error:",e);}})();';
    await HTMLView.runJavaScript(jsCode, windowId);
  } catch (err) {
    console.log('sendToHTMLWindow error: ' + String(err));
  }
}

// ─── Message Handler ───────────────────────────────────────
async function onMessageFromHTMLView(actionType, data) {
  try {
    var msg = typeof data === 'string' ? JSON.parse(data) : data;
    var replyWindowID = (msg && msg._windowID) || WINDOW_ID;
    switch (actionType) {
      case 'ready':
        await handleReady(replyWindowID);
        break;
      case 'saveView':
        saveSetting('lastView', msg.view || 'inbox');
        if (msg.noteFilename) saveSetting('lastNoteFilename', msg.noteFilename);
        break;
      case 'saveCollapsedAreas':
        saveSetting('collapsedAreas', msg.collapsedAreas || '{}');
        break;
      case 'saveHideEmptyProjects':
        saveSetting('hideEmptyProjects', !!msg.hideEmptyProjects);
        break;
      case 'saveHideNonProjects':
        saveSetting('hideNonProjects', !!msg.hideNonProjects);
        break;
      case 'saveHidePaused':
        saveSetting('hidePaused', !!msg.hidePaused);
        break;
      case 'saveRecentNotes':
        saveSetting('recentNotes', msg.recentNotes || '[]');
        break;
      case 'saveSidebarWidth': {
        var w = parseInt(msg.width, 10);
        if (!isNaN(w) && w >= 140 && w <= 500) saveSetting('sidebarWidth', w);
        break;
      }
      case 'saveVisibleViews':
        saveSetting('visibleViews', msg.visibleViews || '{}');
        break;
      case 'saveViewPrefs':
        saveSetting('viewPrefs', msg.viewPrefs || '{}');
        break;
      case 'saveInboxLookback': {
        var ilb = parseInt(msg.days, 10);
        if (!isNaN(ilb) && ilb >= 1 && ilb <= 365) {
          saveSetting('inboxLookbackDays', ilb);
          await handleReady(replyWindowID);
        }
        break;
      }
      case 'saveUpcomingLookahead': {
        var ula = parseInt(msg.days, 10);
        if (!isNaN(ula) && ula >= 1 && ula <= 365) {
          saveSetting('upcomingLookaheadDays', ula);
          await handleReady(replyWindowID);
        }
        break;
      }

      case 'toggleHeadingCollapse': {
        var hNote = findNoteByFilename(msg.filename);
        if (!hNote) break;
        var hPara = findParagraph(hNote, msg.lineIndex);
        if (!hPara) break;
        var hContent = (hPara.content || '');
        // NotePlan convention: trailing "…" (U+2026) on a heading means collapsed.
        // Strip it if present (expanding), append it if not (collapsing).
        var stripped = hContent.replace(/\s*\u2026\s*$/, '');
        var nowCollapsed = !/\u2026\s*$/.test(hContent);
        hPara.content = nowCollapsed ? (stripped + ' \u2026') : stripped;
        hNote.updateParagraph(hPara);
        break;
      }

      case 'toggleHeadingFocus': {
        var fNote = findNoteByFilename(msg.filename);
        if (!fNote) break;
        var fPara = findParagraph(fNote, msg.lineIndex);
        if (!fPara) break;
        var fContent = (fPara.content || '');
        // Donote/Clarity convention: trailing 👀 (U+1F440) marks a focused heading.
        // Preserve the collapse marker (…) if present; the canonical order is
        // "👀 …" so collapse always comes last.
        var hasCollapse = /…\s*$/.test(fContent);
        var withoutMarkers = fContent
          .replace(/\s*…\s*$/, '')
          .replace(/\s*👀\s*$/, '');
        var hadFocus = /👀/.test(fContent);
        var rebuilt;
        if (hadFocus) {
          rebuilt = hasCollapse ? (withoutMarkers + ' …') : withoutMarkers;
        } else {
          rebuilt = hasCollapse
            ? (withoutMarkers + ' 👀 …')
            : (withoutMarkers + ' 👀');
        }
        fPara.content = rebuilt;
        fNote.updateParagraph(fPara);
        break;
      }

      case 'toggleTask': {
        var tNote = findNoteByFilename(msg.filename);
        if (!tNote) break;
        var tPara = findParagraph(tNote, msg.lineIndex);
        if (!tPara) break;
        var raw = (tPara.rawContent || '').trimStart();
        var isCl = raw.startsWith('+');
        var tWasOpen = (tPara.type === 'open' || tPara.type === 'checklist');
        var tHasRepeat = (tPara.content || '').indexOf('@repeat') >= 0;
        if (tWasOpen) {
          tPara.type = isCl ? 'checklistDone' : 'done';
          var now = new Date();
          var doneTag = '@done(' + now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0') + ')';
          tPara.content = (tPara.content || '').trimEnd() + ' ' + doneTag;
        } else {
          tPara.type = isCl ? 'checklist' : 'open';
          tPara.content = (tPara.content || '').replace(/\s*@done\([^)]*\)/, '');
        }
        tNote.updateParagraph(tPara);
        await sendToHTMLWindow(replyWindowID, 'TASK_TOGGLED', { id: msg.filename + ':' + msg.lineIndex });
        // Invoke Routine plugin for repeating tasks
        if (tHasRepeat && tWasOpen && (tPara.type === 'done' || tPara.type === 'checklistDone')) {
          try {
            await DataStore.invokePluginCommandByName('generate repeats', 'asktru.Routine', [msg.filename]);
          } catch (e) { console.log('Clarity: Routine not available: ' + String(e)); }
        }
        break;
      }

      case 'updateNoteFrontmatter': {
        var fmNote = findNoteByFilename(msg.filename);
        if (!fmNote) break;
        var fmUpdates = msg.updates || {};
        var newContent = applyFrontmatterUpdates(fmNote.content || '', fmUpdates);
        fmNote.content = newContent;
        var fmAfter = parseFrontmatter(newContent).frontmatter;
        await sendToHTMLWindow(replyWindowID, 'NOTE_FRONTMATTER_UPDATED', {
          filename: msg.filename,
          frontmatter: fmAfter,
          bgColorDark: normalizeColor(fmAfter['bg-color-dark']),
        });
        break;
      }

      case 'deleteTask': {
        var dNote = findNoteByFilename(msg.filename);
        if (!dNote) break;
        var dPara = findParagraph(dNote, msg.lineIndex);
        if (!dPara) break;
        var dParas = dNote.paragraphs;
        var dIndent = dPara.indentLevel || 0;
        var dIndices = [msg.lineIndex];
        for (var dci = msg.lineIndex + 1; dci < dParas.length; dci++) {
          if ((dParas[dci].indentLevel || 0) <= dIndent) break;
          dIndices.push(dci);
        }
        for (var ddi = dIndices.length - 1; ddi >= 0; ddi--) {
          dNote.removeParagraphAtIndex(dIndices[ddi]);
        }
        await sendToHTMLWindow(replyWindowID, 'TASK_DELETED', { id: msg.filename + ':' + msg.lineIndex });
        break;
      }

      case 'rescheduleTask': {
        var rNote = findNoteByFilename(msg.filename);
        if (!rNote) break;
        var rPara = findParagraph(rNote, msg.lineIndex);
        if (!rPara) break;
        // Strip any existing >YYYY-MM-DD or >YYYY-Www schedule token, then append the new one.
        var rContent = (rPara.content || '').replace(/\s*>\d{4}-(W\d{2}|\d{2}-\d{2})\b/g, '');
        if (msg.scheduledDate) rContent = rContent.trimEnd() + ' >' + msg.scheduledDate;
        else if (msg.scheduledWeek) rContent = rContent.trimEnd() + ' >' + msg.scheduledWeek;
        rPara.content = rContent;
        rNote.updateParagraph(rPara);
        await sendToHTMLWindow(replyWindowID, 'TASK_RESCHEDULED', {
          id: msg.filename + ':' + msg.lineIndex,
          scheduledDate: msg.scheduledDate || null,
          scheduledWeek: msg.scheduledWeek || null,
        });
        break;
      }

      case 'setTaskTag': {
        var stNote = findNoteByFilename(msg.filename);
        if (!stNote) break;
        var stPara = findParagraph(stNote, msg.lineIndex);
        if (!stPara) break;
        var rawTag = (msg.tag || '').trim();
        if (!rawTag) break;
        if (rawTag.charAt(0) !== '#') rawTag = '#' + rawTag;
        var stEscaped = rawTag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        // Match the tag as a whole word (preceded by start/space, followed by end/space).
        var stPattern = '(^|\\s)' + stEscaped + '(?=\\s|$)';
        var stContent = stPara.content || '';
        if (msg.add) {
          if (!new RegExp(stPattern).test(stContent)) {
            stContent = stContent.trimEnd() + ' ' + rawTag;
          }
        } else {
          stContent = stContent.replace(new RegExp(stPattern, 'g'), '').replace(/\s{2,}/g, ' ').trim();
        }
        stPara.content = stContent;
        stNote.updateParagraph(stPara);
        await sendToHTMLWindow(replyWindowID, 'TASK_TAG_UPDATED', {
          id: msg.filename + ':' + msg.lineIndex,
          tag: rawTag,
          added: !!msg.add,
        });
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

        // Preserve system mentions the editor strips out (@repeat, @done, @due)
        // so they round-trip through edits unchanged.
        var preservedRe = /@(?:repeat|done|due)\([^)]*\)/g;
        var origContent = sPara.content || '';
        var preserved = origContent.match(preservedRe) || [];
        for (var pmi = 0; pmi < preserved.length; pmi++) {
          if (newContent.indexOf(preserved[pmi]) === -1) {
            newContent += ' ' + preserved[pmi];
          }
        }

        sPara.content = newContent;
        sNote.updateParagraph(sPara);

        // Update child notes
        var msgNotes = msg.notes || [];
        // Find insert position for new notes: after task + all existing children
        var insertAfter = msg.lineIndex;
        var sParas = sNote.paragraphs;
        var sIndent = sPara.indentLevel || 0;
        for (var fi = msg.lineIndex + 1; fi < sParas.length; fi++) {
          if ((sParas[fi].indentLevel || 0) <= sIndent) break;
          insertAfter = fi;
        }
        for (var ni = 0; ni < msgNotes.length; ni++) {
          if (msgNotes[ni].lineIndex >= 0) {
            var notePara = findParagraph(sNote, msgNotes[ni].lineIndex);
            if (notePara) { notePara.content = msgNotes[ni].content; sNote.updateParagraph(notePara); }
          } else if (msgNotes[ni].content.trim()) {
            // New note line — insert after the task's children
            insertAfter++;
            sNote.insertParagraph('\t' + msgNotes[ni].content, insertAfter, 'text');
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
            // Gather the task + its children as one block, then insert above any
            // ## Done section so the incomplete task isn't dropped among completed ones.
            var moveItems = [{ content: newContent, type: (sPara.type === 'checklist' || sPara.type === 'checklistDone') ? 'checklist' : 'open' }];
            var srcParas = sNote.paragraphs;
            var childIndices = [];
            for (var cmi = msg.lineIndex + 1; cmi < srcParas.length; cmi++) {
              if ((srcParas[cmi].indentLevel || 0) <= (sPara.indentLevel || 0)) break;
              childIndices.push(cmi);
              moveItems.push({ content: srcParas[cmi].content, type: srcParas[cmi].type });
            }
            insertTasksAboveDone(targetNote, moveItems);
            // Remove from source (reverse order)
            for (var ri = childIndices.length - 1; ri >= 0; ri--) {
              sNote.removeParagraphAtIndex(childIndices[ri]);
            }
            sNote.removeParagraphAtIndex(msg.lineIndex);
          }
        }

        await sendToHTMLWindow(replyWindowID, 'TASK_SAVED', { id: msg.filename + ':' + msg.lineIndex });
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
        if (msg.afterLineIndex !== undefined && msg.afterLineIndex !== null) {
          // Insert right after a specific task, preserving its indent.
          var ctIndent = '';
          var ctN = parseInt(msg.indent, 10) || 0;
          for (var ctt = 0; ctt < ctN; ctt++) ctIndent += '\t';
          ctNote.insertParagraph(ctIndent + ctContent, msg.afterLineIndex + 1, 'open');
        } else if (msg.prepend) {
          // Insert after the frontmatter block and the first H1 title, so the
          // task lands at the top of the project body rather than the bottom.
          var ctParas = ctNote.paragraphs;
          var ctLines = (ctNote.content || '').split('\n');
          var insertIdx = 0;
          if (ctLines.length > 0 && ctLines[0] === '---') {
            for (var ctFmI = 1; ctFmI < ctLines.length; ctFmI++) {
              if (ctLines[ctFmI] === '---') { insertIdx = ctFmI + 1; break; }
            }
          }
          while (insertIdx < ctParas.length && ctParas[insertIdx].type === 'empty') insertIdx++;
          if (insertIdx < ctParas.length && ctParas[insertIdx].type === 'title' && ctParas[insertIdx].headingLevel === 1) {
            insertIdx++;
            while (insertIdx < ctParas.length && ctParas[insertIdx].type === 'empty') insertIdx++;
          }
          ctNote.insertParagraph(ctContent, insertIdx, 'open');
        } else {
          insertTasksAboveDone(ctNote, [{ content: ctContent, type: 'open' }]);
        }
        await sendToHTMLWindow(replyWindowID, 'TASK_CREATED', { filename: ctFilename });
        break;
      }

      case 'insertHeading': {
        var ihNote = findNoteByFilename(msg.filename);
        if (!ihNote) break;
        var ihText = (msg.content || '').replace(/^#+\s*/, '').trim();
        if (!ihText) break;
        // Insert the literal "## text" line (a 'title'-typed insert makes NotePlan
        // prepend another '#', yielding "# ## text"). lineIndex == content line.
        var ihLines = (ihNote.content || '').split('\n');
        var ihAt;
        if (msg.afterLineIndex !== undefined && msg.afterLineIndex !== null) {
          ihAt = Math.min(msg.afterLineIndex + 1, ihLines.length);
        } else {
          // Top of body: after the frontmatter block and the first H1.
          ihAt = 0;
          if (ihLines[0] === '---') {
            for (var ihfi = 1; ihfi < ihLines.length; ihfi++) { if (ihLines[ihfi] === '---') { ihAt = ihfi + 1; break; } }
          }
          while (ihAt < ihLines.length && ihLines[ihAt].trim() === '') ihAt++;
          if (ihAt < ihLines.length && /^#\s/.test(ihLines[ihAt])) {
            ihAt++;
            while (ihAt < ihLines.length && ihLines[ihAt].trim() === '') ihAt++;
          }
        }
        ihLines.splice(ihAt, 0, '## ' + ihText);
        ihNote.content = ihLines.join('\n');
        await sendToHTMLWindow(replyWindowID, 'TASK_CREATED', { filename: msg.filename });
        break;
      }

      case 'createProjectNote': {
        var cpnFrom = msg.filename || '';
        var cpnFolder = cpnFrom.indexOf('/') >= 0 ? cpnFrom.replace(/\/[^/]+$/, '') : '';
        var cpnTitle = await CommandBar.showInput('New project', "Create '%@'");
        if (!cpnTitle || !String(cpnTitle).trim()) break;
        cpnTitle = String(cpnTitle).trim();
        var cpnContent = '---\ntype: project\n---\n# ' + cpnTitle + '\n';
        var cpnNew = null;
        try { cpnNew = DataStore.newNoteWithContent(cpnContent, cpnFolder); } catch (e) { console.log('Clarity: newNoteWithContent failed: ' + String(e)); }
        if (cpnNew) {
          saveSetting('lastView', 'note');
          saveSetting('lastNoteFilename', cpnNew);
          await sendToHTMLWindow(replyWindowID, 'SHOW_NOTE', { filename: cpnNew });
        }
        break;
      }

      case 'reorderTask': {
        var rtNote = findNoteByFilename(msg.filename);
        if (!rtNote) break;

        var srcIdx = msg.sourceLineIndex;
        var childCnt = msg.childCount || 0;
        var tgtIdx = msg.targetLineIndex;
        var blockSize = childCnt + 1;

        // Raw content manipulation to preserve indentation perfectly
        var lines = rtNote.content.split('\n');
        if (srcIdx < 0 || srcIdx + blockSize > lines.length) break;

        // Extract the source block lines
        var srcLines = lines.splice(srcIdx, blockSize);

        // Adjust target index after removal
        var adjustedTarget = tgtIdx;
        if (srcIdx < tgtIdx) {
          adjustedTarget = tgtIdx - blockSize;
        }

        // Clamp to valid range
        if (adjustedTarget < 0) adjustedTarget = 0;
        if (adjustedTarget > lines.length) adjustedTarget = lines.length;

        // Re-insert source block at target position
        for (var ins = 0; ins < srcLines.length; ins++) {
          lines.splice(adjustedTarget + ins, 0, srcLines[ins]);
        }

        rtNote.content = lines.join('\n');

        await sendToHTMLWindow(replyWindowID, 'TASK_REORDERED', { success: true });
        break;
      }

      case 'requestNoteContent': {
        var rcNote = findNoteByFilename(msg.filename);
        if (!rcNote) break;
        var rcParas = rcNote.paragraphs;
        var rcResult = [];
        for (var rci = 0; rci < rcParas.length; rci++) {
          var rp = rcParas[rci];
          // Compute indent: prefer API indentLevel, fallback to counting leading tabs
          var rcIndent = rp.indentLevel || 0;
          if (rcIndent === 0 && rp.rawContent) {
            var tabMatch = rp.rawContent.match(/^\t+/);
            if (tabMatch) rcIndent = tabMatch[0].length;
          }
          rcResult.push({
            type: rp.type, content: rp.content || '', lineIndex: rp.lineIndex,
            indentLevel: rcIndent, headingLevel: rp.headingLevel || 0,
            rawContent: rp.rawContent || '',
          });
        }
        var rcFm = parseFrontmatter(rcNote.content || '');
        await sendToHTMLWindow(replyWindowID, 'NOTE_CONTENT', {
          filename: msg.filename, title: rcNote.title || '',
          paragraphs: rcResult, frontmatter: rcFm.frontmatter,
          bgColorDark: normalizeColor(rcFm.frontmatter['bg-color-dark']),
        });
        break;
      }

      case 'refreshProject': {
        var rpFilename = msg.filename;
        if (!rpFilename) break;
        await CommandBar.onAsyncThread();
        var rpNote = findNoteByFilename(rpFilename);
        if (!rpNote) {
          await CommandBar.onMainThread();
          await sendToHTMLWindow(replyWindowID, 'PROJECT_REFRESHED', { filename: rpFilename, missing: true });
          break;
        }
        var rpTasks = [];
        var rpFm = parseFrontmatter(rpNote.content || '').frontmatter;
        var rpIsCalendar = getCalendarNoteInfo(rpNote);
        var rpSourceType = rpIsCalendar.isCalendar ? 'calendar' : 'note';
        var rpSourceDate = rpIsCalendar.isCalendar ? rpIsCalendar.date : null;
        extractTasksFromNote(rpNote, rpTasks, rpSourceType, rpSourceDate);

        var rpParas = rpNote.paragraphs;
        var rpTaskCount = 0, rpDoneCount = 0, rpOpenCount = 0;
        for (var rpi = 0; rpi < rpParas.length; rpi++) {
          var rpt = rpParas[rpi].type;
          if (rpt === 'open' || rpt === 'done' || rpt === 'cancelled') {
            rpTaskCount++;
            if (rpt === 'done') rpDoneCount++;
            else if (rpt === 'open') rpOpenCount++;
          }
        }

        await CommandBar.onMainThread();
        await sendToHTMLWindow(replyWindowID, 'PROJECT_REFRESHED', {
          filename: rpFilename,
          tasks: rpTasks,
          noteMeta: {
            filename: rpFilename,
            title: rpNote.title || rpFilename.replace(/\.md$/, '').split('/').pop(),
            taskCount: rpTaskCount,
            doneCount: rpDoneCount,
            openCount: rpOpenCount,
            bgColorDark: normalizeColor(rpFm['bg-color-dark']),
            hasProjectOrAreaType: (detectNoteType(rpFm) !== ''),
            noteType: detectNoteType(rpFm),
            due: rpFm.due || null,
            status: (rpFm.status === 'working' || rpFm.status === 'paused' || rpFm.status === 'someday' || rpFm.status === 'completed' || rpFm.status === 'canceled') ? rpFm.status : null,
            reviewedDate: rpFm.reviewed || null,
            reviewInterval: rpFm.review || null,
            reviewDueDays: computeReviewDueDays(rpFm.reviewed, rpFm.review, getTodayStr()),
          },
        });
        break;
      }

      case 'archiveProject': {
        var aFn = msg.filename;
        if (!aFn) break;
        var aNote = findNoteByFilename(aFn);
        if (!aNote) {
          await sendToHTMLWindow(replyWindowID, 'PROJECT_ARCHIVED', { oldFilename: aFn, success: false, error: 'Note not found' });
          break;
        }
        var origFolder = aFn.replace(/\/[^/]+$/, '');
        if (origFolder === aFn) origFolder = '';
        var todayStr = getTodayStr();
        var targetFolder = '@Archive/' + todayStr + (origFolder ? '/' + origFolder : '');
        var newFn = null;
        try {
          newFn = DataStore.moveNote(aFn, targetFolder);
        } catch (e) {
          console.log('Clarity: archiveProject moveNote threw: ' + String(e));
        }
        if (newFn) {
          await sendToHTMLWindow(replyWindowID, 'PROJECT_ARCHIVED', { oldFilename: aFn, newFilename: newFn, success: true });
        } else {
          await sendToHTMLWindow(replyWindowID, 'PROJECT_ARCHIVED', { oldFilename: aFn, success: false, error: 'moveNote failed' });
        }
        break;
      }

      case 'openNoteInEditor': {
        if (msg.filename) {
          await CommandBar.onMainThread();
          var oeNote = findNoteByFilename(msg.filename);
          var oeTitle = oeNote ? (oeNote.title || '') : '';
          if (oeTitle) {
            NotePlan.openURL('noteplan://x-callback-url/openNote?noteTitle=' + encodeURIComponent(oeTitle) + '&splitView=yes&reuseSplitView=yes');
          } else {
            Editor.openNoteByFilename(msg.filename);
          }
        }
        break;
      }

      default:
        console.log('Clarity: unknown action: ' + actionType);
    }
  } catch (err) {
    console.log('Clarity onMessageFromHTMLView error: ' + String(err));
  }
}

async function handleReady(replyWindowID) {
  var winID = replyWindowID || WINDOW_ID;
  var config = getSettings();
  await CommandBar.onAsyncThread();
  var tasks = gatherAllTasks();
  var tree = getFolderTree();
  await CommandBar.onMainThread();
  var s = DataStore.settings || {};
  await sendToHTMLWindow(winID, 'INIT_DATA', {
    tasks: tasks,
    folders: tree.folders,
    notes: tree.notes,
    lastView: config.lastView,
    today: getTodayStr(),
    currentWeek: getCurrentWeekStr(),
    collapsedAreas: s.collapsedAreas || '{}',
    viewPrefs: s.viewPrefs || '{}',
    lastNoteFilename: s.lastNoteFilename || null,
    hideEmptyProjects: !!s.hideEmptyProjects,
    hideNonProjects: !!s.hideNonProjects,
    hidePaused: !!s.hidePaused,
    recentNotes: s.recentNotes || '[]',
    sidebarWidth: s.sidebarWidth || null,
    visibleViews: s.visibleViews || '{}',
    inboxLookbackDays: config.inboxLookbackDays,
    upcomingLookaheadDays: config.upcomingLookaheadDays,
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

// Apply a flat object of frontmatter updates to a note's raw content.
// Values that are null/undefined/empty-string remove the key. Unknown keys are appended.
// If no frontmatter block exists yet, one is created at the top.
function applyFrontmatterUpdates(content, updates) {
  var lines = (content || '').split('\n');
  var hasFm = lines.length > 0 && lines[0].trim() === '---';
  var endIdx = -1;
  if (hasFm) {
    for (var fi = 1; fi < lines.length; fi++) {
      if (lines[fi].trim() === '---') { endIdx = fi; break; }
    }
  }
  var keys = Object.keys(updates || {});
  if (!hasFm || endIdx < 0) {
    var newFm = ['---'];
    for (var nk = 0; nk < keys.length; nk++) {
      var nv = updates[keys[nk]];
      if (nv != null && nv !== '') newFm.push(keys[nk] + ': ' + nv);
    }
    newFm.push('---');
    return newFm.concat(lines).join('\n');
  }
  var seen = {};
  for (var li = 1; li < endIdx; li++) {
    var line = lines[li];
    var colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    var k = line.substring(0, colonIdx).trim();
    if (Object.prototype.hasOwnProperty.call(updates, k)) {
      seen[k] = true;
      var v = updates[k];
      lines[li] = (v == null || v === '') ? null : (k + ': ' + v);
    }
  }
  var inserts = [];
  for (var ak = 0; ak < keys.length; ak++) {
    var key = keys[ak];
    var val = updates[key];
    if (!seen[key] && val != null && val !== '') inserts.push(key + ': ' + val);
  }
  var rebuilt = [];
  for (var ri = 0; ri < lines.length; ri++) {
    if (ri === endIdx) {
      for (var ii = 0; ii < inserts.length; ii++) rebuilt.push(inserts[ii]);
    }
    if (lines[ri] !== null) rebuilt.push(lines[ri]);
  }
  return rebuilt.join('\n');
}

// ─── Review Cadence (frontmatter) ──────────────────────────
// Mirror of asktru.WeeklyReview's interval parser so review semantics stay in
// sync. Returns days as a positive integer, or null when the cadence is
// missing/invalid (we treat "no cadence" as "review not tracked", unlike
// WeeklyReview which defaults to weekly).
function intervalToDays(interval) {
  if (!interval) return null;
  var match = String(interval).match(/^(\d+)([dwmqy])$/i);
  if (!match) return null;
  var num = parseInt(match[1], 10);
  switch (match[2].toLowerCase()) {
    case 'd': return num;
    case 'w': return num * 7;
    case 'm': return num * 30;
    case 'q': return num * 91;
    case 'y': return num * 365;
    default: return null;
  }
}

// Add a cadence interval to a YYYY-MM-DD date string. Returns null for bad input.
function addIntervalToDate(dateStr, interval) {
  if (!dateStr) return null;
  var days = intervalToDays(interval);
  if (days == null) return null;
  var d = new Date(dateStr + 'T00:00:00');
  if (isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + days);
  var y = d.getFullYear();
  var m = String(d.getMonth() + 1).padStart(2, '0');
  var dd = String(d.getDate()).padStart(2, '0');
  return y + '-' + m + '-' + dd;
}

// Days from `todayStr` to the next review date for a note.
//   null  → review not tracked (no review: cadence set, or cadence is invalid)
//   <= 0  → due (negative = overdue by that many days)
//   > 0   → due in N days
// When `reviewInterval` is set but `reviewedStr` is empty, treat as due today.
function computeReviewDueDays(reviewedStr, reviewInterval, todayStr) {
  if (!reviewInterval || !intervalToDays(reviewInterval)) return null;
  var nextStr = reviewedStr
    ? addIntervalToDate(reviewedStr, reviewInterval)
    : todayStr;
  if (!nextStr) return null;
  var next = new Date(nextStr + 'T00:00:00');
  var today = new Date(todayStr + 'T00:00:00');
  if (isNaN(next.getTime()) || isNaN(today.getTime())) return null;
  return Math.round((next.getTime() - today.getTime()) / 86400000);
}

// ─── Task Content Parsing ──────────────────────────────────
function parseTaskContent(content) {
  var result = { priority: 0, scheduledDate: null, scheduledWeek: null, tags: [], mentions: [], blockId: null, repeat: null, cleanContent: '' };
  var repeatMatch = (content || '').match(/@repeat\(([^)]*)\)/);
  if (repeatMatch) result.repeat = repeatMatch[1];
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

  var tagMatches = c.match(/#[\p{L}\p{N}_\-\/]+/gu);
  if (tagMatches) result.tags = tagMatches;

  var mentionMatches = c.match(/@[\p{L}\p{N}_\-]+(?:\([^)]*\))?/gu);
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
  function shiftDate(days) {
    var d = new Date();
    d.setDate(d.getDate() + days);
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  var lookbackStr = shiftDate(-config.inboxLookbackDays);
  var lookaheadStr = shiftDate(config.upcomingLookaheadDays);

  function fmtYMD(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  for (var ci = 0; ci < calNotes.length; ci++) {
    var calNote = calNotes[ci];
    var calInfo = getCalendarNoteInfo(calNote);
    if (!calInfo.isCalendar) continue;
    if (calInfo.calendarType === 'day') {
      // Past/today: respect inboxLookbackDays (drives Inbox).
      // Future: respect upcomingLookaheadDays (drives Upcoming's daily-note tasks).
      if (calInfo.date < lookbackStr || calInfo.date > lookaheadStr) continue;
      extractTasksFromNote(calNote, tasks, 'calendar', calInfo.date, null);
    } else if (calInfo.calendarType === 'week') {
      // Window weekly notes by their start date (calNote.date), same range as
      // daily notes. Their tasks get sourceWeek (no sourceDate) — they reach
      // Upcoming (future weeks) and Anytime (current/past weeks), never Inbox/Today.
      var wd = calNote.date;
      var wdStr = wd ? fmtYMD(wd) : null;
      if (wdStr && (wdStr < lookbackStr || wdStr > lookaheadStr)) continue;
      extractTasksFromNote(calNote, tasks, 'calendar', null, calInfo.week);
    }
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

function getParaIndent(p) {
  var indent = p.indentLevel || 0;
  if (indent === 0 && p.rawContent) {
    var tabMatch = p.rawContent.match(/^\t+/);
    if (tabMatch) indent = tabMatch[0].length;
  }
  return indent;
}

function extractTasksFromNote(note, tasks, sourceType, sourceDate, sourceWeek) {
  var paras = note.paragraphs;
  if (!paras || paras.length === 0) return;

  var filename = note.filename || '';
  var noteTitle = note.title || filename.replace(/\.md$/, '').split('/').pop();
  var folderPath = filename.indexOf('/') >= 0 ? filename.replace(/\/[^/]+$/, '') : '';
  var folderName = folderPath ? folderPath.split('/').pop() : noteTitle;

  for (var i = 0; i < paras.length; i++) {
    var p = paras[i];
    var pType = p.type;
    var isTask = (pType === 'open' || pType === 'done' || pType === 'cancelled');
    var isChecklist = (pType === 'checklist' || pType === 'checklistDone' || pType === 'checklistCancelled');
    if (!isTask && !isChecklist) continue;
    var pIndent = getParaIndent(p);
    if (pIndent > 0) continue;

    var status = 'open';
    if (pType === 'done' || pType === 'checklistDone') status = 'done';
    else if (pType === 'cancelled' || pType === 'checklistCancelled') status = 'cancelled';

    var rawLine = (p.rawContent || '').trimStart();
    var isDelegated = rawLine.startsWith('+');
    var parsed = parseTaskContent(p.content || '');

    var children = [];
    for (var ci = i + 1; ci < paras.length; ci++) {
      var cp = paras[ci];
      if (getParaIndent(cp) <= pIndent) break;
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
        children.push({ type: 'note', content: cp.content || '', rawContent: cp.rawContent || cp.content || '', lineIndex: cp.lineIndex });
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
      sourceWeek: sourceWeek || null,
      tags: parsed.tags,
      mentions: parsed.mentions,
      blockId: parsed.blockId,
      repeat: parsed.repeat,
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

// Detect project/area type from frontmatter, supporting our `type:` syntax and
// jgclark.Reviews' `project:` syntax (#project/#goal => project, #area => area).
// Our `type:` wins when both are present. Returns 'project' | 'area' | ''.
function detectNoteType(fm) {
  if (!fm) return '';
  if (fm.type === 'project' || fm.type === 'area') return fm.type;
  var pj = fm.project;
  if (pj != null && String(pj).trim() !== '') {
    return String(pj).indexOf('#area') >= 0 ? 'area' : 'project';
  }
  return '';
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
    var nt = detectNoteType(fm);
    var hasProjectOrAreaType = (nt !== '');
    var bgColorDark = normalizeColor(fm['bg-color-dark']);

    var paras = note.paragraphs;
    var taskCount = 0;
    var doneCount = 0;
    var openCount = 0;
    for (var pi = 0; pi < paras.length; pi++) {
      var pt = paras[pi].type;
      if (pt === 'open' || pt === 'done' || pt === 'cancelled') {
        taskCount++;
        if (pt === 'done') doneCount++;
        else if (pt === 'open') openCount++;
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
      openCount: openCount,
      hasProjectOrAreaType: hasProjectOrAreaType,
      noteType: nt,
      bgColorDark: bgColorDark,
      due: fm.due || null,
      status: (fm.status === 'working' || fm.status === 'paused' || fm.status === 'someday' || fm.status === 'completed' || fm.status === 'canceled') ? fm.status : null,
      reviewedDate: fm.reviewed || null,
      reviewInterval: fm.review || null,
      reviewDueDays: computeReviewDueDays(fm.reviewed, fm.review, getTodayStr()),
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

// ─── Done-section-safe insertion ───────────────────────────
// Insert task paragraph(s) above a "## Done" section (created by NotePlan's
// "Move Completed to Bottom") so incomplete tasks don't land among completed
// ones. Falls back to appending at the note bottom when there's no Done section.
// items: array of { content, type }. Returns the line index of the first item.
function insertTasksAboveDone(note, items) {
  if (!items || !items.length) return -1;
  var paras = note.paragraphs || [];
  var doneIdx = -1;
  for (var i = 0; i < paras.length; i++) {
    var p = paras[i];
    if (p.type === 'title' && p.headingLevel === 2 && (p.content || '').trim() === 'Done') { doneIdx = i; break; }
  }
  if (doneIdx < 0) {
    var startIdx = paras.length;
    for (var a = 0; a < items.length; a++) note.appendParagraph(items[a].content, items[a].type);
    return startIdx;
  }
  var firstEmpty = doneIdx;
  while (firstEmpty > 0 && paras[firstEmpty - 1].type === 'empty') firstEmpty--;
  var hadBlank = firstEmpty < doneIdx;
  var idx = firstEmpty;
  for (var b = 0; b < items.length; b++) {
    note.insertParagraph(items[b].content, idx, items[b].type);
    idx++;
  }
  if (!hadBlank) note.insertParagraph('', idx, 'empty');
  return firstEmpty;
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

// ============================================
// DEPENDENCY BOOTSTRAP
// NotePlan doesn't auto-install plugin dependencies for side-loaded plugins,
// so we install them ourselves. REQUIRED_PLUGINS is the single source of truth.
// np.Shared provides FontAwesome (icons) + pluginToHTMLCommsBridge.js (HTML↔plugin comms).
// NotePlan calls onUpdateOrInstall automatically after install/update.
// ============================================

var REQUIRED_PLUGINS = ['np.Shared'];

async function ensureSharedResources() {
  var installed = DataStore.installedPlugins() || [];
  var have = {};
  for (var i = 0; i < installed.length; i++) if (installed[i]) have[installed[i].id] = true;

  var missing = REQUIRED_PLUGINS.filter(function (id) { return !have[id]; });
  if (!missing.length) return;

  var released = (await DataStore.listPlugins(false, true, false)) || [];
  for (var m = 0; m < missing.length; m++) {
    var match = released.find(function (p) { return p && p.id === missing[m]; });
    if (match) await DataStore.installPlugin(match, false);
    else await CommandBar.prompt('Plugin dependency needed',
      'This plugin needs "' + missing[m] + '". Please install it from NotePlan’s plugin list.');
  }
}

async function onUpdateOrInstall() {
  try { await ensureSharedResources(); }
  catch (e) { console.log('Clarity onUpdateOrInstall failed: ' + (e && e.message ? e.message : String(e))); }
}

globalThis.showClarity = showClarity;
globalThis.showClarityWindow = showClarityWindow;
globalThis.showCurrentNoteInClarity = showCurrentNoteInClarity;
globalThis.openCurrentNoteInClarityWindow = openCurrentNoteInClarityWindow;
globalThis.onMessageFromHTMLView = onMessageFromHTMLView;
globalThis.onUpdateOrInstall = onUpdateOrInstall;
