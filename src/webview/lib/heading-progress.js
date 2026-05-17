// Per-heading task completion stats for use by the `progress` token.
// Returns a Map keyed by heading paragraph's `lineIndex` → { total, done }.
//
// Counting rules (kept in sync with Donote's computeHeadingTaskStats):
//   - Every task counts toward every ancestor heading on the level stack,
//     so an H1 pie reflects completion across its whole section.
//   - Cancelled tasks (type === 'cancelled' / 'checklistCancelled') are
//     excluded from both total and done.
//   - Done tasks (type === 'done' / 'checklistDone') add to done.
//   - Separator headings (text matches /^[-*_]{3,}$/) are ignored.

export function computeHeadingTaskStats(paragraphs) {
  var stats = new Map();
  var stack = []; // each entry: { level, lineIndex }
  for (var i = 0; i < (paragraphs || []).length; i++) {
    var p = paragraphs[i];
    if (p.type === 'title') {
      var hText = (p.content || '').trim().replace(/\s*…\s*$/, '').replace(/\s*👀\s*$/, '');
      if (/^[-*_]{3,}$/.test(hText)) continue;
      var level = p.headingLevel || 1;
      while (stack.length > 0 && stack[stack.length - 1].level >= level) stack.pop();
      stats.set(p.lineIndex, { total: 0, done: 0 });
      stack.push({ level: level, lineIndex: p.lineIndex });
      continue;
    }
    var isOpen = (p.type === 'open' || p.type === 'checklist');
    var isDone = (p.type === 'done' || p.type === 'checklistDone');
    if (!isOpen && !isDone) continue;
    for (var s = 0; s < stack.length; s++) {
      var entry = stats.get(stack[s].lineIndex);
      if (!entry) continue;
      entry.total++;
      if (isDone) entry.done++;
    }
  }
  return stats;
}

// Things-3 style heading progress pie. Returns an HTML string or '' when total is 0.
// 18×18 SVG; uses currentColor so the pie inherits the heading's color (incl.
// the indent palette in `cl-note-indented`). At 100% complete, switches to a
// filled disk with a checkmark punched through in the page background.
export function buildHeadingProgressSVG(done, total) {
  if (!total) return '';
  var pct = done / total;
  var size = 18, cx = 9, cy = 9, r = 7, sw = 2.25;
  var html = '<svg class="cl-h-progress" viewBox="0 0 ' + size + ' ' + size +
    '" width="' + size + '" height="' + size + '" aria-hidden="true">';
  html += '<circle cx="' + cx + '" cy="' + cy + '" r="' + r +
    '" fill="none" stroke="currentColor" stroke-width="' + sw + '" opacity="0.4"/>';
  if (pct >= 1) {
    html += '<circle cx="' + cx + '" cy="' + cy + '" r="' + (r + sw / 2) + '" fill="currentColor"/>';
    html += '<path d="M 5.5 9.2 L 8 11.6 L 12.7 6.6" fill="none" stroke="var(--cl-bg)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>';
  } else if (pct > 0) {
    var angle = 2 * Math.PI * pct;
    var endX = cx + r * Math.sin(angle);
    var endY = cy - r * Math.cos(angle);
    var largeArc = pct > 0.5 ? 1 : 0;
    var d = 'M ' + cx + ' ' + cy + ' L ' + cx + ' ' + (cy - r) +
            ' A ' + r + ' ' + r + ' 0 ' + largeArc + ' 1 ' +
            endX.toFixed(3) + ' ' + endY.toFixed(3) + ' Z';
    html += '<path d="' + d + '" fill="currentColor"/>';
  }
  html += '</svg>';
  return html;
}
