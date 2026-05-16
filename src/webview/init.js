/* global sendMessageToPlugin */
// Boot sequence: paint a skeleton sidebar + spinner while we wait for the
// plugin to push INIT_DATA over the bridge, then wire mobile sidebar toggles,
// drag-and-drop listeners, and the sidebar resizer. The "ready" message is
// scheduled on a setTimeout so the bridge has time to register its window
// globals before we send it.

import { attachDragListeners } from './ui/dnd.js';
import { setupSidebarResizer } from './ui/sidebar.js';

function renderInitialLoading() {
  var sidebar = document.getElementById('cl-sidebar');
  var main = document.getElementById('cl-main');
  if (sidebar) {
    var inner = document.createElement('div');
    inner.className = 'cl-sidebar-inner';
    for (var i = 0; i < 5; i++) {
      var row = document.createElement('div');
      row.className = 'cl-skeleton-nav';
      var dot = document.createElement('div'); dot.className = 'cl-skeleton-dot';
      var bar = document.createElement('div'); bar.className = 'cl-skeleton-bar';
      row.appendChild(dot); row.appendChild(bar);
      inner.appendChild(row);
    }
    var div = document.createElement('div'); div.className = 'cl-nav-divider';
    inner.appendChild(div);
    for (var j = 0; j < 4; j++) {
      var row2 = document.createElement('div');
      row2.className = 'cl-skeleton-nav';
      var dot2 = document.createElement('div'); dot2.className = 'cl-skeleton-dot';
      var bar2 = document.createElement('div'); bar2.className = 'cl-skeleton-bar';
      bar2.style.width = (50 + (j * 13) % 40) + '%';
      row2.appendChild(dot2); row2.appendChild(bar2);
      inner.appendChild(row2);
    }
    sidebar.replaceChildren(inner);
  }
  if (main) {
    var overlay = document.createElement('div');
    overlay.className = 'cl-loading-overlay';
    var spin = document.createElement('div'); spin.className = 'cl-spinner';
    var lbl = document.createElement('div'); lbl.className = 'cl-loading-label';
    lbl.textContent = 'Loading your tasks…';
    overlay.appendChild(spin);
    overlay.appendChild(lbl);
    main.replaceChildren(overlay);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  renderInitialLoading();
  setTimeout(function() {
    sendMessageToPlugin('ready', '{}');
  }, 100);

  attachDragListeners(document.getElementById('cl-main'));

  // Mobile sidebar toggle
  var toggle = document.getElementById('cl-sidebar-toggle');
  var overlay = document.getElementById('cl-sidebar-overlay');
  if (toggle) {
    toggle.addEventListener('click', function() {
      var sidebar = document.getElementById('cl-sidebar');
      if (sidebar) sidebar.classList.toggle('cl-sidebar-open');
      if (overlay) overlay.classList.toggle('cl-sidebar-open');
    });
  }
  if (overlay) {
    overlay.addEventListener('click', function() {
      var sidebar = document.getElementById('cl-sidebar');
      if (sidebar) sidebar.classList.remove('cl-sidebar-open');
      overlay.classList.remove('cl-sidebar-open');
    });
  }

  // Sidebar resizer (desktop only — CSS hides it on mobile)
  setupSidebarResizer();
});
