(() => {
  // src/webview/state.js
  var State = {
    tasks: [],
    folders: [],
    notes: [],
    currentView: "inbox",
    currentNoteFilename: null,
    expandedTaskId: null,
    filters: { tag: null, folder: null, mention: null, text: "", noteStatus: "all" },
    grouping: "note",
    movedFromInbox: [],
    editDraft: null,
    focusedTaskIndex: -1,
    today: "",
    currentWeek: "",
    tasksOnly: false,
    noteContent: null,
    collapsedAreas: {},
    viewPrefs: {},
    hideEmptyProjects: false,
    hideNonProjects: false,
    hidePaused: false,
    visibleViews: { inbox: true, today: true, upcoming: true, anytime: true, someday: true },
    settingsPopoverOpen: false,
    recentNotes: []
  };
  var MAX_RECENT_NOTES = 12;
  function pushRecentNote(filename) {
    if (!filename) return;
    var arr = (State.recentNotes || []).filter(function(f) {
      return f !== filename;
    });
    arr.unshift(filename);
    if (arr.length > MAX_RECENT_NOTES) arr = arr.slice(0, MAX_RECENT_NOTES);
    State.recentNotes = arr;
    sendMessageToPlugin("saveRecentNotes", JSON.stringify({ recentNotes: JSON.stringify(arr) }));
  }

  // src/webview/helpers.js
  function esc(str) {
    if (!str) return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function capitalize(s) {
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function parseDateLocal(s) {
    if (!s) return null;
    var p = String(s).split("-");
    if (p.length < 3) return null;
    var y = parseInt(p[0], 10), m = parseInt(p[1], 10), d = parseInt(p[2], 10);
    if (isNaN(y) || isNaN(m) || isNaN(d)) return null;
    return new Date(y, m - 1, d);
  }
  function daysUntilDue(dueStr) {
    var due = parseDateLocal(dueStr);
    var today = parseDateLocal(State.today);
    if (!due || !today) return null;
    return Math.round((due.getTime() - today.getTime()) / 864e5);
  }
  function addDays(dateStr, n) {
    var parts = dateStr.split("-");
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    d.setDate(d.getDate() + n);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function getNextMonday(dateStr) {
    var parts = dateStr.split("-");
    var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
    var day = d.getDay();
    var daysUntilMon = day === 0 ? 1 : 8 - day;
    d.setDate(d.getDate() + daysUntilMon);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function addWeeks(weekStr, n) {
    var parts = weekStr.split("-W");
    var year = parseInt(parts[0]);
    var week = parseInt(parts[1]) + n;
    while (week > 52) {
      year++;
      week -= 52;
    }
    return year + "-W" + String(week).padStart(2, "0");
  }
  function formatDateHeader(dateStr) {
    if (!dateStr || dateStr === "No Date") return dateStr;
    try {
      var parts = dateStr.split("-");
      var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      var days = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return months[d.getMonth()] + " " + d.getDate() + " \u2014 " + days[d.getDay()];
    } catch (e) {
      return dateStr;
    }
  }
  function formatUpcomingDateHeader(dateStr) {
    try {
      var parts = dateStr.split("-");
      var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      var days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      var label = days[d.getDay()] + ", " + months[d.getMonth()] + " " + d.getDate();
      var tomorrow = /* @__PURE__ */ new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      var tmrStr = tomorrow.getFullYear() + "-" + String(tomorrow.getMonth() + 1).padStart(2, "0") + "-" + String(tomorrow.getDate()).padStart(2, "0");
      if (dateStr === tmrStr) label += ' <span style="opacity:0.5;font-weight:400;">Tomorrow</span>';
      return label;
    } catch (e) {
      return dateStr;
    }
  }
  function formatWeekHeader(weekStr) {
    try {
      var parts = weekStr.split("-W");
      var year = parseInt(parts[0]);
      var week = parseInt(parts[1]);
      var jan1 = new Date(year, 0, 1);
      var dayOffset = (jan1.getDay() + 6) % 7;
      var weekStart = new Date(year, 0, 1 + (week - 1) * 7 - dayOffset);
      var weekEnd = new Date(weekStart.getTime() + 6 * 864e5);
      var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return "Week " + week + " \u2014 " + months[weekStart.getMonth()] + " " + weekStart.getDate() + "\u2013" + weekEnd.getDate();
    } catch (e) {
      return weekStr;
    }
  }
  function formatShortDate(dateStr) {
    try {
      var parts = dateStr.split("-");
      var d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
      var months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      return months[d.getMonth()] + " " + d.getDate();
    } catch (e) {
      return dateStr;
    }
  }

  // src/webview/markdown.js
  function renderInlineMarkdown(text) {
    if (!text) return "";
    var s = esc(text);
    var placeholders = [];
    function placeholder(html) {
      var key = "\0PH" + placeholders.length + "\0";
      placeholders.push(html);
      return key;
    }
    s = s.replace(/\[([^\]]+)\]\(([^)]+)\)/g, function(m, linkText, url) {
      return placeholder('<a class="cl-link" href="' + url + '" target="_blank">' + linkText + "</a>");
    });
    s = s.replace(/\[\[([^\]]+)\]\]/g, function(m, linkText) {
      return placeholder('<span class="cl-wikilink">' + linkText + "</span>");
    });
    s = s.replace(/(https?:\/\/[^\s<>\[\]]+)/g, function(m, url) {
      return placeholder('<a class="cl-link" href="' + url + '" target="_blank">' + url + "</a>");
    });
    s = s.replace(/`([^`]+)`/g, function(m, code) {
      return placeholder('<code class="cl-inline-code">' + code + "</code>");
    });
    s = s.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
    s = s.replace(new RegExp("(?<!\\*)\\*(?!\\*)(.+?)(?<!\\*)\\*(?!\\*)", "g"), "<em>$1</em>");
    s = s.replace(/~~(.+?)~~/g, "<del>$1</del>");
    s = s.replace(/==(.+?)==/g, "<mark>$1</mark>");
    s = s.replace(/\/\/\s.*$/g, function(m) {
      return placeholder('<span class="cl-comment">' + m + "</span>");
    });
    s = s.replace(/\/\*.*?\*\//g, function(m) {
      return placeholder('<span class="cl-comment">' + m + "</span>");
    });
    s = s.replace(/\s*\^[\da-zA-Z]{4,}/g, function(m) {
      return placeholder(' <span class="cl-block-id">*</span>');
    });
    s = s.replace(/(#[\p{L}\p{N}_\-\/]+)/gu, '<span class="cl-tag-inline">$1</span>');
    s = s.replace(/(^|[\s(])(@(?!done|due|repeat)[\p{L}\p{N}_\-]+)/gu, function(m, pre, mention) {
      return pre + '<span class="cl-mention-inline">' + mention + "</span>";
    });
    for (var i = 0; i < placeholders.length; i++) {
      s = s.replace("\0PH" + i + "\0", placeholders[i]);
    }
    return s;
  }
  function isTableSeparatorLine(line) {
    var cells = splitTableCells(line);
    if (cells.length === 0) return false;
    for (var i = 0; i < cells.length; i++) {
      if (!/^:?-{3,}:?$/.test(cells[i])) return false;
    }
    return true;
  }
  function splitTableCells(line) {
    var s = line.trim();
    if (s.charAt(0) === "|") s = s.substring(1);
    if (s.charAt(s.length - 1) === "|") s = s.substring(0, s.length - 1);
    var cells = s.split("|");
    for (var i = 0; i < cells.length; i++) cells[i] = cells[i].trim();
    return cells;
  }
  function renderMarkdownTable(lines) {
    var rows = lines.map(splitTableCells);
    var sepIdx = -1;
    for (var i = 0; i < rows.length; i++) {
      if (isTableSeparatorLine(lines[i])) {
        sepIdx = i;
        break;
      }
    }
    var alignments = [];
    if (sepIdx >= 0) {
      for (var a = 0; a < rows[sepIdx].length; a++) {
        var cell = rows[sepIdx][a];
        if (/^:-+:$/.test(cell)) alignments.push("center");
        else if (/^-+:$/.test(cell)) alignments.push("right");
        else alignments.push("left");
      }
    }
    var colCount = 0;
    for (var r = 0; r < rows.length; r++) if (rows[r].length > colCount) colCount = rows[r].length;
    function cellStyle(col) {
      var align = alignments[col] || "left";
      return align === "left" ? "" : ' style="text-align:' + align + '"';
    }
    var html = '<div class="cl-note-table-wrap"><table class="cl-note-table">';
    var hasHeader = sepIdx === 1;
    var bodyStart = sepIdx >= 0 ? sepIdx + 1 : 0;
    if (hasHeader) {
      html += "<thead><tr>";
      for (var h = 0; h < colCount; h++) {
        var headText = rows[0][h] || "";
        html += "<th" + cellStyle(h) + ">" + renderInlineMarkdown(headText) + "</th>";
      }
      html += "</tr></thead>";
    }
    html += "<tbody>";
    for (var br = bodyStart; br < rows.length; br++) {
      if (br === sepIdx) continue;
      html += "<tr>";
      for (var c = 0; c < colCount; c++) {
        var cellText = rows[br][c] || "";
        html += "<td" + cellStyle(c) + ">" + renderInlineMarkdown(cellText) + "</td>";
      }
      html += "</tr>";
    }
    html += "</tbody></table></div>";
    return html;
  }

  // src/webview/review.js
  var PAUSED_COLOR = "#9CA3AF";
  var REVIEW_DUE_COLOR = "#F59E0B";
  function reviewIntervalToDays(interval) {
    if (!interval) return null;
    var match = String(interval).match(/^(\d+)([dwmqy])$/i);
    if (!match) return null;
    var num = parseInt(match[1], 10);
    switch (match[2].toLowerCase()) {
      case "d":
        return num;
      case "w":
        return num * 7;
      case "m":
        return num * 30;
      case "q":
        return num * 91;
      case "y":
        return num * 365;
      default:
        return null;
    }
  }
  function reviewDueDaysFromFm(fm) {
    if (!fm) return null;
    var interval = fm.review;
    if (!interval || !reviewIntervalToDays(interval)) return null;
    var todayStr = State.today;
    var reviewedStr = fm.reviewed;
    var nextStr;
    if (reviewedStr) {
      var days = reviewIntervalToDays(interval);
      var d = /* @__PURE__ */ new Date(reviewedStr + "T00:00:00");
      if (isNaN(d.getTime())) return null;
      d.setDate(d.getDate() + days);
      var y = d.getFullYear();
      var m = String(d.getMonth() + 1).padStart(2, "0");
      var dd = String(d.getDate()).padStart(2, "0");
      nextStr = y + "-" + m + "-" + dd;
    } else {
      nextStr = todayStr;
    }
    var next = /* @__PURE__ */ new Date(nextStr + "T00:00:00");
    var today = /* @__PURE__ */ new Date(todayStr + "T00:00:00");
    if (isNaN(next.getTime()) || isNaN(today.getTime())) return null;
    return Math.round((next.getTime() - today.getTime()) / 864e5);
  }
  function isReviewDue(reviewDueDays, status) {
    if (reviewDueDays == null || reviewDueDays > 0) return false;
    if (status === "paused" || status === "someday") return false;
    if (status === "completed" || status === "canceled") return false;
    return true;
  }
  function reviewDueLabel(reviewDueDays, hasReviewedDate) {
    if (reviewDueDays == null) return "";
    if (!hasReviewedDate) return "Never reviewed";
    if (reviewDueDays === 0) return "Review due today";
    if (reviewDueDays === -1) return "Was due yesterday";
    var abs = -reviewDueDays;
    if (abs <= 13) return "Was due " + abs + " days ago";
    if (abs <= 29) return "Was due " + Math.floor(abs / 7) + " weeks ago";
    var months = Math.floor(abs / 30);
    return "Was due " + months + " month" + (months === 1 ? "" : "s") + " ago";
  }

  // src/webview/icons.js
  function buildPauseOverlay(size) {
    var s = size || 18;
    return '<svg class="cl-status-overlay" width="' + s + '" height="' + s + '" viewBox="0 0 18 18" aria-hidden="true"><rect x="6" y="5.5" width="1.8" height="7" rx="0.4" fill="#fff" stroke="#374151" stroke-width="0.35"/><rect x="10.2" y="5.5" width="1.8" height="7" rx="0.4" fill="#fff" stroke="#374151" stroke-width="0.35"/></svg>';
  }
  function buildCheckOverlay(size) {
    var s = size || 18;
    return '<svg class="cl-status-overlay" width="' + s + '" height="' + s + '" viewBox="0 0 18 18" aria-hidden="true"><path d="M6.6 9.3 L8.4 11.1 L11.6 7.6" fill="none" stroke="#1f2937" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  }
  function buildXOverlay(size) {
    var s = size || 18;
    return '<svg class="cl-status-overlay" width="' + s + '" height="' + s + '" viewBox="0 0 18 18" aria-hidden="true"><path d="M7.2 7.2 L10.8 10.8 M10.8 7.2 L7.2 10.8" fill="none" stroke="#1f2937" stroke-width="1.5" stroke-linecap="round"/></svg>';
  }
  function renderProjectIcon(noteLike, size) {
    var s = size || 18;
    var status = noteLike.status || "";
    var isArea = noteLike.noteType === "area";
    var muted = status === "paused" || status === "someday";
    var reviewDue = isReviewDue(noteLike.reviewDueDays, status);
    var color;
    if (muted) color = PAUSED_COLOR;
    else if (reviewDue) color = REVIEW_DUE_COLOR;
    else color = noteLike.bgColorDark || "#3B82F6";
    var inner;
    if (isArea) {
      inner = buildAreaIcon(color, s);
    } else {
      var forceFull = !isArea && (status === "completed" || status === "canceled");
      var pct = forceFull ? 100 : noteLike.taskCount > 0 ? Math.round(noteLike.doneCount / noteLike.taskCount * 100) : 0;
      inner = buildProgressPie(pct, color, s);
    }
    var overlay = "";
    if (status === "paused") overlay = buildPauseOverlay(s);
    else if (!isArea && status === "completed") overlay = buildCheckOverlay(s);
    else if (!isArea && status === "canceled") overlay = buildXOverlay(s);
    if (!overlay) return inner;
    return '<span class="cl-icon-stack" style="width:' + s + "px;height:" + s + 'px">' + inner + overlay + "</span>";
  }
  function buildProgressPie(pct, color, size) {
    var s = size || 18;
    var svg = '<svg class="cl-progress-ring" width="' + s + '" height="' + s + '" viewBox="0 0 18 18">';
    svg += '<circle cx="9" cy="9" r="7" fill="none" stroke="' + color + '" stroke-width="1.5"/>';
    if (pct >= 100) {
      svg += '<circle cx="9" cy="9" r="5.2" fill="' + color + '"/>';
    } else if (pct > 0) {
      var r = 5.2;
      var angle = pct / 100 * 360;
      var endRad = (angle - 90) * Math.PI / 180;
      var endX = 9 + r * Math.cos(endRad);
      var endY = 9 + r * Math.sin(endRad);
      var largeArc = angle > 180 ? 1 : 0;
      svg += '<path d="M9,9 L9,' + (9 - r) + " A" + r + "," + r + " 0 " + largeArc + ",1 " + endX.toFixed(3) + "," + endY.toFixed(3) + ' Z" fill="' + color + '"/>';
    }
    svg += "</svg>";
    return svg;
  }
  var DEADLINE_FLAG_SVG = '<svg class="cl-deadline-flag" width="11" height="11" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M6 3a1 1 0 0 1 1 1v17a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1zm2 1.5h11.2a.6.6 0 0 1 .49.94L17.5 9l2.19 3.56a.6.6 0 0 1-.51.94H8z"/></svg>';
  function buildDeadlineBadgeCompact(dueStr) {
    var diff = daysUntilDue(dueStr);
    if (diff === null) return "";
    var cls, text;
    if (diff > 0) {
      cls = "cl-deadline-future";
      text = diff + "d";
    } else if (diff === 0) {
      cls = "cl-deadline-today";
      text = "";
    } else {
      cls = "cl-deadline-overdue";
      text = -diff + "d";
    }
    return '<span class="cl-deadline cl-deadline-compact ' + cls + '" title="Due ' + esc(dueStr) + '">' + DEADLINE_FLAG_SVG + (text ? '<span class="cl-deadline-text">' + text + "</span>" : "") + "</span>";
  }
  function buildDeadlineBadgeVerbose(dueStr) {
    var diff = daysUntilDue(dueStr);
    if (diff === null) return "";
    var cls, suffix;
    if (diff > 0) {
      cls = "cl-deadline-future";
      suffix = diff + " day" + (diff === 1 ? "" : "s") + " left";
    } else if (diff === 0) {
      cls = "cl-deadline-today";
      suffix = "Today";
    } else {
      cls = "cl-deadline-overdue";
      suffix = -diff + " day" + (diff === -1 ? "" : "s") + " overdue";
    }
    return '<span class="cl-deadline cl-deadline-verbose ' + cls + '">' + DEADLINE_FLAG_SVG + '<span class="cl-deadline-primary">Deadline: ' + esc(dueStr) + '</span><span class="cl-deadline-countdown">' + suffix + "</span></span>";
  }
  function buildAreaIcon(color, size) {
    var s = size || 18;
    var c = color || "#3B82F6";
    var svg = '<svg class="cl-area-icon" width="' + s + '" height="' + s + '" viewBox="0 0 18 18">';
    svg += '<path d="M9 2.6 L15.4 6.3 L9 10 L2.6 6.3 Z" fill="' + c + '" fill-opacity="0.95"/>';
    svg += '<path d="M2.6 6.3 L9 10 L9 15.6 L2.6 11.9 Z" fill="' + c + '" fill-opacity="0.55"/>';
    svg += '<path d="M15.4 6.3 L9 10 L9 15.6 L15.4 11.9 Z" fill="' + c + '" fill-opacity="0.78"/>';
    svg += '<path d="M9 2.6 L15.4 6.3 L9 10 L2.6 6.3 Z" fill="none" stroke="' + c + '" stroke-width="0.6" stroke-opacity="0.9"/>';
    svg += "</svg>";
    return svg;
  }
  function getViewIcon(id, size) {
    var s = size || 18;
    var attrs = 'width="' + s + '" height="' + s + '" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"';
    switch (id) {
      case "inbox":
        return "<svg " + attrs + '><path d="M4.2 4.2h15.6a1.4 1.4 0 0 1 1.4 1.4v9.2a3 3 0 0 1-3 3H5.8a3 3 0 0 1-3-3V5.6a1.4 1.4 0 0 1 1.4-1.4z" fill="#1E88E5"/><path d="M3 13.2h5.2l1.3 2a1 1 0 0 0 .85.45h3.3a1 1 0 0 0 .85-.45l1.3-2H21v1.6a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3z" fill="#1565C0"/></svg>';
      case "today":
        return "<svg " + attrs + '><path d="M12 2.2l2.93 6.06 6.66.6a.5.5 0 0 1 .29.87l-5.04 4.43 1.52 6.55a.5.5 0 0 1-.74.54L12 17.85l-5.62 3.4a.5.5 0 0 1-.74-.54l1.52-6.55L2.12 9.73a.5.5 0 0 1 .29-.87l6.66-.6z" fill="#FFB300"/><path d="M12 17.85l-5.62 3.4a.5.5 0 0 1-.74-.54l1.52-6.55L2.12 9.73a.5.5 0 0 1 .29-.87l6.66-.6L12 2.2z" fill="#fff" fill-opacity="0.18"/></svg>';
      case "upcoming":
        return "<svg " + attrs + '><rect x="2.5" y="5" width="19" height="16" rx="2.5" fill="#EC407A"/><path d="M5 5h14a2.5 2.5 0 0 1 2.5 2.5v2.2H2.5V7.5A2.5 2.5 0 0 1 5 5z" fill="#C2185B"/><rect x="6.4" y="2.6" width="2.2" height="4.8" rx="1.1" fill="#7B1538"/><rect x="15.4" y="2.6" width="2.2" height="4.8" rx="1.1" fill="#7B1538"/><rect x="6.6" y="2.8" width="1.8" height="1.4" rx="0.9" fill="#fff" fill-opacity="0.35"/><rect x="15.6" y="2.8" width="1.8" height="1.4" rx="0.9" fill="#fff" fill-opacity="0.35"/><circle cx="12" cy="15" r="3" fill="#fff"/><rect x="2.5" y="9.7" width="19" height="0.6" fill="#000" fill-opacity="0.12"/></svg>';
      case "anytime":
        return "<svg " + attrs + '><path d="M12 14.5l-9-4.25v1.5L12 16l9-4.25v-1.5z" fill="#00695C"/><path d="M12 18l-9-4.25v1.5L12 19.5l9-4.25v-1.5z" fill="#00695C"/><path d="M12 3L3 7.25 12 11.5l9-4.25z" fill="#4DB6AC"/><path d="M12 7.5L3 11.75 12 16l9-4.25z" fill="#26A69A"/><path d="M12 12L3 16.25 12 20.5l9-4.25z" fill="#00897B"/></svg>';
      case "someday":
        return "<svg " + attrs + '><path d="M3 9.5h18v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" fill="#A77855"/><path d="M3.5 4.5h17a1 1 0 0 1 1 1V9.5h-19V5.5a1 1 0 0 1 1-1z" fill="#CB9970"/><rect x="3" y="9.2" width="18" height="0.8" fill="#000" fill-opacity="0.2"/><rect x="11" y="4.5" width="2" height="16" fill="#7A5238" fill-opacity="0.45"/><rect x="9.4" y="12.6" width="5.2" height="1.8" rx="0.9" fill="#3E2615"/><rect x="3.5" y="4.5" width="17" height="0.6" fill="#fff" fill-opacity="0.25"/></svg>';
    }
    return "";
  }

  // src/webview/task-categorization.js
  function getTasksForView(view) {
    var today = State.today;
    var currentWeek = State.currentWeek;
    var result = [];
    var seenBlockIds = {};
    var needsDedup = view === "today" || view === "upcoming";
    for (var i = 0; i < State.tasks.length; i++) {
      var t = State.tasks[i];
      if (t.status !== "open") continue;
      if (t.isDelegated) continue;
      var match = false;
      switch (view) {
        case "inbox":
          if (t.sourceType === "calendar" && t.sourceDate && t.sourceDate <= today) match = true;
          break;
        case "today":
          if (t.scheduledDate && t.scheduledDate <= today) match = true;
          break;
        case "upcoming":
          if (t.scheduledDate && t.scheduledDate > today || t.scheduledWeek && t.scheduledWeek > currentWeek) match = true;
          break;
        case "anytime":
          if (t.sourceType !== "calendar") {
            if (!t.tags || t.tags.indexOf("#someday") === -1) {
              if (!t.scheduledDate || t.scheduledDate <= today) {
                if (!t.scheduledWeek || t.scheduledWeek <= currentWeek) match = true;
              }
            }
          }
          break;
        case "someday":
          if (t.tags && t.tags.indexOf("#someday") >= 0) match = true;
          break;
      }
      if (match) {
        if (needsDedup && t.blockId) {
          if (seenBlockIds[t.blockId]) {
            if (t.sourceType === "note" && seenBlockIds[t.blockId].sourceType === "calendar") {
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
      tasks = tasks.filter(function(t) {
        return t.tags && t.tags.indexOf(State.filters.tag) >= 0;
      });
    }
    if (State.filters.folder) {
      tasks = tasks.filter(function(t) {
        return (t.folderName || "") === State.filters.folder;
      });
    }
    if (State.filters.mention) {
      tasks = tasks.filter(function(t) {
        return t.mentions && t.mentions.indexOf(State.filters.mention) >= 0;
      });
    }
    if (State.filters.text) {
      var q = State.filters.text.toLowerCase();
      tasks = tasks.filter(function(t) {
        return t.content.toLowerCase().indexOf(q) >= 0;
      });
    }
    return tasks;
  }
  function getViewCount(view) {
    return getTasksForView(view).length;
  }

  // src/webview/sidebar-resize.js
  var SIDEBAR_MIN_WIDTH = 140;
  var SIDEBAR_MAX_WIDTH = 500;
  var SIDEBAR_DEFAULT_WIDTH = 200;
  function applySidebarWidth(width) {
    var w = parseInt(width, 10);
    if (isNaN(w)) w = SIDEBAR_DEFAULT_WIDTH;
    if (w < SIDEBAR_MIN_WIDTH) w = SIDEBAR_MIN_WIDTH;
    if (w > SIDEBAR_MAX_WIDTH) w = SIDEBAR_MAX_WIDTH;
    document.documentElement.style.setProperty("--cl-sidebar-width", w + "px");
  }
  function setupSidebarResizer() {
    var resizer = document.getElementById("cl-resizer");
    var sidebar = document.getElementById("cl-sidebar");
    if (!resizer || !sidebar) return;
    var dragging = false;
    var startX = 0;
    var startWidth = 0;
    resizer.addEventListener("mousedown", function(e) {
      if (window.innerWidth <= 600) return;
      dragging = true;
      startX = e.clientX;
      startWidth = sidebar.getBoundingClientRect().width;
      document.body.classList.add("cl-resizing");
      resizer.classList.add("cl-resizer-active");
      e.preventDefault();
    });
    document.addEventListener("mousemove", function(e) {
      if (!dragging) return;
      var newWidth = startWidth + (e.clientX - startX);
      if (newWidth < SIDEBAR_MIN_WIDTH) newWidth = SIDEBAR_MIN_WIDTH;
      if (newWidth > SIDEBAR_MAX_WIDTH) newWidth = SIDEBAR_MAX_WIDTH;
      document.documentElement.style.setProperty("--cl-sidebar-width", newWidth + "px");
    });
    document.addEventListener("mouseup", function() {
      if (!dragging) return;
      dragging = false;
      document.body.classList.remove("cl-resizing");
      resizer.classList.remove("cl-resizer-active");
      var finalWidth = sidebar.getBoundingClientRect().width;
      sendMessageToPlugin("saveSidebarWidth", JSON.stringify({ width: Math.round(finalWidth) }));
    });
  }

  // src/webview/messages.js
  function onMessageFromPlugin(type, data) {
    switch (type) {
      case "INIT_DATA":
        State.tasks = data.tasks || [];
        State.folders = data.folders || [];
        State.notes = data.notes || [];
        State.today = data.today || "";
        State.currentWeek = data.currentWeek || "";
        if (data.lastView) State.currentView = data.lastView;
        if (data.lastNoteFilename && data.lastView === "note") State.currentNoteFilename = data.lastNoteFilename;
        if (data.collapsedAreas) {
          try {
            State.collapsedAreas = JSON.parse(data.collapsedAreas);
          } catch (e) {
            State.collapsedAreas = {};
          }
        }
        if (data.viewPrefs) {
          try {
            State.viewPrefs = JSON.parse(data.viewPrefs);
          } catch (e) {
            State.viewPrefs = {};
          }
        }
        State.hideEmptyProjects = !!data.hideEmptyProjects;
        State.hideNonProjects = !!data.hideNonProjects;
        State.hidePaused = !!data.hidePaused;
        if (data.recentNotes) {
          try {
            var parsedRecents = JSON.parse(data.recentNotes);
            if (Array.isArray(parsedRecents)) State.recentNotes = parsedRecents;
          } catch (e) {
            State.recentNotes = [];
          }
        }
        if (data.visibleViews) {
          try {
            var parsedViews = JSON.parse(data.visibleViews);
            if (parsedViews && typeof parsedViews === "object") {
              for (var vk in parsedViews) {
                if (Object.prototype.hasOwnProperty.call(parsedViews, vk)) {
                  State.visibleViews[vk] = !!parsedViews[vk];
                }
              }
            }
          } catch (e) {
          }
        }
        applySidebarWidth(data.sidebarWidth);
        restoreViewPrefs(State.currentView, State.currentNoteFilename);
        renderSidebar();
        if (State.currentView === "note" && State.currentNoteFilename) {
          sendMessageToPlugin("requestNoteContent", JSON.stringify({ filename: State.currentNoteFilename }));
        }
        renderCurrentView();
        break;
      case "NOTE_CONTENT":
        State.noteContent = data;
        if (State.currentView === "note") renderCurrentView();
        break;
      case "SHOW_NOTE":
        if (data && data.filename) {
          navigateToProjectNote(data.filename);
        }
        break;
      case "PROJECT_REFRESHED":
        handleProjectRefreshed(data);
        break;
      case "TASK_CREATED":
      case "TASK_SAVED":
      case "TASK_TOGGLED":
      case "TASK_REORDERED":
      case "TASK_RESCHEDULED":
      case "TASK_DELETED":
      case "TASK_TAG_UPDATED":
        sendMessageToPlugin("ready", "{}");
        break;
      case "PROJECT_ARCHIVED":
        if (data && data.success) {
          if (State.currentNoteFilename === data.oldFilename) {
            State.currentView = "inbox";
            State.currentNoteFilename = null;
            State.noteContent = null;
            sendMessageToPlugin("saveView", JSON.stringify({ view: "inbox", noteFilename: null }));
          }
          sendMessageToPlugin("ready", "{}");
        } else {
          console.log("Clarity: archive failed: " + (data && data.error));
        }
        break;
      case "NOTE_FRONTMATTER_UPDATED":
        if (State.noteContent && State.noteContent.filename === data.filename) {
          State.noteContent.frontmatter = data.frontmatter || {};
          State.noteContent.bgColorDark = data.bgColorDark || State.noteContent.bgColorDark;
        }
        (function() {
          var fnFm = data.filename;
          var newFm = data.frontmatter || {};
          var newRdd = reviewDueDaysFromFm(newFm);
          var newStatus = newFm.status === "paused" || newFm.status === "someday" || newFm.status === "completed" || newFm.status === "canceled" ? newFm.status : null;
          var newType = newFm.type === "area" ? "area" : newFm.type === "project" ? "project" : "";
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
        sendMessageToPlugin("ready", "{}");
        break;
      default:
        console.log("Clarity WebView: unknown message type: " + type);
    }
  }
  function handleProjectRefreshed(data) {
    if (!data || !data.filename) return;
    var fn = data.filename;
    var kept = [];
    for (var i = 0; i < State.tasks.length; i++) {
      if (State.tasks[i].noteFilename !== fn) kept.push(State.tasks[i]);
    }
    if (data.tasks && data.tasks.length) {
      for (var ti = 0; ti < data.tasks.length; ti++) kept.push(data.tasks[ti]);
    }
    State.tasks = kept;
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
            notes[ni].reviewDueDays = nm.reviewDueDays == null ? null : nm.reviewDueDays;
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
          State.notes[li].reviewDueDays = nm.reviewDueDays == null ? null : nm.reviewDueDays;
        }
      }
    }
    renderSidebar();
    renderCurrentView();
  }

  // src/webview/quick-jump.js
  function quickJumpScore(note, query) {
    if (!query) return 1;
    var q = query.toLowerCase();
    var title = (note.title || "").toLowerCase();
    if (!title) return 0;
    var score = 0;
    if (title.indexOf(q) === 0) score += 100;
    else if (title.indexOf(q) >= 0) score += 50 - title.indexOf(q);
    var words = title.split(/[\s\-_/]+/).filter(function(w2) {
      return w2.length > 0;
    });
    var initials = "";
    for (var w = 0; w < words.length; w++) initials += words[w].charAt(0);
    if (initials.indexOf(q) === 0) score += 80;
    else if (initials.indexOf(q) >= 0) score += 30;
    return score;
  }
  function quickJumpResults(query) {
    var notes = State.notes || [];
    if (!query) {
      var byFilename = {};
      for (var ni = 0; ni < notes.length; ni++) byFilename[notes[ni].filename] = notes[ni];
      var ordered = [];
      var seen = {};
      var recents = State.recentNotes || [];
      for (var ri = 0; ri < recents.length; ri++) {
        var rn = byFilename[recents[ri]];
        if (rn && !seen[rn.filename]) {
          ordered.push(rn);
          seen[rn.filename] = true;
        }
      }
      for (var si = 0; si < notes.length; si++) {
        if (!seen[notes[si].filename]) {
          ordered.push(notes[si]);
          seen[notes[si].filename] = true;
        }
      }
      return ordered.slice(0, 12);
    }
    var scored = [];
    for (var i = 0; i < notes.length; i++) {
      var s = quickJumpScore(notes[i], query);
      if (s > 0) scored.push({ note: notes[i], score: s });
    }
    scored.sort(function(a, b) {
      if (b.score !== a.score) return b.score - a.score;
      return (a.note.title || "").localeCompare(b.note.title || "");
    });
    return scored.slice(0, 12).map(function(x) {
      return x.note;
    });
  }
  function renderQuickJumpResults(container, results, selectedIndex) {
    var html = "";
    if (results.length === 0) {
      html = '<div class="cl-jump-empty">No matching projects or areas</div>';
    } else {
      for (var i = 0; i < results.length; i++) {
        var n = results[i];
        var folderPath = (n.filename || "").replace(/\/[^/]+$/, "");
        var icon = renderProjectIcon(n, 16);
        var sel = i === selectedIndex ? " cl-jump-result-active" : "";
        html += '<div class="cl-jump-result' + sel + '" data-filename="' + esc(n.filename) + '" data-index="' + i + '"><span class="cl-jump-icon">' + icon + '</span><span class="cl-jump-title">' + esc(n.title || "") + '</span><span class="cl-jump-folder">' + esc(folderPath) + "</span></div>";
      }
    }
    container.innerHTML = html;
  }
  function openQuickJump() {
    var existing = document.querySelector(".cl-jump-overlay");
    if (existing) {
      existing.remove();
      return;
    }
    var overlay = document.createElement("div");
    overlay.className = "cl-jump-overlay";
    overlay.innerHTML = '<div class="cl-jump-modal"><input class="cl-jump-input" type="text" placeholder="Jump to project or area\u2026" autocomplete="off" spellcheck="false"><div class="cl-jump-results"></div></div>';
    document.body.appendChild(overlay);
    var input = overlay.querySelector(".cl-jump-input");
    var resultsEl = overlay.querySelector(".cl-jump-results");
    var state = { results: quickJumpResults(""), selected: 0 };
    renderQuickJumpResults(resultsEl, state.results, state.selected);
    function close() {
      overlay.remove();
    }
    function jumpTo(filename) {
      if (!filename) return;
      close();
      navigateToProjectNote(filename);
    }
    input.addEventListener("input", function() {
      state.results = quickJumpResults(input.value);
      state.selected = 0;
      renderQuickJumpResults(resultsEl, state.results, state.selected);
    });
    input.addEventListener("keydown", function(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (state.results.length === 0) return;
        state.selected = Math.min(state.selected + 1, state.results.length - 1);
        renderQuickJumpResults(resultsEl, state.results, state.selected);
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        if (state.results.length === 0) return;
        state.selected = Math.max(state.selected - 1, 0);
        renderQuickJumpResults(resultsEl, state.results, state.selected);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        var pick = state.results[state.selected];
        if (pick) jumpTo(pick.filename);
        return;
      }
    });
    resultsEl.addEventListener("click", function(e) {
      var row = e.target.closest(".cl-jump-result");
      if (!row) return;
      jumpTo(row.dataset.filename);
    });
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) close();
    });
    setTimeout(function() {
      input.focus();
    }, 0);
  }

  // src/webview/modals.js
  function openConfirmModal(opts) {
    var existing = document.querySelector(".cl-confirm-overlay");
    if (existing) existing.remove();
    var title = opts.title || "Are you sure?";
    var message = opts.message || "";
    var confirmLabel = opts.confirmLabel || "Confirm";
    var cancelLabel = opts.cancelLabel || "Cancel";
    var destructive = !!opts.destructive;
    var overlay = document.createElement("div");
    overlay.className = "cl-confirm-overlay";
    overlay.innerHTML = '<div class="cl-confirm-modal"><div class="cl-confirm-title">' + esc(title) + "</div>" + (message ? '<div class="cl-confirm-message">' + esc(message) + "</div>" : "") + '<div class="cl-confirm-actions"><button class="cl-confirm-cancel" type="button">' + esc(cancelLabel) + '</button><button class="cl-confirm-ok' + (destructive ? " cl-confirm-destructive" : "") + '" type="button">' + esc(confirmLabel) + "</button></div></div>";
    document.body.appendChild(overlay);
    var okBtn = overlay.querySelector(".cl-confirm-ok");
    var cancelBtn = overlay.querySelector(".cl-confirm-cancel");
    function close() {
      overlay.remove();
    }
    function confirm() {
      close();
      if (typeof opts.onConfirm === "function") opts.onConfirm();
    }
    function cancel() {
      close();
      if (typeof opts.onCancel === "function") opts.onCancel();
    }
    okBtn.addEventListener("click", confirm);
    cancelBtn.addEventListener("click", cancel);
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) cancel();
    });
    overlay.addEventListener("keydown", function(e) {
      if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        confirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        cancel();
      }
    });
    setTimeout(function() {
      okBtn.focus();
    }, 0);
  }
  function deleteTaskById(taskId) {
    if (!taskId) return;
    var task = null;
    for (var i = 0; i < State.tasks.length; i++) {
      if (State.tasks[i].id === taskId) {
        task = State.tasks[i];
        break;
      }
    }
    var parts = taskId.split(":");
    var filename = parts.slice(0, -1).join(":");
    var lineIndex = parseInt(parts[parts.length - 1]);
    if (isNaN(lineIndex)) return;
    var preview = task ? task.content : "";
    openConfirmModal({
      title: "Delete this task?",
      message: preview ? "\u201C" + preview + "\u201D will be removed from its note. This cannot be undone from Clarity." : "The task will be removed from its note. This cannot be undone from Clarity.",
      confirmLabel: "Delete",
      cancelLabel: "Cancel",
      destructive: true,
      onConfirm: function() {
        State.tasks = State.tasks.filter(function(t) {
          return t.id !== taskId;
        });
        if (State.expandedTaskId === taskId) collapseTask();
        State.focusedTaskIndex = -1;
        renderCurrentView();
        sendMessageToPlugin("deleteTask", JSON.stringify({ filename, lineIndex }));
      }
    });
  }
  var SHORTCUTS_GROUPS = [
    {
      title: "Navigation",
      items: [
        { keys: ["\u23181", "..", "\u23185"], label: "Switch view (Inbox, Today, Upcoming, Anytime, Someday)" },
        { keys: ["\u2318/"], label: "Quick-jump to a project or area" },
        { keys: ["\u2191", "\u2193"], label: "Move focus between tasks" },
        { keys: ["Enter"], label: "Open the focused task" },
        { keys: ["Esc"], label: "Close editor, picker, or palette" }
      ]
    },
    {
      title: "Task actions",
      items: [
        { keys: ["Space"], label: "Toggle the focused task done / open" },
        { keys: ["\u2318T"], label: "Schedule for today" },
        { keys: ["\u2318\u21E7T"], label: "Schedule for tomorrow" },
        { keys: ["\u2318E"], label: 'Add to "This Evening"' },
        { keys: ["\u2318O"], label: "Clear schedule" },
        { keys: ["\u2318\u232B"], label: "Delete task (with confirmation)" },
        { keys: ["\u2318Enter"], label: "Save the open task editor" }
      ]
    },
    {
      title: "Other",
      items: [
        { keys: ["\u2318N"], label: "Focus the New Task input" },
        { keys: ["?"], label: "Show this cheatsheet" }
      ]
    }
  ];
  function openShortcutsCheatsheet() {
    var existing = document.querySelector(".cl-cheatsheet-overlay");
    if (existing) {
      existing.remove();
      return;
    }
    var html = '<div class="cl-cheatsheet-modal"><div class="cl-cheatsheet-title">Keyboard shortcuts</div>';
    for (var gi = 0; gi < SHORTCUTS_GROUPS.length; gi++) {
      var g = SHORTCUTS_GROUPS[gi];
      html += '<div class="cl-cheatsheet-section">';
      html += '<div class="cl-cheatsheet-section-title">' + esc(g.title) + "</div>";
      for (var ii = 0; ii < g.items.length; ii++) {
        var it = g.items[ii];
        var keysHtml = "";
        for (var ki = 0; ki < it.keys.length; ki++) {
          var k = it.keys[ki];
          if (k === "..") keysHtml += '<span class="cl-cheatsheet-sep">\u2026</span>';
          else keysHtml += '<kbd class="cl-cheatsheet-kbd">' + esc(k) + "</kbd>";
        }
        html += '<div class="cl-cheatsheet-row"><div class="cl-cheatsheet-keys">' + keysHtml + '</div><div class="cl-cheatsheet-label">' + esc(it.label) + "</div></div>";
      }
      html += "</div>";
    }
    html += '<div class="cl-cheatsheet-foot">Press <kbd class="cl-cheatsheet-kbd">?</kbd> or <kbd class="cl-cheatsheet-kbd">Esc</kbd> to close</div>';
    html += "</div>";
    var overlay = document.createElement("div");
    overlay.className = "cl-cheatsheet-overlay";
    overlay.innerHTML = html;
    document.body.appendChild(overlay);
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) overlay.remove();
    });
  }
  var _projectMenuOutsideListener = null;
  function closeProjectMenu() {
    var existing = document.querySelector(".cl-project-menu");
    if (existing) existing.remove();
    if (_projectMenuOutsideListener) {
      document.removeEventListener("mousedown", _projectMenuOutsideListener, true);
      _projectMenuOutsideListener = null;
    }
  }
  function toggleProjectMenu(button) {
    if (document.querySelector(".cl-project-menu")) {
      closeProjectMenu();
      return;
    }
    var wrap = button.closest(".cl-project-menu-wrap");
    if (!wrap) return;
    var fn = State.currentNoteFilename || State.noteContent && State.noteContent.filename || "";
    var menu = document.createElement("div");
    menu.className = "cl-project-menu";
    menu.innerHTML = '<button type="button" class="cl-project-menu-item" data-action="refreshProject" data-filename="' + esc(fn) + '"><span class="cl-project-menu-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-3.5-7.1"/><path d="M21 4v5h-5"/></svg></span><span>Refresh</span></button><button type="button" class="cl-project-menu-item" data-action="openNoteMetaModal"><span class="cl-project-menu-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z"/></svg></span><span>Edit metadata\u2026</span></button><div class="cl-project-menu-sep"></div><button type="button" class="cl-project-menu-item cl-project-menu-destructive" data-action="archiveProject"><span class="cl-project-menu-icon"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8H3v13h18V8z"/><path d="M1 3h22v5H1z"/><path d="M10 12h4"/></svg></span><span>Move to archive\u2026</span></button>';
    wrap.appendChild(menu);
    _projectMenuOutsideListener = function(e) {
      if (!menu.contains(e.target) && !button.contains(e.target)) closeProjectMenu();
    };
    setTimeout(function() {
      document.addEventListener("mousedown", _projectMenuOutsideListener, true);
    }, 0);
  }
  function confirmArchiveProject() {
    var nc = State.noteContent;
    var fn = nc && nc.filename || State.currentNoteFilename;
    if (!fn) return;
    var origFolder = fn.replace(/\/[^/]+$/, "");
    if (origFolder === fn) origFolder = "";
    var leaf = fn.split("/").pop();
    var targetPath = "@Archive/" + State.today + (origFolder ? "/" + origFolder : "") + "/" + leaf;
    var title = nc && nc.title || leaf.replace(/\.(md|txt)$/, "");
    openConfirmModal({
      title: "Move to archive?",
      message: "\u201C" + title + "\u201D will be moved to: " + targetPath,
      confirmLabel: "Archive",
      cancelLabel: "Cancel",
      destructive: true,
      onConfirm: function() {
        sendMessageToPlugin("archiveProject", JSON.stringify({ filename: fn }));
      }
    });
  }

  // src/webview/dnd.js
  var dragState = null;
  var dragSuppressNextClick = false;
  var DRAG_LONG_PRESS_MS = 300;
  var DRAG_CANCEL_DISTANCE = 10;
  var DRAG_SCROLL_ZONE = 40;
  var DRAG_SCROLL_SPEED = 8;
  function consumeDragClickSuppression() {
    if (dragSuppressNextClick) {
      dragSuppressNextClick = false;
      return true;
    }
    return false;
  }
  function dragGetTaskRow(el) {
    var row = el.closest(".cl-task-row");
    if (!row || row.dataset.lineIndex === void 0) return null;
    return row;
  }
  function dragFindSiblings(sourceRow) {
    var container = document.querySelector(".cl-note-content");
    if (!container) return [];
    var sourceIndent = parseInt(sourceRow.dataset.indent, 10) || 0;
    var rows = container.querySelectorAll(".cl-task-row[data-line-index]");
    var siblings = [];
    for (var i = 0; i < rows.length; i++) {
      var rowIndent = parseInt(rows[i].dataset.indent, 10) || 0;
      if (rowIndent === sourceIndent && rows[i] !== sourceRow) {
        siblings.push(rows[i]);
      }
    }
    return siblings;
  }
  function dragCreateClone(sourceRow, x, y) {
    var rect = sourceRow.getBoundingClientRect();
    var clone = sourceRow.cloneNode(true);
    clone.classList.add("cl-drag-clone");
    clone.style.width = rect.width + "px";
    clone.style.height = rect.height + "px";
    clone.style.left = rect.left + "px";
    clone.style.top = y - rect.height / 2 + "px";
    document.body.appendChild(clone);
    return clone;
  }
  function dragCreateIndicator() {
    var el = document.createElement("div");
    el.className = "cl-drop-indicator";
    return el;
  }
  function dragUpdateClonePosition(clone, y) {
    var height = clone.offsetHeight;
    clone.style.top = y - height / 2 + "px";
  }
  function dragFindDropTarget(y, sourceRow, siblings) {
    var best = null;
    var bestDist = Infinity;
    for (var i = 0; i < siblings.length; i++) {
      var rect = siblings[i].getBoundingClientRect();
      var mid = rect.top + rect.height / 2;
      var dist = Math.abs(y - mid);
      if (dist < bestDist) {
        bestDist = dist;
        best = { el: siblings[i], position: y < mid ? "before" : "after" };
      }
    }
    return best;
  }
  function dragPositionIndicator(indicator, target) {
    if (!target) {
      if (indicator.parentNode) indicator.parentNode.removeChild(indicator);
      return;
    }
    var row = target.el;
    var refEl = row.closest(".cl-indent-wrap") || row;
    if (target.position === "before") {
      refEl.parentNode.insertBefore(indicator, refEl);
    } else {
      refEl.parentNode.insertBefore(indicator, refEl.nextSibling);
    }
  }
  function dragAutoScroll(y) {
    var main = document.getElementById("cl-main");
    if (!main) return;
    var rect = main.getBoundingClientRect();
    if (y < rect.top + DRAG_SCROLL_ZONE) {
      var intensity = 1 - (y - rect.top) / DRAG_SCROLL_ZONE;
      main.scrollTop -= DRAG_SCROLL_SPEED * Math.max(0, intensity);
    } else if (y > rect.bottom - DRAG_SCROLL_ZONE) {
      var intensity = 1 - (rect.bottom - y) / DRAG_SCROLL_ZONE;
      main.scrollTop += DRAG_SCROLL_SPEED * Math.max(0, intensity);
    }
  }
  function dragCommit(sourceRow, dropTarget) {
    if (!dropTarget) return;
    var sourceLineIndex = parseInt(sourceRow.dataset.lineIndex, 10);
    var childCount = parseInt(sourceRow.dataset.childCount, 10) || 0;
    var targetLineIndex = parseInt(dropTarget.el.dataset.lineIndex, 10);
    if (dropTarget.position === "after") {
      var targetChildCount = parseInt(dropTarget.el.dataset.childCount, 10) || 0;
      targetLineIndex = targetLineIndex + targetChildCount + 1;
    }
    var sourceRef = sourceRow.closest(".cl-indent-wrap") || sourceRow;
    var targetRef = dropTarget.el.closest(".cl-indent-wrap") || dropTarget.el;
    if (dropTarget.position === "before") {
      targetRef.parentNode.insertBefore(sourceRef, targetRef);
    } else {
      targetRef.parentNode.insertBefore(sourceRef, targetRef.nextSibling);
    }
    sendMessageToPlugin("reorderTask", JSON.stringify({
      filename: State.currentNoteFilename,
      sourceLineIndex,
      childCount,
      targetLineIndex
    }));
  }
  function dragCleanup() {
    if (!dragState) return;
    if (dragState.cloneEl && dragState.cloneEl.parentNode) {
      dragState.cloneEl.parentNode.removeChild(dragState.cloneEl);
    }
    if (dragState.indicatorEl && dragState.indicatorEl.parentNode) {
      dragState.indicatorEl.parentNode.removeChild(dragState.indicatorEl);
    }
    if (dragState.sourceEl) {
      dragState.sourceEl.classList.remove("cl-drag-ghost");
    }
    if (dragState.scrollInterval) {
      clearInterval(dragState.scrollInterval);
    }
    document.body.classList.remove("cl-dragging");
    dragState = null;
  }
  function dragCancel() {
    dragCleanup();
  }
  function dragStart(sourceRow, y, x) {
    if (State.expandedTaskId) {
      dragCleanup();
      return;
    }
    sourceRow.classList.add("cl-drag-ghost");
    document.body.classList.add("cl-dragging");
    var clone = dragCreateClone(sourceRow, x, y);
    var indicator = dragCreateIndicator();
    var siblings = dragFindSiblings(sourceRow);
    if (siblings.length === 0) {
      sourceRow.classList.remove("cl-drag-ghost");
      document.body.classList.remove("cl-dragging");
      if (clone.parentNode) clone.parentNode.removeChild(clone);
      dragState = null;
      return;
    }
    dragState.phase = "dragging";
    dragState.cloneEl = clone;
    dragState.indicatorEl = indicator;
    dragState.siblings = siblings;
    dragState.scrollInterval = setInterval(function() {
      if (dragState && dragState.phase === "dragging") {
        dragAutoScroll(dragState.currentY);
      }
    }, 16);
  }
  function dragMove(y, x) {
    if (!dragState || dragState.phase !== "dragging") return;
    dragState.currentY = y;
    dragUpdateClonePosition(dragState.cloneEl, y);
    var target = dragFindDropTarget(y, dragState.sourceEl, dragState.siblings);
    dragState.currentTarget = target;
    dragPositionIndicator(dragState.indicatorEl, target);
  }
  function dragEnd() {
    if (!dragState) return;
    if (dragState.phase === "pending") {
      if (dragState.timer) clearTimeout(dragState.timer);
      dragState = null;
      return;
    }
    if (dragState.phase === "dragging") {
      var target = dragState.currentTarget;
      var sourceRow = dragState.sourceEl;
      dragSuppressNextClick = true;
      dragCleanup();
      if (target) {
        dragCommit(sourceRow, target);
      }
      return;
    }
    dragCleanup();
  }
  function attachDragListeners(mainEl) {
    if (!mainEl) return;
    mainEl.addEventListener("mousedown", function(e) {
      if (State.currentView !== "note") return;
      if (e.button !== 0) return;
      if (e.target.closest(".cl-cb") || e.target.closest(".cl-task-editor") || e.target.closest(".cl-quick-add")) return;
      var row = dragGetTaskRow(e.target);
      if (!row) return;
      var startY = e.clientY;
      var startX = e.clientX;
      dragState = {
        phase: "pending",
        sourceEl: row,
        sourceId: row.dataset.taskId,
        sourceLineIndex: parseInt(row.dataset.lineIndex, 10),
        childCount: parseInt(row.dataset.childCount, 10) || 0,
        indentLevel: parseInt(row.dataset.indent, 10) || 0,
        cloneEl: null,
        indicatorEl: null,
        startY,
        startX,
        currentY: startY,
        currentTarget: null,
        siblings: null,
        scrollInterval: null,
        timer: setTimeout(function() {
          if (dragState && dragState.phase === "pending") {
            e.preventDefault();
            dragStart(row, startY, startX);
          }
        }, DRAG_LONG_PRESS_MS)
      };
    });
    mainEl.addEventListener("mousemove", function(e) {
      if (!dragState) return;
      if (dragState.phase === "pending") {
        var dx = e.clientX - dragState.startX;
        var dy = e.clientY - dragState.startY;
        if (Math.sqrt(dx * dx + dy * dy) > DRAG_CANCEL_DISTANCE) {
          clearTimeout(dragState.timer);
          dragState = null;
        }
        return;
      }
      if (dragState.phase === "dragging") {
        e.preventDefault();
        dragMove(e.clientY, e.clientX);
      }
    });
    mainEl.addEventListener("mouseup", function() {
      if (!dragState) return;
      dragEnd();
    });
    mainEl.addEventListener("touchstart", function(e) {
      if (State.currentView !== "note") return;
      if (e.touches.length !== 1) return;
      if (e.target.closest(".cl-cb") || e.target.closest(".cl-task-editor") || e.target.closest(".cl-quick-add")) return;
      var row = dragGetTaskRow(e.target);
      if (!row) return;
      var touch = e.touches[0];
      var startY = touch.clientY;
      var startX = touch.clientX;
      dragState = {
        phase: "pending",
        sourceEl: row,
        sourceId: row.dataset.taskId,
        sourceLineIndex: parseInt(row.dataset.lineIndex, 10),
        childCount: parseInt(row.dataset.childCount, 10) || 0,
        indentLevel: parseInt(row.dataset.indent, 10) || 0,
        cloneEl: null,
        indicatorEl: null,
        startY,
        startX,
        currentY: startY,
        currentTarget: null,
        siblings: null,
        scrollInterval: null,
        timer: setTimeout(function() {
          if (dragState && dragState.phase === "pending") {
            dragStart(row, startY, startX);
          }
        }, DRAG_LONG_PRESS_MS)
      };
    }, { passive: true });
    mainEl.addEventListener("touchmove", function(e) {
      if (!dragState) return;
      var touch = e.touches[0];
      if (dragState.phase === "pending") {
        var dx = touch.clientX - dragState.startX;
        var dy = touch.clientY - dragState.startY;
        if (Math.sqrt(dx * dx + dy * dy) > DRAG_CANCEL_DISTANCE) {
          clearTimeout(dragState.timer);
          dragState = null;
        }
        return;
      }
      if (dragState.phase === "dragging") {
        e.preventDefault();
        dragMove(touch.clientY, touch.clientX);
      }
    }, { passive: false });
    mainEl.addEventListener("touchend", function() {
      if (!dragState) return;
      dragEnd();
    });
    mainEl.addEventListener("touchcancel", function() {
      if (!dragState) return;
      dragCancel();
    });
    document.addEventListener("keydown", function(e) {
      if (e.key === "Escape" && dragState && dragState.phase === "dragging") {
        e.preventDefault();
        dragCancel();
      }
    });
  }

  // src/webview/note-meta-modal.js
  function openNoteMetaModal() {
    var nc = State.noteContent;
    if (!nc) return;
    var existing = document.querySelector(".cl-meta-overlay");
    if (existing) {
      existing.remove();
      return;
    }
    var fm = nc.frontmatter || {};
    var typeVal = fm.type === "project" || fm.type === "area" ? fm.type : "";
    var statusVal = fm.status === "paused" || fm.status === "someday" || fm.status === "completed" || fm.status === "canceled" ? fm.status : "";
    var dueVal = fm.due || "";
    var reviewedVal = fm.reviewed || "";
    var reviewVal = fm.review || "";
    var overlay = document.createElement("div");
    overlay.className = "cl-meta-overlay";
    overlay.innerHTML = '<div class="cl-meta-modal"><div class="cl-meta-modal-title">Project metadata</div><div class="cl-meta-row"><label class="cl-meta-label">Type</label><select class="cl-meta-input" data-field="type"><option value=""' + (typeVal === "" ? " selected" : "") + '>\u2014</option><option value="project"' + (typeVal === "project" ? " selected" : "") + '>Project</option><option value="area"' + (typeVal === "area" ? " selected" : "") + '>Area</option></select></div><div class="cl-meta-row"><label class="cl-meta-label">Status</label><select class="cl-meta-input" data-field="status"><option value=""' + (statusVal === "" ? " selected" : "") + '>Active</option><option value="paused"' + (statusVal === "paused" ? " selected" : "") + '>Paused</option><option value="someday"' + (statusVal === "someday" ? " selected" : "") + ">Someday</option>" + (typeVal === "project" ? '<option value="completed"' + (statusVal === "completed" ? " selected" : "") + '>Completed</option><option value="canceled"' + (statusVal === "canceled" ? " selected" : "") + ">Canceled</option>" : "") + '</select></div><div class="cl-meta-row"><label class="cl-meta-label">Deadline</label><div class="cl-meta-inline" data-field="due-row">' + (dueVal ? '<input class="cl-meta-input" type="date" data-field="due" value="' + esc(dueVal) + '"><button class="cl-meta-link" type="button" data-action="metaClearDue">Clear</button>' : '<span class="cl-meta-readonly" data-field="due-display">\u2014</span><button class="cl-meta-link" type="button" data-action="metaSetDue">Set deadline</button>') + '</div></div><div class="cl-meta-row"><label class="cl-meta-label">Last Review</label><div class="cl-meta-inline"><span class="cl-meta-readonly" data-field="reviewed-display">' + esc(reviewedVal || "\u2014") + '</span><button class="cl-meta-link" type="button" data-action="metaMarkReviewed">Mark as reviewed</button></div></div><div class="cl-meta-row"><label class="cl-meta-label">Review Schedule</label><input class="cl-meta-input" type="text" data-field="review" placeholder="e.g. 1w, 2w, 1m" value="' + esc(reviewVal) + '"></div><div class="cl-meta-actions"><button class="cl-meta-cancel" type="button">Cancel</button><button class="cl-meta-save" type="button">Save</button></div></div>';
    document.body.appendChild(overlay);
    var draft = { type: typeVal, status: statusVal, due: dueVal, reviewed: reviewedVal, review: reviewVal };
    function close() {
      overlay.remove();
    }
    function readInputs() {
      var typeSel = overlay.querySelector('[data-field="type"]');
      var statusSel = overlay.querySelector('[data-field="status"]');
      var dueIn = overlay.querySelector('[data-field="due"]');
      var reviewIn = overlay.querySelector('[data-field="review"]');
      if (typeSel) draft.type = typeSel.value;
      if (statusSel) draft.status = statusSel.value;
      if (dueIn) draft.due = dueIn.value;
      if (reviewIn) draft.review = reviewIn.value.trim();
    }
    function save() {
      readInputs();
      var updates = {
        type: draft.type || null,
        status: draft.status || null,
        due: draft.due || null,
        reviewed: draft.reviewed || null,
        review: draft.review || null
      };
      sendMessageToPlugin("updateNoteFrontmatter", JSON.stringify({ filename: nc.filename, updates }));
      close();
    }
    overlay.addEventListener("click", function(e) {
      if (e.target === overlay) close();
      var target = e.target.closest("[data-action]");
      if (!target) return;
      var action = target.dataset.action;
      if (action === "metaClearDue") {
        draft.due = "";
        var dueRow = overlay.querySelector('[data-field="due-row"]');
        if (dueRow) {
          dueRow.innerHTML = '<span class="cl-meta-readonly" data-field="due-display">\u2014</span><button class="cl-meta-link" type="button" data-action="metaSetDue">Set deadline</button>';
        }
      } else if (action === "metaSetDue") {
        var dueRow2 = overlay.querySelector('[data-field="due-row"]');
        if (dueRow2) {
          dueRow2.innerHTML = '<input class="cl-meta-input" type="date" data-field="due" value="' + esc(State.today) + '"><button class="cl-meta-link" type="button" data-action="metaClearDue">Clear</button>';
          draft.due = State.today;
          var newIn = dueRow2.querySelector('[data-field="due"]');
          if (newIn) newIn.focus();
        }
      } else if (action === "metaMarkReviewed") {
        draft.reviewed = State.today;
        var disp = overlay.querySelector('[data-field="reviewed-display"]');
        if (disp) disp.textContent = State.today;
      }
    });
    overlay.querySelector(".cl-meta-cancel").addEventListener("click", close);
    overlay.querySelector(".cl-meta-save").addEventListener("click", save);
    overlay.addEventListener("keydown", function(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        close();
      } else if (e.key === "Enter" && e.target.tagName !== "TEXTAREA") {
        e.preventDefault();
        e.stopPropagation();
        save();
      }
    });
    setTimeout(function() {
      var first = overlay.querySelector('[data-field="type"]');
      if (first) first.focus();
    }, 0);
  }

  // src/webview/index.js
  globalThis.onMessageFromPlugin = onMessageFromPlugin;
  function navigateToProjectNote(filename) {
    if (!filename) return;
    if (State.expandedTaskId) collapseTask();
    var navItem = document.querySelector('.cl-nav-item[data-filename="' + filename + '"]');
    if (navItem) {
      navItem.click();
      navItem.scrollIntoView({ block: "nearest" });
      return;
    }
    saveCurrentViewPrefs();
    State.currentView = "note";
    State.currentNoteFilename = filename;
    State.focusedTaskIndex = -1;
    State.filters = { tag: null, mention: null, text: "", noteStatus: "all" };
    State.tasksOnly = false;
    State.expandedTaskId = null;
    State.editDraft = null;
    sendMessageToPlugin("requestNoteContent", JSON.stringify({ filename }));
    sendMessageToPlugin("saveView", JSON.stringify({ view: "note", noteFilename: filename }));
    pushRecentNote(filename);
    renderSidebar();
    renderCurrentView();
  }
  var SIDEBAR_VIEWS = [
    { id: "inbox", label: "Inbox" },
    { id: "today", label: "Today" },
    { id: "upcoming", label: "Upcoming" },
    { id: "anytime", label: "Anytime" },
    { id: "someday", label: "Someday" }
  ];
  function renderSidebar() {
    var el = document.getElementById("cl-sidebar");
    if (!el) return;
    var html = '<div class="cl-sidebar-inner">';
    for (var vi = 0; vi < SIDEBAR_VIEWS.length; vi++) {
      var v = SIDEBAR_VIEWS[vi];
      if (State.visibleViews[v.id] === false) continue;
      var count = getViewCount(v.id);
      var active = State.currentView === v.id ? " cl-nav-active" : "";
      html += '<div class="cl-nav-item' + active + '" data-view="' + v.id + '">';
      html += '<span class="cl-nav-icon">' + getViewIcon(v.id, 18) + "</span>";
      html += '<span class="cl-nav-label">' + v.label + "</span>";
      if (count > 0 && (v.id === "inbox" || v.id === "today")) {
        html += '<span class="cl-nav-count">' + count + "</span>";
      }
      html += "</div>";
    }
    html += '<div class="cl-nav-divider"></div>';
    for (var fi = 0; fi < State.folders.length; fi++) {
      var folder = State.folders[fi];
      var areaKey = folder.path;
      var collapsed = State.collapsedAreas && State.collapsedAreas[areaKey];
      var notes = folder.notes || [];
      var visibleNotes = notes;
      visibleNotes = visibleNotes.filter(function(n2) {
        return n2.status !== "someday";
      });
      if (State.hidePaused) {
        visibleNotes = visibleNotes.filter(function(n2) {
          return n2.status !== "paused";
        });
      }
      if (State.hideEmptyProjects) {
        visibleNotes = visibleNotes.filter(function(n2) {
          return (n2.openCount || 0) > 0;
        });
      }
      if (State.hideNonProjects) {
        visibleNotes = visibleNotes.filter(function(n2) {
          return n2.hasProjectOrAreaType;
        });
      }
      if (visibleNotes.length === 0) continue;
      html += '<div class="cl-area-header" data-area="' + esc(areaKey) + '">';
      html += '<span class="cl-area-chevron' + (collapsed ? " cl-collapsed" : "") + '">\u25B8</span>';
      html += esc(folder.name);
      html += "</div>";
      html += '<div class="cl-area-group' + (collapsed ? " cl-hidden" : "") + '" data-area-group="' + esc(areaKey) + '">';
      for (var ni = 0; ni < visibleNotes.length; ni++) {
        var n = visibleNotes[ni];
        var noteActive = State.currentView === "note" && State.currentNoteFilename === n.filename ? " cl-nav-active" : "";
        var mutedCls = n.status === "paused" || n.status === "someday" ? " cl-project-muted" : "";
        html += '<div class="cl-nav-item cl-project-item' + mutedCls + noteActive + '" data-view="note" data-filename="' + esc(n.filename) + '">';
        html += renderProjectIcon(n, 18);
        html += '<span class="cl-project-title">' + esc(n.title) + "</span>";
        if (n.due) html += buildDeadlineBadgeCompact(n.due);
        html += "</div>";
      }
      html += "</div>";
    }
    html += "</div>";
    html += renderSidebarFooter();
    el.innerHTML = html;
    var navItems = el.querySelectorAll(".cl-nav-item");
    for (var ci = 0; ci < navItems.length; ci++) {
      navItems[ci].addEventListener("click", handleNavClick);
    }
    var areaHeaders = el.querySelectorAll(".cl-area-header");
    for (var ai = 0; ai < areaHeaders.length; ai++) {
      areaHeaders[ai].addEventListener("click", function(e) {
        var areaKey2 = e.currentTarget.dataset.area;
        if (!areaKey2) return;
        State.collapsedAreas[areaKey2] = !State.collapsedAreas[areaKey2];
        var chevron = e.currentTarget.querySelector(".cl-area-chevron");
        var group = el.querySelector('[data-area-group="' + areaKey2 + '"]');
        if (chevron) chevron.classList.toggle("cl-collapsed");
        if (group) group.classList.toggle("cl-hidden");
        sendMessageToPlugin("saveCollapsedAreas", JSON.stringify({ collapsedAreas: JSON.stringify(State.collapsedAreas) }));
      });
    }
    attachSidebarFooterHandlers();
  }
  function renderSidebarFooter() {
    var open = State.settingsPopoverOpen;
    var html = '<div class="cl-sidebar-footer">';
    html += '<div class="cl-settings-popover' + (open ? " cl-popover-open" : "") + '">';
    html += '<div class="cl-settings-section">';
    html += '<div class="cl-settings-section-title">Projects &amp; Areas</div>';
    html += '<label class="cl-settings-toggle"><input type="checkbox" data-action="toggleHideEmpty"' + (State.hideEmptyProjects ? " checked" : "") + "><span>Hide notes without open tasks</span></label>";
    html += '<label class="cl-settings-toggle"><input type="checkbox" data-action="toggleHideNonProjects"' + (State.hideNonProjects ? " checked" : "") + "><span>Hide non-projects and non-areas</span></label>";
    html += '<label class="cl-settings-toggle"><input type="checkbox" data-action="toggleHidePaused"' + (State.hidePaused ? " checked" : "") + "><span>Hide paused</span></label>";
    html += '<button class="cl-settings-action" data-action="collapseAllAreas">Collapse all</button>';
    html += '<button class="cl-settings-action" data-action="expandAllAreas">Expand all</button>';
    html += "</div>";
    html += '<div class="cl-settings-section">';
    html += '<div class="cl-settings-section-title">Views</div>';
    for (var vi = 0; vi < SIDEBAR_VIEWS.length; vi++) {
      var v = SIDEBAR_VIEWS[vi];
      var checked = State.visibleViews[v.id] !== false;
      html += '<label class="cl-settings-toggle"><input type="checkbox" data-action="toggleViewVisibility" data-view="' + v.id + '"' + (checked ? " checked" : "") + '><span class="cl-settings-toggle-icon">' + getViewIcon(v.id, 16) + "</span><span>" + v.label + "</span></label>";
    }
    html += "</div>";
    html += '<div class="cl-settings-section">';
    html += '<button class="cl-settings-action cl-settings-help" data-action="openShortcutsCheatsheet"><span>Keyboard shortcuts</span><kbd class="cl-cheatsheet-kbd">?</kbd></button>';
    html += "</div>";
    html += "</div>";
    html += '<button class="cl-settings-btn' + (open ? " cl-active" : "") + '" data-action="toggleSettingsPopover" title="View settings">';
    html += '<i class="fa-solid fa-sliders"></i>';
    html += "<span>View settings</span>";
    html += "</button>";
    html += "</div>";
    return html;
  }
  var _settingsOutsideListener = null;
  function attachSidebarFooterHandlers() {
    var footer = document.querySelector(".cl-sidebar-footer");
    if (!footer) return;
    if (_settingsOutsideListener) {
      document.removeEventListener("click", _settingsOutsideListener);
      _settingsOutsideListener = null;
    }
    footer.addEventListener("click", function(e) {
      var target = e.target.closest("[data-action]");
      if (!target) return;
      var action = target.dataset.action;
      switch (action) {
        case "toggleSettingsPopover":
          State.settingsPopoverOpen = !State.settingsPopoverOpen;
          document.body.classList.toggle("cl-settings-backdrop", State.settingsPopoverOpen);
          renderSidebar();
          break;
        case "toggleHideEmpty":
          State.hideEmptyProjects = !!target.checked;
          sendMessageToPlugin("saveHideEmptyProjects", JSON.stringify({ hideEmptyProjects: State.hideEmptyProjects }));
          renderSidebar();
          break;
        case "toggleHidePaused":
          State.hidePaused = !!target.checked;
          sendMessageToPlugin("saveHidePaused", JSON.stringify({ hidePaused: State.hidePaused }));
          renderSidebar();
          break;
        case "toggleHideNonProjects":
          State.hideNonProjects = !!target.checked;
          sendMessageToPlugin("saveHideNonProjects", JSON.stringify({ hideNonProjects: State.hideNonProjects }));
          renderSidebar();
          break;
        case "collapseAllAreas":
          for (var fi = 0; fi < State.folders.length; fi++) {
            State.collapsedAreas[State.folders[fi].path] = true;
          }
          sendMessageToPlugin("saveCollapsedAreas", JSON.stringify({ collapsedAreas: JSON.stringify(State.collapsedAreas) }));
          renderSidebar();
          break;
        case "expandAllAreas":
          State.collapsedAreas = {};
          sendMessageToPlugin("saveCollapsedAreas", JSON.stringify({ collapsedAreas: JSON.stringify(State.collapsedAreas) }));
          renderSidebar();
          break;
        case "toggleViewVisibility": {
          var vid = target.dataset.view;
          if (!vid) break;
          State.visibleViews[vid] = !!target.checked;
          sendMessageToPlugin("saveVisibleViews", JSON.stringify({ visibleViews: JSON.stringify(State.visibleViews) }));
          renderSidebar();
          break;
        }
        case "openShortcutsCheatsheet":
          State.settingsPopoverOpen = false;
          document.body.classList.remove("cl-settings-backdrop");
          renderSidebar();
          openShortcutsCheatsheet();
          break;
      }
    });
    if (State.settingsPopoverOpen) {
      _settingsOutsideListener = function(e) {
        var f = document.querySelector(".cl-sidebar-footer");
        if (f && !f.contains(e.target)) {
          State.settingsPopoverOpen = false;
          document.body.classList.remove("cl-settings-backdrop");
          document.removeEventListener("click", _settingsOutsideListener);
          _settingsOutsideListener = null;
          renderSidebar();
        }
      };
      setTimeout(function() {
        if (_settingsOutsideListener) document.addEventListener("click", _settingsOutsideListener);
      }, 0);
    }
  }
  function viewPrefsKey(view, filename) {
    return view === "note" ? "note:" + (filename || "") : view;
  }
  function saveCurrentViewPrefs() {
    var key = viewPrefsKey(State.currentView, State.currentNoteFilename);
    if (State.currentView === "note") {
      State.viewPrefs[key] = { noteStatus: State.filters.noteStatus, tasksOnly: State.tasksOnly };
    } else {
      State.viewPrefs[key] = { tag: State.filters.tag, folder: State.filters.folder, grouping: State.grouping };
    }
  }
  function restoreViewPrefs(view, filename) {
    var key = viewPrefsKey(view, filename);
    var saved = State.viewPrefs[key];
    if (view === "note") {
      State.filters.noteStatus = saved && saved.noteStatus || "all";
      State.tasksOnly = saved && saved.tasksOnly || false;
    } else {
      State.filters.tag = saved && saved.tag || null;
      State.filters.folder = saved && saved.folder || null;
      State.grouping = saved && saved.grouping || defaultGrouping(view);
    }
  }
  function defaultGrouping(view) {
    if (view === "inbox") return "date";
    if (view === "anytime") return "folder";
    return "note";
  }
  function persistViewPrefs() {
    sendMessageToPlugin("saveViewPrefs", JSON.stringify({ viewPrefs: JSON.stringify(State.viewPrefs) }));
  }
  function handleNavClick(e) {
    var item = e.currentTarget;
    var view = item.dataset.view;
    if (!view) return;
    var sidebar = document.getElementById("cl-sidebar");
    var overlay = document.getElementById("cl-sidebar-overlay");
    if (sidebar) sidebar.classList.remove("cl-sidebar-open");
    if (overlay) overlay.classList.remove("cl-sidebar-open");
    saveCurrentViewPrefs();
    State.currentView = view;
    State.focusedTaskIndex = -1;
    State.filters = { tag: null, mention: null, text: "", noteStatus: "all" };
    State.tasksOnly = false;
    State.expandedTaskId = null;
    State.editDraft = null;
    if (view === "note") {
      State.currentNoteFilename = item.dataset.filename || null;
      sendMessageToPlugin("requestNoteContent", JSON.stringify({ filename: State.currentNoteFilename }));
      pushRecentNote(State.currentNoteFilename);
    }
    restoreViewPrefs(view, State.currentNoteFilename);
    persistViewPrefs();
    sendMessageToPlugin("saveView", JSON.stringify({ view, noteFilename: State.currentNoteFilename }));
    var allNav = document.querySelectorAll(".cl-nav-item");
    for (var i = 0; i < allNav.length; i++) allNav[i].classList.remove("cl-nav-active");
    item.classList.add("cl-nav-active");
    renderCurrentView();
  }
  function renderTaskRow(task, options) {
    options = options || {};
    var showSource = options.showSource !== false;
    var showStar = options.showStar || false;
    var isOverdue = options.isOverdue || false;
    var alwaysShowDate = options.alwaysShowDate || false;
    var dimmed = options.dimmed || false;
    var classes = "cl-task-row";
    if (task.status === "done") classes += " cl-done";
    if (task.status === "cancelled") classes += " cl-cancelled";
    if (isOverdue) classes += " cl-overdue";
    if (dimmed) classes += " cl-dimmed";
    var dragAttrs = "";
    if (options.lineIndex !== void 0) {
      dragAttrs = ' data-line-index="' + options.lineIndex + '" data-indent="' + (options.indentLevel || 0) + '" data-child-count="' + (options.childCount || 0) + '"';
    }
    var html = '<div class="' + classes + '" data-task-id="' + esc(task.id) + '"' + dragAttrs + ">";
    var cbClass = task.type === "checklist" ? "cl-cb cl-cb-square" : "cl-cb";
    if (task.status === "done") cbClass += " cl-cb-done";
    else if (task.status === "cancelled") cbClass += " cl-cb-cancelled";
    if (task.isDelegated) cbClass += " cl-cb-delegated";
    if (isOverdue && task.status === "open") cbClass += " cl-cb-overdue";
    html += '<div class="' + cbClass + '" data-action="toggle"></div>';
    html += '<div class="cl-task-content">';
    html += '<div class="cl-task-title">';
    if (showStar && task.scheduledDate === State.today) {
      html += '<span class="cl-star">\u2B50</span> ';
    }
    html += '<span class="cl-task-text">' + renderInlineMarkdown(task.content) + "</span>";
    html += "</div>";
    var metaParts = [];
    if (showSource && task.noteTitle && task.sourceType === "note") {
      metaParts.push(esc(task.noteTitle));
    }
    var repeatBadge = "";
    if (task.repeat) {
      repeatBadge = ' <span class="cl-repeat-badge" title="Repeats: ' + esc(task.repeat) + '"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 15.5-6.3L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15.5 6.3L3 16"/><path d="M3 21v-5h5"/></svg><span class="cl-repeat-text">' + esc(task.repeat) + "</span></span>";
    }
    var badgeSep = repeatBadge ? "\xA0\xA0" : "";
    if (isOverdue && task.scheduledDate) {
      metaParts.push('<span class="cl-overdue-date">' + task.scheduledDate + "</span>" + badgeSep + repeatBadge);
    } else if (task.scheduledDate && (alwaysShowDate || task.scheduledDate !== State.today)) {
      metaParts.push(task.scheduledDate + badgeSep + repeatBadge);
    } else if (repeatBadge) {
      metaParts.push(repeatBadge);
    }
    if (task.isDelegated && task.mentions.length > 0) {
      metaParts.push('delegated to <span class="cl-mention-inline">' + esc(task.mentions[0]) + "</span>");
    }
    if (task.children && task.children.length > 0) {
      var hasNotes = false;
      var clCount = 0;
      var clDone = 0;
      var subCount = 0;
      for (var ci = 0; ci < task.children.length; ci++) {
        if (task.children[ci].type === "note") hasNotes = true;
        else if (task.children[ci].type === "checklist") {
          clCount++;
          if (task.children[ci].status === "done") clDone++;
        } else if (task.children[ci].type === "task") subCount++;
      }
      var indicators = [];
      if (hasNotes) indicators.push('<span class="cl-child-icon" title="Has notes">\u2261</span>');
      if (clCount > 0) indicators.push('<span class="cl-child-icon cl-child-checklist" title="Checklist">\u2611 ' + clDone + "/" + clCount + "</span>");
      if (subCount > 0) indicators.push('<span class="cl-child-icon" title="Sub-tasks">\u2937 ' + subCount + "</span>");
      if (indicators.length > 0) metaParts = metaParts.concat(indicators);
    }
    if (metaParts.length > 0) {
      html += '<div class="cl-task-meta">' + metaParts.join("\xA0\xA0&middot; ") + "</div>";
    }
    html += "</div>";
    var badges = "";
    if (task.priority > 0) {
      var priLabels = ["", "!", "!!", "!!!"];
      badges += '<span class="cl-pri cl-pri-' + task.priority + '">' + priLabels[task.priority] + "</span>";
    }
    if (task.tags) {
      for (var ti = 0; ti < task.tags.length; ti++) {
        if (task.tags[ti] !== "#someday") {
          badges += '<span class="cl-tag-pill">' + esc(task.tags[ti]) + "</span>";
        }
      }
    }
    if (badges) html += '<div class="cl-task-badges">' + badges + "</div>";
    html += "</div>";
    return html;
  }
  function renderFilterBar(tasks, view) {
    var sourceTasks = view ? getTasksForView(view) : tasks;
    var tags = extractUniqueTags(sourceTasks);
    var folders = view ? extractUniqueFolders(sourceTasks) : [];
    if (tags.length === 0 && folders.length < 2) return "";
    var html = '<div class="cl-filter-bar">';
    var activeTag = State.filters.tag;
    var activeFolder = State.filters.folder;
    var noFilter = !activeTag && !activeFolder;
    html += '<span class="cl-filter-pill' + (noFilter ? " cl-filter-active" : "") + '" data-action="clearTaskFilters">All</span>';
    for (var i = 0; i < tags.length; i++) {
      var active = activeTag === tags[i] ? " cl-filter-active" : "";
      html += '<span class="cl-filter-pill' + active + '" data-action="filterTag" data-tag="' + esc(tags[i]) + '">' + esc(tags[i]) + "</span>";
    }
    if (folders.length >= 2) {
      if (tags.length > 0) html += '<span class="cl-filter-divider"></span>';
      for (var fi = 0; fi < folders.length; fi++) {
        var fActive = activeFolder === folders[fi] ? " cl-filter-active" : "";
        html += '<span class="cl-filter-pill cl-filter-pill-folder' + fActive + '" data-action="filterFolder" data-folder="' + esc(folders[fi]) + '">' + esc(folders[fi]) + "</span>";
      }
    }
    html += "</div>";
    return html;
  }
  function extractUniqueTags(tasks) {
    var tagMap = {};
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].tags) {
        for (var j = 0; j < tasks[i].tags.length; j++) {
          if (tasks[i].tags[j] !== "#someday" && tasks[i].tags[j] !== "#evening") tagMap[tasks[i].tags[j]] = true;
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
  function renderGroupingToggle(view) {
    var options = [];
    if (view === "today") options = ["note", "folder", "priority"];
    else if (view === "anytime" || view === "someday") options = ["folder", "note", "priority"];
    else return "";
    var html = '<div class="cl-group-toggle">';
    html += '<span class="cl-group-label">Group:</span>';
    for (var i = 0; i < options.length; i++) {
      var active = State.grouping === options[i] ? " cl-group-btn-active" : "";
      html += '<span class="cl-group-btn' + active + '" data-action="setGrouping" data-grouping="' + options[i] + '">' + capitalize(options[i]) + "</span>";
    }
    html += "</div>";
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
        case "folder":
          key = t.folderName || "Other";
          break;
        case "note":
          key = t.noteTitle || "Daily Note";
          break;
        case "priority":
          var priNames = ["No Priority", "!", "!!", "!!!"];
          key = priNames[t.priority] || "No Priority";
          break;
        case "date":
          key = t.sourceDate || t.scheduledDate || "No Date";
          break;
        default:
          key = t.noteTitle || "Other";
      }
      if (!groups[key]) {
        groups[key] = [];
        groupOrder.push(key);
      }
      groups[key].push(t);
    }
    if (grouping === "priority") {
      var priRank = { "!!!": 3, "!!": 2, "!": 1, "No Priority": 0 };
      groupOrder.sort(function(a, b) {
        return (priRank[b] || 0) - (priRank[a] || 0);
      });
    }
    var html = "";
    for (var gi = 0; gi < groupOrder.length; gi++) {
      var name = groupOrder[gi];
      var displayName = grouping === "date" ? formatDateHeader(name) : name;
      var group = groups[groupOrder[gi]];
      if (grouping === "note" && group[0] && group[0].noteFilename) {
        html += '<div class="cl-group-header cl-group-clickable" data-action="jumpToProjectNote" data-filename="' + esc(group[0].noteFilename) + '">' + esc(displayName) + "</div>";
      } else {
        html += '<div class="cl-group-header">' + esc(displayName) + "</div>";
      }
      for (var ti = 0; ti < group.length; ti++) {
        var rowOpts = { showSource: grouping !== "note" };
        if (options.showStar) rowOpts.showStar = true;
        if (options.dimmed) rowOpts.dimmed = true;
        html += renderTaskRow(group[ti], rowOpts);
      }
    }
    return html;
  }
  function renderQuickAdd(view) {
    return '<div class="cl-quick-add" data-view="' + view + '"><span class="cl-quick-add-icon">+</span><input class="cl-quick-add-input" placeholder="New Task" data-action="quickAdd"/></div>';
  }
  function renderCurrentView() {
    var el = document.getElementById("cl-main");
    if (!el) return;
    var html = "";
    switch (State.currentView) {
      case "inbox":
        html = renderInboxView();
        break;
      case "today":
        html = renderTodayView();
        break;
      case "upcoming":
        html = renderUpcomingView();
        break;
      case "anytime":
        html = renderAnytimeView();
        break;
      case "someday":
        html = renderSomedayView();
        break;
      case "note":
        html = renderNoteView();
        break;
      default:
        html = renderInboxView();
    }
    el.innerHTML = html;
    attachMainEventListeners();
  }
  function renderInboxView() {
    var tasks = getFilteredTasks("inbox");
    var html = '<div class="cl-view-header">';
    html += '<div class="cl-view-title"><span class="cl-view-icon">' + getViewIcon("inbox", 24) + "</span><h1>Inbox</h1>";
    html += '<span class="cl-view-count">' + tasks.length + "</span></div></div>";
    html += renderFilterBar(tasks);
    if (State.movedFromInbox.length > 0) {
      html += '<div class="cl-moved-banner">';
      html += "<span>" + State.movedFromInbox.length + " task" + (State.movedFromInbox.length > 1 ? "s" : "") + " moved out of the Inbox</span>";
      html += '<span class="cl-moved-ok" data-action="dismissMoved">OK</span>';
      html += "</div>";
    }
    html += renderQuickAdd("inbox");
    html += '<div class="cl-task-list">';
    var groups = {};
    var groupOrder = [];
    for (var i = 0; i < tasks.length; i++) {
      var key = tasks[i].sourceDate || "unknown";
      if (!groups[key]) {
        groups[key] = [];
        groupOrder.push(key);
      }
      groups[key].push(tasks[i]);
    }
    groupOrder.sort(function(a, b) {
      return b.localeCompare(a);
    });
    for (var gi = 0; gi < groupOrder.length; gi++) {
      var date = groupOrder[gi];
      html += '<div class="cl-group-header">' + formatDateHeader(date) + "</div>";
      var gTasks = groups[date];
      for (var ti = 0; ti < gTasks.length; ti++) {
        html += renderTaskRow(gTasks[ti], { showSource: false });
      }
    }
    html += "</div>";
    return html;
  }
  function renderTodayView() {
    var tasks = getFilteredTasks("today");
    var today = State.today;
    var html = '<div class="cl-view-header">';
    html += '<div class="cl-view-title"><span class="cl-view-icon">' + getViewIcon("today", 24) + "</span><h1>Today</h1>";
    html += '<span class="cl-view-count">' + tasks.length + "</span></div>";
    html += renderGroupingToggle("today");
    html += "</div>";
    html += renderFilterBar(tasks, "today");
    html += renderQuickAdd("today");
    html += '<div class="cl-task-list">';
    var overdue = [];
    var dayTasks = [];
    var eveningTasks = [];
    for (var i = 0; i < tasks.length; i++) {
      var t = tasks[i];
      var isEvening = t.tags && t.tags.indexOf("#evening") >= 0;
      if (t.scheduledDate && t.scheduledDate < today) overdue.push(t);
      else if (isEvening) eveningTasks.push(t);
      else dayTasks.push(t);
    }
    if (overdue.length > 0) {
      html += '<div class="cl-group-header cl-overdue-header"><span>Overdue</span><span class="cl-overdue-reschedule" data-action="rescheduleAllOverdue" title="Move all overdue tasks to today">Reschedule</span></div>';
      for (var oi = 0; oi < overdue.length; oi++) {
        html += renderTaskRow(overdue[oi], { isOverdue: true, showSource: true });
      }
    }
    html += renderGroupedTasks(dayTasks, State.grouping);
    if (eveningTasks.length > 0) {
      html += '<div class="cl-group-header cl-evening-header"><svg class="cl-evening-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><span>This Evening</span></div>';
      for (var ei = 0; ei < eveningTasks.length; ei++) {
        html += renderTaskRow(eveningTasks[ei], { showSource: true });
      }
    }
    html += "</div>";
    return html;
  }
  function renderUpcomingView() {
    var tasks = getFilteredTasks("upcoming");
    var html = '<div class="cl-view-header">';
    html += '<div class="cl-view-title"><span class="cl-view-icon">' + getViewIcon("upcoming", 24) + "</span><h1>Upcoming</h1></div></div>";
    html += renderFilterBar(tasks);
    html += renderQuickAdd("upcoming");
    html += '<div class="cl-task-list">';
    var dayTasks = [];
    var weekTasks = [];
    for (var i = 0; i < tasks.length; i++) {
      if (tasks[i].scheduledWeek && !tasks[i].scheduledDate) weekTasks.push(tasks[i]);
      else dayTasks.push(tasks[i]);
    }
    dayTasks.sort(function(a, b) {
      return (a.scheduledDate || "").localeCompare(b.scheduledDate || "");
    });
    var dayGroups = {};
    var dayOrder = [];
    for (var di = 0; di < dayTasks.length; di++) {
      var dk = dayTasks[di].scheduledDate || "unknown";
      if (!dayGroups[dk]) {
        dayGroups[dk] = [];
        dayOrder.push(dk);
      }
      dayGroups[dk].push(dayTasks[di]);
    }
    for (var dgi = 0; dgi < dayOrder.length; dgi++) {
      html += '<div class="cl-group-header cl-upcoming-date">' + formatUpcomingDateHeader(dayOrder[dgi]) + "</div>";
      var dg = dayGroups[dayOrder[dgi]];
      for (var dti = 0; dti < dg.length; dti++) {
        html += renderTaskRow(dg[dti], { showSource: true });
      }
    }
    weekTasks.sort(function(a, b) {
      return (a.scheduledWeek || "").localeCompare(b.scheduledWeek || "");
    });
    var weekGroups = {};
    var weekOrder = [];
    for (var wi = 0; wi < weekTasks.length; wi++) {
      var wk = weekTasks[wi].scheduledWeek || "unknown";
      if (!weekGroups[wk]) {
        weekGroups[wk] = [];
        weekOrder.push(wk);
      }
      weekGroups[wk].push(weekTasks[wi]);
    }
    for (var wgi = 0; wgi < weekOrder.length; wgi++) {
      html += '<div class="cl-group-header">' + formatWeekHeader(weekOrder[wgi]) + "</div>";
      var wg = weekGroups[weekOrder[wgi]];
      for (var wti = 0; wti < wg.length; wti++) {
        html += renderTaskRow(wg[wti], { showSource: true });
      }
    }
    html += "</div>";
    return html;
  }
  function renderAnytimeView() {
    var tasks = getFilteredTasks("anytime");
    var html = '<div class="cl-view-header">';
    html += '<div class="cl-view-title"><span class="cl-view-icon">' + getViewIcon("anytime", 24) + "</span><h1>Anytime</h1>";
    html += '<span class="cl-view-count">' + tasks.length + "</span></div>";
    html += renderGroupingToggle("anytime");
    html += "</div>";
    html += renderFilterBar(tasks, "anytime");
    html += renderQuickAdd("anytime");
    html += '<div class="cl-task-list">';
    html += renderGroupedTasks(tasks, State.grouping, { showStar: true });
    html += "</div>";
    return html;
  }
  function renderSomedayView() {
    var tasks = getFilteredTasks("someday");
    var pausedNotes = [];
    var somedayNotes = [];
    for (var sni = 0; sni < State.notes.length; sni++) {
      var sn = State.notes[sni];
      if (sn.status === "someday") somedayNotes.push(sn);
      else if (sn.status === "paused") pausedNotes.push(sn);
    }
    var totalCount = tasks.length + somedayNotes.length + pausedNotes.length;
    var html = '<div class="cl-view-header">';
    html += '<div class="cl-view-title"><span class="cl-view-icon">' + getViewIcon("someday", 24) + "</span><h1>Someday</h1>";
    html += '<span class="cl-view-count">' + totalCount + "</span></div>";
    html += renderGroupingToggle("someday");
    html += "</div>";
    html += renderFilterBar(tasks, "someday");
    html += renderQuickAdd("someday");
    function renderProjectGroup(label, list) {
      if (!list.length) return "";
      var out = '<div class="cl-someday-projects-title">' + esc(label) + "</div>";
      for (var spi = 0; spi < list.length; spi++) {
        var sn2 = list[spi];
        var sfolder = (sn2.filename || "").replace(/\/[^/]+$/, "");
        out += '<div class="cl-someday-project" data-action="jumpToProjectNote" data-filename="' + esc(sn2.filename) + '"><span class="cl-someday-project-icon">' + renderProjectIcon(sn2, 18) + '</span><span class="cl-someday-project-title">' + esc(sn2.title || "") + '</span><span class="cl-someday-project-folder">' + esc(sfolder) + "</span></div>";
      }
      return out;
    }
    if (pausedNotes.length || somedayNotes.length) {
      html += '<div class="cl-someday-projects">';
      html += renderProjectGroup("Paused", pausedNotes);
      html += renderProjectGroup("Someday", somedayNotes);
      html += "</div>";
    }
    html += '<div class="cl-task-list">';
    html += renderGroupedTasks(tasks, State.grouping, { dimmed: true });
    html += "</div>";
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
      if (pt === "open" || pt === "done" || pt === "cancelled") {
        taskCount++;
        if (pt === "done") doneCount++;
      }
    }
    var isArea = fm.type === "area";
    var html = '<div class="cl-view-header">';
    html += '<div class="cl-view-title">';
    var noteReviewDueDays = reviewDueDaysFromFm(fm);
    html += renderProjectIcon({
      noteType: isArea ? "area" : "project",
      bgColorDark: nc.bgColorDark,
      taskCount,
      doneCount,
      status: fm.status,
      reviewDueDays: noteReviewDueDays
    }, 24);
    html += '<h1 class="cl-note-title-link" data-action="openInEditor" data-filename="' + esc(nc.filename) + '">' + esc(nc.title) + "</h1>";
    html += '<div class="cl-project-menu-wrap">';
    html += '<button class="cl-refresh-btn cl-meta-btn" data-action="toggleProjectMenu" title="Project actions"><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg></button>';
    html += "</div>";
    html += "</div>";
    var folderPath = (nc.filename || "").replace(/\/[^/]+$/, "");
    html += '<div class="cl-note-breadcrumb">' + esc(folderPath) + (isArea ? "" : " &middot; " + doneCount + "/" + taskCount + " done") + "</div>";
    if (fm.due) {
      html += '<div class="cl-note-deadline" data-action="openNoteMetaModal" title="Edit deadline">' + buildDeadlineBadgeVerbose(fm.due) + "</div>";
    }
    html += '<div class="cl-note-filters">';
    html += '<div class="cl-filter-bar" style="padding:0;">';
    var statusFilters = ["all", "open", "done"];
    for (var sf = 0; sf < statusFilters.length; sf++) {
      var sfActive = (State.filters.noteStatus || "all") === statusFilters[sf] ? " cl-filter-active" : "";
      html += '<span class="cl-filter-pill' + sfActive + '" data-action="filterNoteStatus" data-status="' + statusFilters[sf] + '">' + capitalize(statusFilters[sf]) + "</span>";
    }
    html += "</div>";
    html += '<div class="cl-tasks-only-toggle' + (State.tasksOnly ? " cl-filter-active" : "") + '" data-action="toggleTasksOnly">' + (State.tasksOnly ? "\u2611" : "\u2610") + " Tasks only</div>";
    html += "</div>";
    html += "</div>";
    html += renderQuickAdd("note");
    html += '<div class="cl-task-list cl-note-content">';
    var skipUntilIndent = -1;
    var sectionStack = [];
    var firstH1Skipped = false;
    for (var pi = 0; pi < paras.length; pi++) {
      var p = paras[pi];
      if (pi === 0 && p.content === "---") {
        for (var fmi = 1; fmi < paras.length; fmi++) {
          if (paras[fmi].content === "---") {
            pi = fmi;
            break;
          }
        }
        continue;
      }
      if (!firstH1Skipped && p.type === "title" && p.headingLevel === 1) {
        firstH1Skipped = true;
        continue;
      }
      var pIndent = p.indentLevel || 0;
      if (pIndent === 0 && p.rawContent) {
        var tabMatch = p.rawContent.match(/^\t+/);
        if (tabMatch) pIndent = tabMatch[0].length;
      }
      var isTask = p.type === "open" || p.type === "done" || p.type === "cancelled";
      var isChecklist = p.type === "checklist" || p.type === "checklistDone" || p.type === "checklistCancelled";
      var isHeading = p.type === "title";
      if (skipUntilIndent >= 0) {
        if (pIndent > skipUntilIndent) continue;
        skipUntilIndent = -1;
      }
      if (State.tasksOnly && !isTask && !isChecklist && !isHeading) continue;
      if (State.filters.noteStatus && State.filters.noteStatus !== "all" && (isTask || isChecklist)) {
        var taskStatus = p.type === "done" || p.type === "checklistDone" ? "done" : p.type === "open" || p.type === "checklist" ? "open" : "cancelled";
        if (State.filters.noteStatus !== taskStatus) continue;
      }
      if (!isTask && !isChecklist && !isHeading) {
        var rawTrim0 = (p.rawContent || p.content || "").trim();
        if (rawTrim0.charAt(0) === "|" && rawTrim0.length > 1) {
          var tableLines = [];
          var endIdx = pi;
          for (var tli = pi; tli < paras.length; tli++) {
            var tRaw = (paras[tli].rawContent || paras[tli].content || "").trim();
            if (tRaw.charAt(0) !== "|") break;
            tableLines.push(tRaw);
            endIdx = tli;
          }
          if (tableLines.length >= 2 && isTableSeparatorLine(tableLines[1])) {
            if (State.tasksOnly) {
              pi = endIdx;
              continue;
            }
            html += renderMarkdownTable(tableLines);
            pi = endIdx;
            continue;
          }
        }
      }
      if (isHeading) {
        var hLevel = p.headingLevel || 1;
        while (sectionStack.length > 0 && sectionStack[sectionStack.length - 1].level >= hLevel) {
          html += "</div>";
          sectionStack.pop();
        }
        var hRawContent = p.content || "";
        var hCollapsed = /\u2026\s*$/.test(hRawContent);
        var hDisplay = hRawContent.replace(/\s*\u2026\s*$/, "");
        var hClass = State.tasksOnly ? "cl-section-heading" : "cl-note-heading cl-note-h" + hLevel;
        var chevronDir = hCollapsed ? "right" : "down";
        html += '<div class="' + hClass + '" data-line-index="' + p.lineIndex + '">';
        html += '<span class="cl-heading-text">' + renderInlineMarkdown(hDisplay) + "</span>";
        html += '<span class="cl-heading-toggle' + (hCollapsed ? " cl-always-visible" : "") + '" data-action="toggleHeadingCollapse" data-line-index="' + p.lineIndex + '" title="Toggle collapse">';
        html += '<svg width="10" height="10" viewBox="0 0 10 10" class="cl-heading-chevron cl-chevron-' + chevronDir + '"><polyline points="2,3 5,7 8,3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
        html += "</span>";
        html += "</div>";
        html += '<div class="cl-section-body"' + (hCollapsed ? ' style="display:none"' : "") + ' data-heading-line="' + p.lineIndex + '">';
        sectionStack.push({ level: hLevel, collapsed: hCollapsed });
      } else if (isTask || isChecklist) {
        var parsed = parseTaskContentClient(p.content);
        var status = p.type === "done" || p.type === "checklistDone" ? "done" : p.type === "cancelled" || p.type === "checklistCancelled" ? "cancelled" : "open";
        var raw = (p.rawContent || "").trimStart();
        var children = [];
        for (var chi = pi + 1; chi < paras.length; chi++) {
          if ((paras[chi].indentLevel || 0) <= pIndent) break;
          var cp = paras[chi];
          var cpType = cp.type;
          if (cpType === "open" || cpType === "done" || cpType === "cancelled") {
            var cpParsed = parseTaskContentClient(cp.content || "");
            children.push({ type: "task", content: cpParsed.cleanContent, rawContent: cp.content, status: cpType === "done" ? "done" : cpType === "cancelled" ? "cancelled" : "open", lineIndex: cp.lineIndex, id: nc.filename + ":" + cp.lineIndex, priority: cpParsed.priority, scheduledDate: cpParsed.scheduledDate, scheduledWeek: cpParsed.scheduledWeek, tags: cpParsed.tags, mentions: cpParsed.mentions });
          } else if (cpType === "checklist" || cpType === "checklistDone" || cpType === "checklistCancelled") {
            children.push({ type: "checklist", content: cp.content || "", status: cpType === "checklistDone" ? "done" : cpType === "checklistCancelled" ? "cancelled" : "open", lineIndex: cp.lineIndex });
          } else {
            children.push({ type: "note", content: cp.content || "", lineIndex: cp.lineIndex });
          }
        }
        if (children.length > 0) skipUntilIndent = pIndent;
        var taskObj = {
          id: nc.filename + ":" + p.lineIndex,
          content: parsed.cleanContent,
          rawContent: p.content,
          type: isChecklist ? "checklist" : "task",
          status,
          priority: parsed.priority,
          scheduledDate: parsed.scheduledDate,
          scheduledWeek: parsed.scheduledWeek,
          tags: parsed.tags,
          mentions: parsed.mentions,
          repeat: parsed.repeat,
          isDelegated: !isChecklist && raw.startsWith("+"),
          noteFilename: nc.filename,
          noteTitle: nc.title,
          folderPath: "",
          folderName: "",
          lineIndex: p.lineIndex,
          children
        };
        var indent = pIndent * 20;
        if (indent > 0) html += '<div class="cl-indent-wrap" style="padding-left:' + indent + 'px;">';
        var taskOverdue = status === "open" && taskObj.scheduledDate && taskObj.scheduledDate < State.today;
        var taskFuture = status === "open" && taskObj.scheduledDate && taskObj.scheduledDate > State.today;
        html += renderTaskRow(taskObj, { showSource: false, lineIndex: p.lineIndex, indentLevel: pIndent, childCount: children.length, showStar: true, isOverdue: taskOverdue, alwaysShowDate: true, dimmed: taskFuture });
        if (indent > 0) html += "</div>";
      } else {
        var indent = pIndent * 20;
        var isList = p.type === "list" || p.type === "list-bullet";
        if (!isList && p.rawContent) {
          var rawTrim = p.rawContent.trimStart();
          if (/^[-*]\s+(?!\[)/.test(rawTrim)) isList = true;
        }
        var isNumbered = false;
        var numLabel = "";
        if (!isList && p.rawContent) {
          var numMatch = p.rawContent.trimStart().match(/^(\d+)\.\s+/);
          if (numMatch) {
            isNumbered = true;
            numLabel = numMatch[1] + ".";
          }
        }
        if (isList) {
          html += '<div class="cl-note-list-item" style="padding-left:' + indent + 'px;"><span class="cl-bullet">\u2022</span><span>' + renderInlineMarkdown(p.content) + "</span></div>";
        } else if (isNumbered) {
          html += '<div class="cl-note-list-item" style="padding-left:' + indent + 'px;"><span class="cl-num-marker">' + numLabel + "</span><span>" + renderInlineMarkdown(p.content) + "</span></div>";
        } else if (p.type === "quote" || p.content && p.content.match(/^\s*>\s/)) {
          var quoteText = (p.content || "").replace(/^\s*>\s?/, "");
          html += '<div class="cl-note-quote" style="margin-left:' + indent + 'px;">' + renderInlineMarkdown(quoteText) + "</div>";
        } else {
          html += '<div class="cl-note-para" style="padding-left:' + indent + 'px;">' + renderInlineMarkdown(p.content) + "</div>";
        }
      }
    }
    while (sectionStack.length > 0) {
      html += "</div>";
      sectionStack.pop();
    }
    html += "</div>";
    if (isReviewDue(noteReviewDueDays, fm.status)) {
      var label = reviewDueLabel(noteReviewDueDays, !!fm.reviewed);
      html += '<div class="cl-review-footer"><span class="cl-review-due-label">' + esc(label) + '</span><button class="cl-review-mark-btn" type="button" data-action="markReviewedFromFooter">Mark as Reviewed</button></div>';
    }
    return html;
  }
  function parseTaskContentClient(content) {
    var result = { priority: 0, scheduledDate: null, scheduledWeek: null, tags: [], mentions: [], repeat: null, cleanContent: "" };
    var c = content || "";
    var rm = c.match(/@repeat\(([^)]*)\)/);
    if (rm) result.repeat = rm[1];
    if (c.startsWith("!!! ")) {
      result.priority = 3;
      c = c.substring(4);
    } else if (c.startsWith("!! ")) {
      result.priority = 2;
      c = c.substring(3);
    } else if (c.startsWith("! ")) {
      result.priority = 1;
      c = c.substring(2);
    }
    var dm = c.match(/\s*>(\d{4}-\d{2}-\d{2})/);
    if (dm) result.scheduledDate = dm[1];
    var wm = c.match(/\s*>(\d{4}-W\d{2})/);
    if (wm) result.scheduledWeek = wm[1];
    var tagMatches = c.match(/#[\p{L}\p{N}_\-\/]+/gu);
    if (tagMatches) result.tags = tagMatches;
    var menMatches = c.match(/@[\p{L}\p{N}_\-]+/gu);
    if (menMatches) {
      for (var i = 0; i < menMatches.length; i++) {
        if (!menMatches[i].startsWith("@done") && !menMatches[i].startsWith("@due") && !menMatches[i].startsWith("@repeat")) result.mentions.push(menMatches[i]);
      }
    }
    var clean = c;
    clean = clean.replace(/\s*>(\d{4}-\d{2}-\d{2})(\s+\d{1,2}:\d{2}\s*(AM|PM)(\s*-\s*\d{1,2}:\d{2}\s*(AM|PM))?)?/gi, "");
    clean = clean.replace(/\s*>\d{4}-W\d{2}/g, "");
    clean = clean.replace(/\s*@done\([^)]*\)/g, "");
    clean = clean.replace(/\s*@repeat\([^)]*\)/g, "");
    result.cleanContent = clean.trim();
    return result;
  }
  var _mainListenersAttached = false;
  function attachMainEventListeners() {
    if (_mainListenersAttached) return;
    var main = document.getElementById("cl-main");
    if (!main) return;
    _mainListenersAttached = true;
    main.addEventListener("dblclick", function(e) {
      if (e.target.closest(".cl-cb") || e.target.closest(".cl-task-editor")) return;
      var row = e.target.closest(".cl-task-row");
      if (row) {
        e.preventDefault();
        expandTask(row.dataset.taskId);
      }
    });
    main.addEventListener("click", function(e) {
      if (consumeDragClickSuppression()) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      if (e.target.closest("a.cl-link")) return;
      var clickedRow = e.target.closest(".cl-task-row");
      if (clickedRow && !e.target.closest(".cl-cb") && !e.target.closest("[data-action]")) {
        var rows = document.querySelectorAll(".cl-task-row");
        for (var ri = 0; ri < rows.length; ri++) {
          rows[ri].classList.remove("cl-focused");
          if (rows[ri] === clickedRow) State.focusedTaskIndex = ri;
        }
        clickedRow.classList.add("cl-focused");
      }
      var target = e.target.closest("[data-action]");
      if (!target) {
        return;
      }
      var action = target.dataset.action;
      switch (action) {
        case "toggle":
          var taskRow = target.closest(".cl-task-row");
          if (taskRow) toggleTask(taskRow.dataset.taskId);
          break;
        case "filterTag": {
          var newTag = target.dataset.tag || null;
          State.filters.tag = newTag && State.filters.tag === newTag ? null : newTag;
          saveCurrentViewPrefs();
          persistViewPrefs();
          renderCurrentView();
          break;
        }
        case "filterFolder": {
          var newFolder = target.dataset.folder || null;
          State.filters.folder = newFolder && State.filters.folder === newFolder ? null : newFolder;
          saveCurrentViewPrefs();
          persistViewPrefs();
          renderCurrentView();
          break;
        }
        case "clearTaskFilters":
          State.filters.tag = null;
          State.filters.folder = null;
          saveCurrentViewPrefs();
          persistViewPrefs();
          renderCurrentView();
          break;
        case "filterNoteStatus":
          State.filters.noteStatus = target.dataset.status || "all";
          saveCurrentViewPrefs();
          persistViewPrefs();
          renderCurrentView();
          break;
        case "toggleTasksOnly":
          State.tasksOnly = !State.tasksOnly;
          saveCurrentViewPrefs();
          persistViewPrefs();
          renderCurrentView();
          break;
        case "setGrouping":
          State.grouping = target.dataset.grouping || "note";
          saveCurrentViewPrefs();
          persistViewPrefs();
          renderCurrentView();
          break;
        case "openInEditor":
          if (target.dataset.filename) {
            sendMessageToPlugin("openNoteInEditor", JSON.stringify({ filename: target.dataset.filename }));
          }
          break;
        case "jumpToProjectNote": {
          var jfn = target.dataset.filename;
          if (!jfn) break;
          var inSidebar = false;
          for (var jpi = 0; jpi < State.notes.length; jpi++) {
            if (State.notes[jpi].filename === jfn) {
              inSidebar = true;
              break;
            }
          }
          if (inSidebar) {
            navigateToProjectNote(jfn);
            break;
          }
          sendMessageToPlugin("openNoteInEditor", JSON.stringify({ filename: jfn }));
          break;
        }
        case "openNoteMetaModal":
          closeProjectMenu();
          openNoteMetaModal();
          break;
        case "markReviewedFromFooter": {
          var nc = State.noteContent;
          if (!nc) break;
          sendMessageToPlugin("updateNoteFrontmatter", JSON.stringify({
            filename: nc.filename,
            updates: { reviewed: State.today }
          }));
          var footer = target.closest(".cl-review-footer");
          if (footer) footer.remove();
          break;
        }
        case "toggleProjectMenu":
          toggleProjectMenu(target);
          break;
        case "refreshProject": {
          var rfn = target.dataset.filename || State.currentNoteFilename;
          if (!rfn) break;
          closeProjectMenu();
          target.classList.add("cl-spinning");
          sendMessageToPlugin("refreshProject", JSON.stringify({ filename: rfn }));
          sendMessageToPlugin("requestNoteContent", JSON.stringify({ filename: rfn }));
          break;
        }
        case "archiveProject":
          closeProjectMenu();
          confirmArchiveProject();
          break;
        case "rescheduleAllOverdue": {
          var today = State.today;
          var moved = 0;
          for (var rai = 0; rai < State.tasks.length; rai++) {
            var t = State.tasks[rai];
            if (t.status === "open" && t.scheduledDate && t.scheduledDate < today) {
              rescheduleTaskById(t.id, today);
              moved++;
            }
          }
          if (moved > 0) renderCurrentView();
          break;
        }
        case "dismissMoved":
          State.movedFromInbox = [];
          renderCurrentView();
          break;
        case "toggleHeadingCollapse": {
          var lineIdx = parseInt(target.dataset.lineIndex, 10);
          if (isNaN(lineIdx) || !State.currentNoteFilename) break;
          var body = document.querySelector('.cl-section-body[data-heading-line="' + lineIdx + '"]');
          if (body) {
            var nowHidden = body.style.display !== "none";
            body.style.display = nowHidden ? "none" : "";
            var svg = target.querySelector(".cl-heading-chevron");
            if (svg) {
              svg.classList.toggle("cl-chevron-right", nowHidden);
              svg.classList.toggle("cl-chevron-down", !nowHidden);
            }
            target.classList.toggle("cl-always-visible", nowHidden);
          }
          sendMessageToPlugin("toggleHeadingCollapse", JSON.stringify({
            filename: State.currentNoteFilename,
            lineIndex: lineIdx
          }));
          break;
        }
      }
    });
    main.addEventListener("keydown", function(e) {
      if (e.key === "Enter" && e.target.classList.contains("cl-quick-add-input")) {
        e.preventDefault();
        var content = e.target.value.trim();
        if (!content) return;
        var view = e.target.closest(".cl-quick-add").dataset.view;
        var todayFilename = State.today.replace(/-/g, "") + ".md";
        var targetFilename = view === "note" && State.currentNoteFilename ? State.currentNoteFilename : todayFilename;
        var msg = { filename: targetFilename, content };
        if (view === "today") msg.scheduledDate = State.today;
        if (view === "someday") msg.tags = ["#someday"];
        if (view === "note") msg.prepend = true;
        sendMessageToPlugin("createTask", JSON.stringify(msg));
        e.target.value = "";
      }
    });
  }
  function toggleTaskTagById(taskId, tag, add) {
    if (!taskId || !tag) return;
    var parts = taskId.split(":");
    var filename = parts.slice(0, -1).join(":");
    var lineIndex = parseInt(parts[parts.length - 1]);
    if (isNaN(lineIndex)) return;
    for (var i = 0; i < State.tasks.length; i++) {
      if (State.tasks[i].id === taskId) {
        var tags = State.tasks[i].tags || [];
        if (add) {
          if (tags.indexOf(tag) < 0) tags = tags.concat([tag]);
        } else {
          tags = tags.filter(function(t) {
            return t !== tag;
          });
        }
        State.tasks[i].tags = tags;
        break;
      }
    }
    renderCurrentView();
    sendMessageToPlugin("setTaskTag", JSON.stringify({
      filename,
      lineIndex,
      tag,
      add: !!add
    }));
  }
  function rescheduleTaskById(taskId, dateStr) {
    if (!taskId) return;
    var parts = taskId.split(":");
    var filename = parts.slice(0, -1).join(":");
    var lineIndex = parseInt(parts[parts.length - 1]);
    if (isNaN(lineIndex)) return;
    for (var i = 0; i < State.tasks.length; i++) {
      if (State.tasks[i].id === taskId) {
        State.tasks[i].scheduledDate = dateStr || null;
        State.tasks[i].scheduledWeek = null;
        break;
      }
    }
    renderCurrentView();
    sendMessageToPlugin("rescheduleTask", JSON.stringify({
      filename,
      lineIndex,
      scheduledDate: dateStr || null,
      scheduledWeek: null
    }));
  }
  function getFocusedTaskId() {
    if (State.focusedTaskIndex < 0) return null;
    var rows = document.querySelectorAll(".cl-task-row");
    if (!rows[State.focusedTaskIndex]) return null;
    return rows[State.focusedTaskIndex].dataset.taskId || null;
  }
  function toggleTask(taskId) {
    if (!taskId) return;
    for (var i = 0; i < State.tasks.length; i++) {
      if (State.tasks[i].id === taskId) {
        State.tasks[i].status = State.tasks[i].status === "open" ? "done" : "open";
        break;
      }
    }
    renderCurrentView();
    renderSidebar();
    var parts = taskId.split(":");
    var filename = parts.slice(0, -1).join(":");
    var lineIndex = parseInt(parts[parts.length - 1]);
    sendMessageToPlugin("toggleTask", JSON.stringify({ filename, lineIndex }));
  }
  function expandTask(taskId) {
    if (!taskId) return;
    if (State.expandedTaskId === taskId) {
      collapseTask();
      return;
    }
    var task = null;
    for (var i = 0; i < State.tasks.length; i++) {
      if (State.tasks[i].id === taskId) {
        task = State.tasks[i];
        break;
      }
    }
    if (!task) return;
    collapseTask();
    State.expandedTaskId = taskId;
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
      trailingTags,
      moveToFilename: null,
      notes: [],
      checklists: []
    };
    for (var ci = 0; ci < task.children.length; ci++) {
      var child = task.children[ci];
      if (child.type === "note") State.editDraft.notes.push({ content: child.content, rawContent: child.rawContent || child.content, lineIndex: child.lineIndex });
      else if (child.type === "checklist") State.editDraft.checklists.push({ content: child.content, status: child.status, lineIndex: child.lineIndex });
    }
    State.editDraft.activeField = null;
    var row = document.querySelector('.cl-task-row[data-task-id="' + CSS.escape(taskId) + '"]');
    if (!row) return;
    row.style.display = "none";
    var editor = document.createElement("div");
    editor.className = "cl-task-editor";
    editor.id = "cl-editor";
    editor.innerHTML = renderTaskEditorHTML(task);
    row.parentNode.insertBefore(editor, row.nextSibling);
    var subTasks = task.children.filter(function(c) {
      return c.type === "task";
    });
    for (var si = subTasks.length - 1; si >= 0; si--) {
      var subRow = document.createElement("div");
      subRow.className = "cl-subtask-row";
      subRow.innerHTML = renderTaskRow(subTasks[si], { showSource: false });
      editor.parentNode.insertBefore(subRow, editor.nextSibling);
    }
    attachEditorListeners(editor);
  }
  function collapseTask() {
    if (!State.expandedTaskId) return;
    var editor = document.getElementById("cl-editor");
    if (editor) {
      var taskId = State.expandedTaskId;
      var row = document.querySelector('.cl-task-row[data-task-id="' + CSS.escape(taskId) + '"]');
      if (row) row.style.display = "";
      var subRows = document.querySelectorAll(".cl-subtask-row");
      for (var i = 0; i < subRows.length; i++) subRows[i].remove();
      editor.remove();
    }
    State.expandedTaskId = null;
    State.editDraft = null;
  }
  function renderTaskEditorHTML(task) {
    var draft = State.editDraft;
    var html = "";
    html += '<div class="cl-editor-row">';
    var editorCbClass = task.type === "checklist" ? "cl-cb cl-cb-square" : "cl-cb";
    html += '<div class="' + editorCbClass + '" data-action="toggle"></div>';
    if (draft.activeField === "title") {
      html += '<input class="cl-editor-title cl-editor-field-active" value="' + esc(draft.content) + '" data-field="title"/>';
    } else {
      html += '<div class="cl-editor-title-view" data-field-view="title">' + renderInlineMarkdown(draft.content) + "</div>";
    }
    html += "</div>";
    var notesForEdit = draft.notes.map(function(n) {
      return n.content || "";
    }).join("\n");
    html += '<div class="cl-editor-section">';
    if (draft.activeField === "notes") {
      html += '<textarea class="cl-editor-notes cl-editor-field-active" data-field="notes">' + esc(notesForEdit) + "</textarea>";
    } else if (notesForEdit.trim()) {
      html += '<div class="cl-editor-notes-view" data-field-view="notes">' + renderNotesMarkdown(draft.notes) + "</div>";
    } else {
      html += '<div class="cl-editor-notes-view cl-editor-notes-empty" data-field-view="notes">Notes...</div>';
    }
    html += "</div>";
    if (draft.checklists.length > 0) {
      html += '<div class="cl-editor-section">';
      html += '<div class="cl-editor-label">Checklist</div>';
      for (var ci = 0; ci < draft.checklists.length; ci++) {
        var cl = draft.checklists[ci];
        var clDone = cl.status === "done" ? " cl-cl-done" : "";
        html += '<div class="cl-checklist-item' + clDone + '" data-index="' + ci + '">';
        html += '<div class="cl-cl-check" data-action="toggleChecklist"></div>';
        html += '<span class="cl-cl-text">' + esc(cl.content) + "</span>";
        html += "</div>";
      }
      html += "</div>";
    }
    html += '<div class="cl-editor-meta">';
    var dateLabel = "Schedule...";
    if (draft.scheduledDate) dateLabel = formatShortDate(draft.scheduledDate);
    else if (draft.scheduledWeek) dateLabel = draft.scheduledWeek;
    html += '<div class="cl-meta-chip" data-action="openDatePicker"><span class="cl-meta-icon">\u{1F4C5}</span>' + dateLabel + "</div>";
    if (task.noteFilename) {
      var noteLabel = draft.moveToFilename ? esc(draft.moveToLabel || "Moved") : esc(task.noteTitle);
      html += '<div class="cl-meta-chip" data-action="jumpToProjectNote" data-filename="' + esc(task.noteFilename) + '"><span class="cl-meta-icon">\u{1F4C1}</span>' + noteLabel + "</div>";
    }
    html += '<div class="cl-meta-chip cl-meta-add" data-action="openNotePicker">\u2192 Move to...</div>';
    for (var ti = 0; ti < draft.tags.length; ti++) {
      html += '<div class="cl-meta-chip cl-meta-tag" data-action="removeTag" data-tag="' + esc(draft.tags[ti]) + '">' + esc(draft.tags[ti]) + ' <span class="cl-remove">\xD7</span></div>';
    }
    html += '<div class="cl-meta-chip cl-meta-add" data-action="addTag">+ tag</div>';
    for (var mi = 0; mi < draft.mentions.length; mi++) {
      html += '<div class="cl-meta-chip cl-meta-mention">' + esc(draft.mentions[mi]) + "</div>";
    }
    html += '<div class="cl-meta-chip cl-meta-add" data-action="addMention">+ @mention</div>';
    var priLabels = ["\u2014", "!", "!!", "!!!"];
    html += '<div class="cl-meta-chip cl-meta-pri cl-pri-' + draft.priority + '" data-action="cyclePri">' + priLabels[draft.priority] + "</div>";
    html += "</div>";
    html += '<div class="cl-editor-hints">\u2318Enter save \xB7 Esc cancel \xB7 \u2318T today \xB7 \u2318O remove date</div>';
    html += '<div class="cl-editor-actions"><button class="cl-editor-btn cl-editor-btn-cancel" data-action="editorCancel">Cancel</button><button class="cl-editor-btn cl-editor-btn-save" data-action="editorSave">Save</button></div>';
    return html;
  }
  function renderNotesMarkdown(notes) {
    var html = "";
    for (var i = 0; i < notes.length; i++) {
      var raw = notes[i].rawContent || notes[i].content || "";
      raw = raw.replace(/^\t+/, "");
      if (raw.match(/^>\s?/)) {
        html += '<div class="cl-editor-note-line cl-note-quote" style="margin:2px 0;">' + renderInlineMarkdown(raw.replace(/^>\s?/, "")) + "</div>";
      } else if (raw.match(/^[-*]\s+/)) {
        html += '<div class="cl-editor-note-line">\u2022 ' + renderInlineMarkdown(raw.replace(/^[-*]\s+/, "")) + "</div>";
      } else {
        html += '<div class="cl-editor-note-line">' + renderInlineMarkdown(raw) + "</div>";
      }
    }
    return html;
  }
  function activateEditorField(fieldName) {
    if (!State.editDraft) return;
    saveActiveFieldValue();
    State.editDraft.activeField = fieldName;
    var task = null;
    for (var i = 0; i < State.tasks.length; i++) {
      if (State.tasks[i].id === State.expandedTaskId) {
        task = State.tasks[i];
        break;
      }
    }
    if (!task) return;
    var editor = document.getElementById("cl-editor");
    if (!editor) return;
    editor.innerHTML = renderTaskEditorHTML(task);
    attachEditorListeners(editor);
    if (fieldName === "title") {
      var el = editor.querySelector(".cl-editor-title");
      if (el) {
        el.focus();
        el.select();
      }
    } else if (fieldName === "notes") {
      var el = editor.querySelector(".cl-editor-notes");
      if (el) {
        el.focus();
      }
    }
  }
  function saveActiveFieldValue() {
    if (!State.editDraft) return;
    var editor = document.getElementById("cl-editor");
    if (!editor) return;
    if (State.editDraft.activeField === "title") {
      var titleEl = editor.querySelector(".cl-editor-title");
      if (titleEl) State.editDraft.content = titleEl.value;
    } else if (State.editDraft.activeField === "notes") {
      var notesEl = editor.querySelector(".cl-editor-notes");
      if (notesEl) {
        var lines = notesEl.value.split("\n");
        State.editDraft.notes = lines.map(function(l, i) {
          var orig = State.editDraft.notes[i];
          return { content: l, rawContent: orig ? orig.rawContent : "	" + l, lineIndex: orig ? orig.lineIndex : -1 };
        });
      }
    }
  }
  function attachEditorListeners(editor) {
    editor.addEventListener("click", function(e) {
      var viewField = e.target.closest("[data-field-view]");
      if (viewField) {
        activateEditorField(viewField.dataset.fieldView);
        return;
      }
      var target = e.target.closest("[data-action]");
      if (!target) return;
      var action = target.dataset.action;
      switch (action) {
        case "toggleChecklist":
          var item = target.closest(".cl-checklist-item");
          if (item) {
            var idx = parseInt(item.dataset.index);
            if (State.editDraft.checklists[idx]) {
              State.editDraft.checklists[idx].status = State.editDraft.checklists[idx].status === "done" ? "open" : "done";
              item.classList.toggle("cl-cl-done");
            }
          }
          break;
        case "cyclePri":
          State.editDraft.priority = (State.editDraft.priority + 1) % 4;
          var priLabels = ["\u2014", "!", "!!", "!!!"];
          target.textContent = priLabels[State.editDraft.priority];
          target.className = "cl-meta-chip cl-meta-pri cl-pri-" + State.editDraft.priority;
          break;
        case "removeTag":
          var tag = target.dataset.tag;
          State.editDraft.tags = State.editDraft.tags.filter(function(t) {
            return t !== tag;
          });
          target.remove();
          break;
        case "addTag":
          showInlineInput(target, "#", function(val) {
            if (!val.startsWith("#")) val = "#" + val;
            State.editDraft.tags.push(val);
            reRenderEditorMeta();
          });
          break;
        case "addMention":
          showInlineInput(target, "@", function(val) {
            if (!val.startsWith("@")) val = "@" + val;
            State.editDraft.mentions.push(val);
            reRenderEditorMeta();
          });
          break;
        case "openDatePicker":
          showDatePicker(target);
          break;
        case "openNotePicker":
          showNotePicker(target);
          break;
        case "editorSave":
          saveExpandedTask();
          break;
        case "editorCancel":
          collapseTask();
          break;
      }
    });
    editor.addEventListener("keydown", function(e) {
      if (e.key === "Tab") {
        e.preventDefault();
        e.stopPropagation();
        var current = State.editDraft.activeField;
        if (current === "title") {
          activateEditorField("notes");
        } else if (current === "notes") {
          activateEditorField("title");
        } else {
          activateEditorField("title");
        }
      }
    });
  }
  function reRenderEditorMeta() {
    var task = null;
    for (var i = 0; i < State.tasks.length; i++) {
      if (State.tasks[i].id === State.expandedTaskId) {
        task = State.tasks[i];
        break;
      }
    }
    if (!task) return;
    var editor = document.getElementById("cl-editor");
    if (editor) {
      var titleVal = "";
      var notesVal = "";
      var titleEl = editor.querySelector(".cl-editor-title");
      var notesEl = editor.querySelector(".cl-editor-notes");
      if (titleEl) titleVal = titleEl.value;
      if (notesEl) notesVal = notesEl.value;
      editor.innerHTML = renderTaskEditorHTML(task);
      titleEl = editor.querySelector(".cl-editor-title");
      notesEl = editor.querySelector(".cl-editor-notes");
      if (titleEl) titleEl.value = titleVal;
      if (notesEl) notesEl.value = notesVal;
      attachEditorListeners(editor);
    }
  }
  function saveExpandedTask() {
    if (!State.expandedTaskId || !State.editDraft) return;
    saveActiveFieldValue();
    var draft = State.editDraft;
    var taskId = State.expandedTaskId;
    var parts = taskId.split(":");
    var filename = parts.slice(0, -1).join(":");
    var lineIndex = parseInt(parts[parts.length - 1]);
    var msg = {
      filename,
      lineIndex,
      content: draft.content,
      priority: draft.priority,
      scheduledDate: draft.scheduledDate,
      scheduledWeek: draft.scheduledWeek,
      tags: draft.tags,
      mentions: draft.mentions,
      notes: draft.notes,
      checklists: draft.checklists,
      moveToFilename: draft.moveToFilename
    };
    sendMessageToPlugin("saveTask", JSON.stringify(msg));
    if (draft.moveToFilename && State.currentView === "inbox") {
      State.movedFromInbox.push(taskId);
    }
    collapseTask();
  }
  function positionPickerVertically(picker, anchor, margin) {
    if (margin == null) margin = 4;
    var rect = anchor.getBoundingClientRect();
    var pickerHeight = picker.getBoundingClientRect().height;
    var viewportHeight = window.innerHeight;
    var spaceBelow = viewportHeight - rect.bottom - margin;
    var spaceAbove = rect.top - margin;
    if (pickerHeight > spaceBelow && spaceAbove > spaceBelow) {
      picker.style.top = Math.max(margin, rect.top - pickerHeight - margin) + "px";
    } else {
      picker.style.top = rect.bottom + margin + "px";
    }
  }
  function showDatePicker(anchor) {
    closePickers();
    var rect = anchor.getBoundingClientRect();
    var picker = document.createElement("div");
    picker.className = "cl-picker cl-date-picker";
    picker.style.top = rect.bottom + 4 + "px";
    picker.style.left = Math.min(rect.left, window.innerWidth - 270) + "px";
    var today = State.today;
    var tmr = addDays(today, 1);
    var nextMon = getNextMonday(today);
    var inAWeek = addDays(today, 7);
    picker.innerHTML = '<div class="cl-picker-tabs"><div class="cl-picker-tab cl-picker-tab-active" data-tab="day">Day</div><div class="cl-picker-tab" data-tab="week">Week</div></div><div class="cl-picker-body" id="cl-date-body">' + renderDateDayTab(today, tmr, nextMon, inAWeek) + '</div><div class="cl-picker-footer"><div class="cl-picker-action" data-action="removeDate"><span>\u2715</span> Remove date <span class="cl-shortcut">\u2318O</span></div></div>';
    document.body.appendChild(picker);
    positionPickerVertically(picker, anchor);
    picker.addEventListener("click", function(e) {
      var target = e.target.closest("[data-action]");
      if (!target) {
        var tab = e.target.closest("[data-tab]");
        if (tab) {
          var tabs = picker.querySelectorAll(".cl-picker-tab");
          for (var i = 0; i < tabs.length; i++) tabs[i].classList.remove("cl-picker-tab-active");
          tab.classList.add("cl-picker-tab-active");
          var body = picker.querySelector("#cl-date-body");
          if (tab.dataset.tab === "day") body.innerHTML = renderDateDayTab(today, tmr, nextMon, inAWeek);
          else body.innerHTML = renderDateWeekTab();
        }
        return;
      }
      if (target.dataset.action === "selectDate") {
        State.editDraft.scheduledDate = target.dataset.date;
        State.editDraft.scheduledWeek = null;
        State.editDraft.tags = State.editDraft.tags.filter(function(t) {
          return t !== "#someday";
        });
        updateDateChip();
        closePickers();
      } else if (target.dataset.action === "selectWeek") {
        State.editDraft.scheduledWeek = target.dataset.week;
        State.editDraft.scheduledDate = null;
        State.editDraft.tags = State.editDraft.tags.filter(function(t) {
          return t !== "#someday";
        });
        updateDateChip();
        closePickers();
      } else if (target.dataset.action === "removeDate") {
        State.editDraft.scheduledDate = null;
        State.editDraft.scheduledWeek = null;
        updateDateChip();
        closePickers();
      }
    });
  }
  function renderDateDayTab(today, tmr, nextMon, inAWeek) {
    var html = '<div class="cl-picker-options">';
    html += '<div class="cl-picker-option cl-picker-today" data-action="selectDate" data-date="' + today + '"><span>\u2B50</span><span class="cl-picker-opt-label">Today</span><span class="cl-picker-opt-date">' + formatShortDate(today) + "</span></div>";
    html += '<div class="cl-picker-option" data-action="selectDate" data-date="' + tmr + '"><span>\u2192</span><span class="cl-picker-opt-label">Tomorrow</span><span class="cl-picker-opt-date">' + formatShortDate(tmr) + "</span></div>";
    html += '<div class="cl-picker-option" data-action="selectDate" data-date="' + nextMon + '"><span>\u{1F4C5}</span><span class="cl-picker-opt-label">Next Monday</span><span class="cl-picker-opt-date">' + formatShortDate(nextMon) + "</span></div>";
    html += '<div class="cl-picker-option" data-action="selectDate" data-date="' + inAWeek + '"><span>+7</span><span class="cl-picker-opt-label">In a week</span><span class="cl-picker-opt-date">' + formatShortDate(inAWeek) + "</span></div>";
    html += "</div>";
    html += '<div class="cl-picker-divider"></div>';
    html += renderMiniCalendar(today);
    return html;
  }
  function renderMiniCalendar(todayStr) {
    var parts = todayStr.split("-");
    var year = parseInt(parts[0]);
    var month = parseInt(parts[1]) - 1;
    var months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    var firstDay = new Date(year, month, 1);
    var startOffset = (firstDay.getDay() + 6) % 7;
    var daysInMonth = new Date(year, month + 1, 0).getDate();
    var html = '<div class="cl-mini-cal">';
    html += '<div class="cl-cal-nav"><span class="cl-cal-arrow">\u25C0</span><span class="cl-cal-month">' + months[month] + " " + year + '</span><span class="cl-cal-arrow">\u25B6</span></div>';
    html += '<div class="cl-cal-grid">';
    var dayNames = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
    for (var di = 0; di < 7; di++) html += '<span class="cl-cal-day-name">' + dayNames[di] + "</span>";
    for (var gap = 0; gap < startOffset; gap++) html += '<span class="cl-cal-day"></span>';
    for (var d = 1; d <= daysInMonth; d++) {
      var dateStr = year + "-" + String(month + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      var cls = "cl-cal-day";
      if (dateStr === todayStr) cls += " cl-cal-today";
      if (dateStr < todayStr) cls += " cl-cal-past";
      if (State.editDraft && State.editDraft.scheduledDate === dateStr) cls += " cl-cal-selected";
      html += '<span class="' + cls + '" data-action="selectDate" data-date="' + dateStr + '">' + d + "</span>";
    }
    html += "</div></div>";
    return html;
  }
  function renderDateWeekTab() {
    var currentWeek = State.currentWeek;
    var html = '<div class="cl-picker-options">';
    for (var w = 0; w < 8; w++) {
      var weekStr = addWeeks(currentWeek, w);
      var label = w === 0 ? "This week" : w === 1 ? "Next week" : weekStr;
      html += '<div class="cl-picker-option" data-action="selectWeek" data-week="' + weekStr + '"><span class="cl-picker-opt-label">' + label + '</span><span class="cl-picker-opt-date">' + weekStr + "</span></div>";
    }
    html += "</div>";
    return html;
  }
  function updateDateChip() {
    var editor = document.getElementById("cl-editor");
    if (!editor || !State.editDraft) return;
    var chip = editor.querySelector('[data-action="openDatePicker"]');
    if (!chip) return;
    var label = "Schedule...";
    if (State.editDraft.scheduledDate) label = formatShortDate(State.editDraft.scheduledDate);
    else if (State.editDraft.scheduledWeek) label = State.editDraft.scheduledWeek;
    chip.innerHTML = '<span class="cl-meta-icon">\u{1F4C5}</span>' + label;
  }
  function showNotePicker(anchor) {
    closePickers();
    var rect = anchor.getBoundingClientRect();
    var picker = document.createElement("div");
    picker.className = "cl-picker cl-note-picker";
    picker.style.top = rect.bottom + 4 + "px";
    picker.style.left = Math.min(rect.left, window.innerWidth - 310) + "px";
    picker.innerHTML = '<div class="cl-picker-search"><input class="cl-picker-input" placeholder="Search notes..." autofocus/></div><div class="cl-picker-results" id="cl-note-results">' + renderNoteResults("") + '</div><div class="cl-picker-footer"><span style="opacity:0.35;font-size:11px;">\u21B5 select \xB7 Esc close</span></div>';
    document.body.appendChild(picker);
    positionPickerVertically(picker, anchor);
    var input = picker.querySelector(".cl-picker-input");
    input.addEventListener("input", function() {
      document.getElementById("cl-note-results").innerHTML = renderNoteResults(input.value);
    });
    picker.addEventListener("click", function(e) {
      var target = e.target.closest('[data-action="selectNote"]');
      if (target) {
        State.editDraft.moveToFilename = target.dataset.filename;
        State.editDraft.moveToLabel = target.dataset.title;
        var editor = document.getElementById("cl-editor");
        if (editor) {
          var chip = editor.querySelector('[data-action="openNotePicker"]');
          if (chip) chip.textContent = "\u2192 " + target.dataset.title;
        }
        closePickers();
      }
    });
  }
  function renderNoteResults(query) {
    var q = (query || "").toLowerCase();
    var html = "";
    if (State.expandedTaskId && !q) {
      var curTask = null;
      for (var ti = 0; ti < State.tasks.length; ti++) {
        if (State.tasks[ti].id === State.expandedTaskId) {
          curTask = State.tasks[ti];
          break;
        }
      }
      if (curTask && curTask.noteFilename) {
        html += '<div class="cl-picker-group">Current Location</div>';
        html += '<div class="cl-picker-result cl-picker-current" data-action="selectNote" data-filename="' + esc(curTask.noteFilename) + '" data-title="' + esc(curTask.noteTitle) + '">';
        html += '<span class="cl-picker-note-icon">\u{1F4CD}</span>';
        html += '<span class="cl-picker-note-title">' + esc(curTask.noteTitle) + "</span>";
        html += "</div>";
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
      html += '<div class="cl-picker-group">' + esc(folder.name) + "</div>";
      for (var mi = 0; mi < matchingNotes.length; mi++) {
        var mn = matchingNotes[mi];
        html += '<div class="cl-picker-result" data-action="selectNote" data-filename="' + esc(mn.filename) + '" data-title="' + esc(mn.title) + '">';
        html += '<span class="cl-picker-note-icon">\u{1F4C4}</span>';
        html += '<span class="cl-picker-note-title">' + esc(mn.title) + "</span>";
        html += '<span class="cl-picker-note-count">' + mn.taskCount + "</span>";
        html += "</div>";
      }
    }
    if (!html) html = '<div class="cl-picker-empty">No notes found</div>';
    return html;
  }
  function getAllKnownTags() {
    var tagMap = {};
    for (var i = 0; i < State.tasks.length; i++) {
      var t = State.tasks[i];
      if (t.tags) {
        for (var j = 0; j < t.tags.length; j++) tagMap[t.tags[j]] = true;
      }
    }
    return Object.keys(tagMap).sort();
  }
  function getAllKnownMentions() {
    var menMap = {};
    for (var i = 0; i < State.tasks.length; i++) {
      var t = State.tasks[i];
      if (t.mentions) {
        for (var j = 0; j < t.mentions.length; j++) menMap[t.mentions[j]] = true;
      }
    }
    return Object.keys(menMap).sort();
  }
  function showInlineInput(anchor, prefix, onCommit) {
    var existing = document.querySelector(".cl-inline-input-wrap");
    if (existing) existing.remove();
    var allSuggestions = prefix === "#" ? getAllKnownTags() : getAllKnownMentions();
    var draft = State.editDraft;
    var already = prefix === "#" ? draft.tags || [] : draft.mentions || [];
    allSuggestions = allSuggestions.filter(function(s) {
      return already.indexOf(s) === -1;
    });
    var wrap = document.createElement("div");
    wrap.className = "cl-inline-input-wrap";
    var input = document.createElement("input");
    input.className = "cl-inline-input";
    input.placeholder = prefix + "...";
    input.value = prefix;
    var dropdown = document.createElement("div");
    dropdown.className = "cl-autocomplete";
    var selectedIdx = -1;
    wrap.appendChild(input);
    wrap.appendChild(dropdown);
    anchor.parentNode.insertBefore(wrap, anchor.nextSibling);
    input.focus();
    input.setSelectionRange(prefix.length, prefix.length);
    function updateSuggestions() {
      var q = input.value.toLowerCase();
      var matches = allSuggestions.filter(function(s) {
        return s.toLowerCase().indexOf(q) >= 0;
      });
      if (matches.length === 0 || matches.length === 1 && matches[0].toLowerCase() === q) {
        dropdown.innerHTML = "";
        dropdown.style.display = "none";
        selectedIdx = -1;
        return;
      }
      selectedIdx = -1;
      dropdown.style.display = "block";
      dropdown.innerHTML = "";
      for (var i = 0; i < Math.min(matches.length, 8); i++) {
        var item = document.createElement("div");
        item.className = "cl-autocomplete-item";
        item.textContent = matches[i];
        item.dataset.value = matches[i];
        item.addEventListener("mousedown", function(e) {
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
    input.addEventListener("input", updateSuggestions);
    updateSuggestions();
    input.addEventListener("keydown", function(e) {
      var items = dropdown.querySelectorAll(".cl-autocomplete-item");
      if (e.key === "ArrowDown" && items.length > 0) {
        e.preventDefault();
        selectedIdx = Math.min(selectedIdx + 1, items.length - 1);
        for (var i = 0; i < items.length; i++) items[i].classList.toggle("cl-autocomplete-active", i === selectedIdx);
        input.value = items[selectedIdx].dataset.value;
      } else if (e.key === "ArrowUp" && items.length > 0) {
        e.preventDefault();
        selectedIdx = Math.max(selectedIdx - 1, 0);
        for (var i = 0; i < items.length; i++) items[i].classList.toggle("cl-autocomplete-active", i === selectedIdx);
        input.value = items[selectedIdx].dataset.value;
      } else if (e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        commit();
      } else if (e.key === "Escape") {
        e.stopPropagation();
        wrap.remove();
      }
    });
    input.addEventListener("blur", function() {
      setTimeout(function() {
        if (wrap.parentNode) commit();
      }, 150);
    });
  }
  function closePickers() {
    var pickers = document.querySelectorAll(".cl-picker");
    for (var i = 0; i < pickers.length; i++) pickers[i].remove();
  }
  document.addEventListener("keydown", function(e) {
    if (e.metaKey && e.key === "Enter") {
      if (State.expandedTaskId) {
        e.preventDefault();
        saveExpandedTask();
      }
      return;
    }
    if (e.key === "Escape") {
      var cheat = document.querySelector(".cl-cheatsheet-overlay");
      if (cheat) {
        cheat.remove();
        return;
      }
      var picker = document.querySelector(".cl-picker");
      if (picker) {
        picker.remove();
        return;
      }
      if (State.expandedTaskId) {
        collapseTask();
        return;
      }
    }
    if (e.key === "?" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      var activeForCheat = document.activeElement;
      if (activeForCheat && (activeForCheat.tagName === "INPUT" || activeForCheat.tagName === "TEXTAREA")) return;
      e.preventDefault();
      openShortcutsCheatsheet();
      return;
    }
    if (e.metaKey && e.shiftKey && (e.key === "T" || e.key === "t")) {
      var tomorrow = addDays(State.today, 1);
      if (State.editDraft) {
        e.preventDefault();
        State.editDraft.scheduledDate = tomorrow;
        State.editDraft.scheduledWeek = null;
        State.editDraft.tags = State.editDraft.tags.filter(function(t) {
          return t !== "#someday" && t !== "#evening";
        });
        updateDateChip();
      } else {
        var tid = getFocusedTaskId();
        if (tid) {
          e.preventDefault();
          toggleTaskTagById(tid, "#evening", false);
          rescheduleTaskById(tid, tomorrow);
        }
      }
      return;
    }
    if (e.metaKey && e.key === "t") {
      if (State.editDraft) {
        e.preventDefault();
        State.editDraft.scheduledDate = State.today;
        State.editDraft.scheduledWeek = null;
        State.editDraft.tags = State.editDraft.tags.filter(function(t) {
          return t !== "#someday" && t !== "#evening";
        });
        updateDateChip();
      } else {
        var tid = getFocusedTaskId();
        if (tid) {
          e.preventDefault();
          toggleTaskTagById(tid, "#evening", false);
          rescheduleTaskById(tid, State.today);
        }
      }
      return;
    }
    if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && (e.key === "e" || e.key === "E")) {
      if (State.editDraft) {
        e.preventDefault();
        if (State.editDraft.tags.indexOf("#evening") < 0) State.editDraft.tags.push("#evening");
        State.editDraft.scheduledDate = State.today;
        State.editDraft.scheduledWeek = null;
        updateDateChip();
      } else {
        var tid = getFocusedTaskId();
        if (tid) {
          e.preventDefault();
          rescheduleTaskById(tid, State.today);
          toggleTaskTagById(tid, "#evening", true);
        }
      }
      return;
    }
    if (e.metaKey && e.key === "o") {
      if (State.editDraft) {
        e.preventDefault();
        State.editDraft.scheduledDate = null;
        State.editDraft.scheduledWeek = null;
        State.editDraft.tags = State.editDraft.tags.filter(function(t) {
          return t !== "#evening";
        });
        updateDateChip();
      } else {
        var tid = getFocusedTaskId();
        if (tid) {
          e.preventDefault();
          toggleTaskTagById(tid, "#evening", false);
          rescheduleTaskById(tid, null);
        }
      }
      return;
    }
    if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && /^[1-5]$/.test(e.key)) {
      var viewMap = { "1": "inbox", "2": "today", "3": "upcoming", "4": "anytime", "5": "someday" };
      var targetView = viewMap[e.key];
      if (targetView) {
        var navItem = document.querySelector('.cl-nav-item[data-view="' + targetView + '"]');
        if (navItem) {
          e.preventDefault();
          if (State.expandedTaskId) collapseTask();
          navItem.click();
          var sbInner = document.querySelector(".cl-sidebar-inner");
          if (sbInner) sbInner.scrollTop = 0;
        }
      }
      return;
    }
    if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && (e.key === "Backspace" || e.key === "Delete")) {
      var active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      var deleteId = State.expandedTaskId || getFocusedTaskId();
      if (deleteId) {
        e.preventDefault();
        deleteTaskById(deleteId);
      }
      return;
    }
    if (e.metaKey && !e.shiftKey && !e.altKey && !e.ctrlKey && e.key === "/") {
      e.preventDefault();
      openQuickJump();
      return;
    }
    if (e.metaKey && e.key === "n") {
      e.preventDefault();
      var quickAdd = document.querySelector(".cl-quick-add-input");
      if (quickAdd) quickAdd.focus();
      return;
    }
    if (!State.expandedTaskId && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      var active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      e.preventDefault();
      var rows = document.querySelectorAll(".cl-task-row");
      if (rows.length === 0) return;
      if (e.key === "ArrowDown") State.focusedTaskIndex = Math.min(State.focusedTaskIndex + 1, rows.length - 1);
      else State.focusedTaskIndex = Math.max(State.focusedTaskIndex - 1, 0);
      for (var ri = 0; ri < rows.length; ri++) rows[ri].classList.remove("cl-focused");
      if (rows[State.focusedTaskIndex]) {
        rows[State.focusedTaskIndex].classList.add("cl-focused");
        rows[State.focusedTaskIndex].scrollIntoView({ block: "nearest" });
      }
    }
    if (e.key === "Enter" && !State.expandedTaskId) {
      var active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      var rows = document.querySelectorAll(".cl-task-row");
      if (State.focusedTaskIndex >= 0 && rows[State.focusedTaskIndex]) {
        e.preventDefault();
        expandTask(rows[State.focusedTaskIndex].dataset.taskId);
      }
    }
    if (e.key === " " && !State.expandedTaskId) {
      var active = document.activeElement;
      if (active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA")) return;
      var rows = document.querySelectorAll(".cl-task-row");
      if (State.focusedTaskIndex >= 0 && rows[State.focusedTaskIndex]) {
        e.preventDefault();
        toggleTask(rows[State.focusedTaskIndex].dataset.taskId);
      }
    }
  });
  function renderInitialLoading() {
    var sidebar = document.getElementById("cl-sidebar");
    var main = document.getElementById("cl-main");
    if (sidebar) {
      var inner = document.createElement("div");
      inner.className = "cl-sidebar-inner";
      for (var i = 0; i < 5; i++) {
        var row = document.createElement("div");
        row.className = "cl-skeleton-nav";
        var dot = document.createElement("div");
        dot.className = "cl-skeleton-dot";
        var bar = document.createElement("div");
        bar.className = "cl-skeleton-bar";
        row.appendChild(dot);
        row.appendChild(bar);
        inner.appendChild(row);
      }
      var div = document.createElement("div");
      div.className = "cl-nav-divider";
      inner.appendChild(div);
      for (var j = 0; j < 4; j++) {
        var row2 = document.createElement("div");
        row2.className = "cl-skeleton-nav";
        var dot2 = document.createElement("div");
        dot2.className = "cl-skeleton-dot";
        var bar2 = document.createElement("div");
        bar2.className = "cl-skeleton-bar";
        bar2.style.width = 50 + j * 13 % 40 + "%";
        row2.appendChild(dot2);
        row2.appendChild(bar2);
        inner.appendChild(row2);
      }
      sidebar.replaceChildren(inner);
    }
    if (main) {
      var overlay = document.createElement("div");
      overlay.className = "cl-loading-overlay";
      var spin = document.createElement("div");
      spin.className = "cl-spinner";
      var lbl = document.createElement("div");
      lbl.className = "cl-loading-label";
      lbl.textContent = "Loading your tasks\u2026";
      overlay.appendChild(spin);
      overlay.appendChild(lbl);
      main.replaceChildren(overlay);
    }
  }
  document.addEventListener("DOMContentLoaded", function() {
    renderInitialLoading();
    setTimeout(function() {
      sendMessageToPlugin("ready", "{}");
    }, 100);
    attachDragListeners(document.getElementById("cl-main"));
    var toggle = document.getElementById("cl-sidebar-toggle");
    var overlay = document.getElementById("cl-sidebar-overlay");
    if (toggle) {
      toggle.addEventListener("click", function() {
        var sidebar = document.getElementById("cl-sidebar");
        if (sidebar) sidebar.classList.toggle("cl-sidebar-open");
        if (overlay) overlay.classList.toggle("cl-sidebar-open");
      });
    }
    if (overlay) {
      overlay.addEventListener("click", function() {
        var sidebar = document.getElementById("cl-sidebar");
        if (sidebar) sidebar.classList.remove("cl-sidebar-open");
        overlay.classList.remove("cl-sidebar-open");
      });
    }
    setupSidebarResizer();
  });
})();
//# sourceMappingURL=clarityEvents.js.map
