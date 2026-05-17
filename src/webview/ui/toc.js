// Right-sidebar Table of Contents for the note view. Activated when the note's
// front-matter has `clarity: toc, ...`. Hidden + DOM-empty otherwise so layout
// is unaffected.

import { renderInlineMarkdown } from '../lib/markdown.js';

// Build TOC items from a paragraphs array. Filters out the leading H1 that
// duplicates the note title (matching renderNoteView's `firstH1Skipped`).
// Returns a list of { lineIndex, level, text } in document order.
export function collectTocHeadings(paragraphs) {
  var out = [];
  var firstH1Skipped = false;
  for (var i = 0; i < (paragraphs || []).length; i++) {
    var p = paragraphs[i];
    if (p.type !== 'title') continue;
    var level = p.headingLevel || 1;
    if (!firstH1Skipped && level === 1) { firstH1Skipped = true; continue; }
    var text = (p.content || '').replace(/\s*…\s*$/, '').replace(/\s*👀\s*$/, '');
    if (/^[-*_]{3,}$/.test(text.trim())) continue; // separator
    out.push({ lineIndex: p.lineIndex, level: level, text: text });
  }
  return out;
}

// Render the right sidebar into the (always-present) #cl-right-sidebar element.
// If there are no subheadings, the sidebar is hidden and its contents cleared.
export function renderToc(paragraphs) {
  var el = document.getElementById('cl-right-sidebar');
  if (!el) return;
  var headings = collectTocHeadings(paragraphs);
  if (headings.length === 0) {
    el.hidden = true;
    el.innerHTML = '';
    return;
  }
  var html = '<div class="cl-toc-title">Contents</div><div class="cl-toc-list">';
  for (var i = 0; i < headings.length; i++) {
    var h = headings[i];
    html += '<button class="cl-toc-item cl-toc-level-' + h.level +
      '" data-action="scrollToHeading" data-line-index="' + h.lineIndex + '">' +
      renderInlineMarkdown(h.text) + '</button>';
  }
  html += '</div>';
  el.innerHTML = html;
  el.hidden = false;
}

// Hide the TOC (used when the toc token is off or we're not in note view).
export function hideToc() {
  var el = document.getElementById('cl-right-sidebar');
  if (!el) return;
  el.hidden = true;
  el.innerHTML = '';
}

// Smooth-scroll #cl-main to a heading by lineIndex.
export function scrollToHeading(lineIndex) {
  var main = document.getElementById('cl-main');
  if (!main) return;
  var heading = main.querySelector('.cl-note-heading[data-line-index="' + lineIndex + '"]');
  if (!heading) return;
  main.scrollTo({ top: heading.offsetTop - 20, behavior: 'smooth' });
}

// Scroll-spy: highlights the TOC item matching the topmost visible heading.
// Idempotent — calling repeatedly only attaches the listener once per main element.
var _spyAttached = false;
export function attachTocScrollSpy() {
  if (_spyAttached) return;
  var main = document.getElementById('cl-main');
  if (!main) return;
  _spyAttached = true;
  var debounce = null;
  main.addEventListener('scroll', function() {
    if (debounce) return;
    debounce = setTimeout(function() {
      debounce = null;
      updateActiveTocItem();
    }, 50);
  });
}

function updateActiveTocItem() {
  var sidebar = document.getElementById('cl-right-sidebar');
  if (!sidebar || sidebar.hidden) return;
  var main = document.getElementById('cl-main');
  if (!main) return;
  var headings = main.querySelectorAll('.cl-note-heading');
  var scrollTop = main.scrollTop;
  var activeLineIndex = null;
  for (var i = 0; i < headings.length; i++) {
    if (headings[i].offsetTop <= scrollTop + 60) {
      activeLineIndex = headings[i].dataset.lineIndex;
    } else {
      break;
    }
  }
  var items = sidebar.querySelectorAll('.cl-toc-item');
  for (var j = 0; j < items.length; j++) {
    if (items[j].dataset.lineIndex === activeLineIndex) items[j].classList.add('active');
    else items[j].classList.remove('active');
  }
}

// One-time click delegation on the right sidebar. Called from init.js.
var _clickAttached = false;
export function attachTocClickHandler() {
  if (_clickAttached) return;
  var el = document.getElementById('cl-right-sidebar');
  if (!el) return;
  _clickAttached = true;
  el.addEventListener('click', function(e) {
    var btn = e.target.closest('[data-action="scrollToHeading"]');
    if (!btn) return;
    var idx = parseInt(btn.dataset.lineIndex, 10);
    if (isNaN(idx)) return;
    scrollToHeading(idx);
  });
}
