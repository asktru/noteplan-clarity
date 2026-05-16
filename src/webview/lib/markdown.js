// Inline-markdown rendering used by task content and the note view. Lifts
// links/code into placeholders before tag/mention regexes run, so URLs aren't
// chewed up by the # / @ matchers. Markdown tables piggyback on the same
// inline renderer for cell contents.

import { esc } from './helpers.js';

export function renderInlineMarkdown(text) {
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

  // Inline code — extract before other formatting to protect contents
  s = s.replace(/`([^`]+)`/g, function(m, code) {
    return placeholder('<code class="cl-inline-code">' + code + '</code>');
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

  // Tags and mentions — now safe because URLs are placeholders.
  // Use Unicode property escapes so non-ASCII letters (ä, é, ñ, Cyrillic, etc.) are accepted.
  s = s.replace(/(#[\p{L}\p{N}_\-\/]+)/gu, '<span class="cl-tag-inline">$1</span>');
  // Mentions: only match @word when preceded by space or start (not inside emails)
  s = s.replace(/(^|[\s(])(@(?!done|due|repeat)[\p{L}\p{N}_\-]+)/gu, function(m, pre, mention) {
    return pre + '<span class="cl-mention-inline">' + mention + '</span>';
  });

  // Restore placeholders
  for (var i = 0; i < placeholders.length; i++) {
    s = s.replace('\x00PH' + i + '\x00', placeholders[i]);
  }

  return s;
}

// A separator row like "| --- | :---: | ---: |" — used to anchor table detection
// and determine per-column alignment.
export function isTableSeparatorLine(line) {
  var cells = splitTableCells(line);
  if (cells.length === 0) return false;
  for (var i = 0; i < cells.length; i++) {
    if (!/^:?-{3,}:?$/.test(cells[i])) return false;
  }
  return true;
}

export function splitTableCells(line) {
  var s = line.trim();
  // Strip leading and trailing pipe
  if (s.charAt(0) === '|') s = s.substring(1);
  if (s.charAt(s.length - 1) === '|') s = s.substring(0, s.length - 1);
  var cells = s.split('|');
  for (var i = 0; i < cells.length; i++) cells[i] = cells[i].trim();
  return cells;
}

export function renderMarkdownTable(lines) {
  var rows = lines.map(splitTableCells);
  var sepIdx = -1;
  for (var i = 0; i < rows.length; i++) {
    if (isTableSeparatorLine(lines[i])) { sepIdx = i; break; }
  }
  // Derive alignment from the separator row
  var alignments = [];
  if (sepIdx >= 0) {
    for (var a = 0; a < rows[sepIdx].length; a++) {
      var cell = rows[sepIdx][a];
      if (/^:-+:$/.test(cell)) alignments.push('center');
      else if (/^-+:$/.test(cell)) alignments.push('right');
      else alignments.push('left');
    }
  }
  var colCount = 0;
  for (var r = 0; r < rows.length; r++) if (rows[r].length > colCount) colCount = rows[r].length;

  function cellStyle(col) {
    var align = alignments[col] || 'left';
    return align === 'left' ? '' : ' style="text-align:' + align + '"';
  }

  var html = '<div class="cl-note-table-wrap"><table class="cl-note-table">';
  var hasHeader = sepIdx === 1; // standard markdown: header, separator, body
  var bodyStart = sepIdx >= 0 ? sepIdx + 1 : 0;
  if (hasHeader) {
    html += '<thead><tr>';
    for (var h = 0; h < colCount; h++) {
      var headText = rows[0][h] || '';
      html += '<th' + cellStyle(h) + '>' + renderInlineMarkdown(headText) + '</th>';
    }
    html += '</tr></thead>';
  }
  html += '<tbody>';
  for (var br = bodyStart; br < rows.length; br++) {
    if (br === sepIdx) continue;
    html += '<tr>';
    for (var c = 0; c < colCount; c++) {
      var cellText = rows[br][c] || '';
      html += '<td' + cellStyle(c) + '>' + renderInlineMarkdown(cellText) + '</td>';
    }
    html += '</tr>';
  }
  html += '</tbody></table></div>';
  return html;
}
