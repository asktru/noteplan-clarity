/* global sendMessageToPlugin */
// Sidebar width: applied from saved settings via applySidebarWidth, and
// adjustable at runtime by dragging the vertical resizer between sidebar and
// main pane. CSS hides the resizer on mobile widths (≤600px), but we guard
// here too in case the breakpoint changes.

var SIDEBAR_MIN_WIDTH = 140;
var SIDEBAR_MAX_WIDTH = 500;
var SIDEBAR_DEFAULT_WIDTH = 200;

export function applySidebarWidth(width) {
  var w = parseInt(width, 10);
  if (isNaN(w)) w = SIDEBAR_DEFAULT_WIDTH;
  if (w < SIDEBAR_MIN_WIDTH) w = SIDEBAR_MIN_WIDTH;
  if (w > SIDEBAR_MAX_WIDTH) w = SIDEBAR_MAX_WIDTH;
  document.documentElement.style.setProperty('--cl-sidebar-width', w + 'px');
}

export function setupSidebarResizer() {
  var resizer = document.getElementById('cl-resizer');
  var sidebar = document.getElementById('cl-sidebar');
  if (!resizer || !sidebar) return;

  var dragging = false;
  var startX = 0;
  var startWidth = 0;

  resizer.addEventListener('mousedown', function(e) {
    // Ignore on mobile (resizer is display:none there, but guard anyway)
    if (window.innerWidth <= 600) return;
    dragging = true;
    startX = e.clientX;
    startWidth = sidebar.getBoundingClientRect().width;
    document.body.classList.add('cl-resizing');
    resizer.classList.add('cl-resizer-active');
    e.preventDefault();
  });

  document.addEventListener('mousemove', function(e) {
    if (!dragging) return;
    var newWidth = startWidth + (e.clientX - startX);
    if (newWidth < SIDEBAR_MIN_WIDTH) newWidth = SIDEBAR_MIN_WIDTH;
    if (newWidth > SIDEBAR_MAX_WIDTH) newWidth = SIDEBAR_MAX_WIDTH;
    document.documentElement.style.setProperty('--cl-sidebar-width', newWidth + 'px');
  });

  document.addEventListener('mouseup', function() {
    if (!dragging) return;
    dragging = false;
    document.body.classList.remove('cl-resizing');
    resizer.classList.remove('cl-resizer-active');
    var finalWidth = sidebar.getBoundingClientRect().width;
    sendMessageToPlugin('saveSidebarWidth', JSON.stringify({ width: Math.round(finalWidth) }));
  });
}
