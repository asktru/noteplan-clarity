/* global sendMessageToPlugin */
// Drag-and-drop reordering of tasks within the note/project view. Long-press
// (300ms) starts a drag; movement < 10px before that cancels it; siblings are
// the same-indent rows under the same `.cl-note-content` container. The
// committed reorder is sent to the plugin as a `reorderTask` message and the
// DOM is updated optimistically so the user sees the change immediately.
//
// `attachDragListeners` is called from the DOMContentLoaded handler in
// index.js. The DnD state is module-private; index.js's click handler reaches
// in via `consumeDragClickSuppression()` to swallow the trailing click that
// would otherwise fire right after a drag-release.

import { State } from './state.js';

var dragState = null;
var dragSuppressNextClick = false;
var DRAG_LONG_PRESS_MS = 300;
var DRAG_CANCEL_DISTANCE = 10;
var DRAG_SCROLL_ZONE = 40;
var DRAG_SCROLL_SPEED = 8;

// Read-and-clear: returns true if a drag just ended (so the trailing click
// should be ignored). Resets the flag as a side effect.
export function consumeDragClickSuppression() {
  if (dragSuppressNextClick) {
    dragSuppressNextClick = false;
    return true;
  }
  return false;
}

function dragGetTaskRow(el) {
  var row = el.closest('.cl-task-row');
  if (!row || row.dataset.lineIndex === undefined) return null;
  return row;
}

function dragFindSiblings(sourceRow) {
  var container = document.querySelector('.cl-note-content');
  if (!container) return [];
  var sourceIndent = parseInt(sourceRow.dataset.indent, 10) || 0;
  var rows = container.querySelectorAll('.cl-task-row[data-line-index]');
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
  clone.classList.add('cl-drag-clone');
  clone.style.width = rect.width + 'px';
  clone.style.height = rect.height + 'px';
  clone.style.left = rect.left + 'px';
  clone.style.top = y - (rect.height / 2) + 'px';
  document.body.appendChild(clone);
  return clone;
}

function dragCreateIndicator() {
  var el = document.createElement('div');
  el.className = 'cl-drop-indicator';
  return el;
}

function dragUpdateClonePosition(clone, y) {
  var height = clone.offsetHeight;
  clone.style.top = (y - height / 2) + 'px';
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
      best = { el: siblings[i], position: y < mid ? 'before' : 'after' };
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
  var refEl = row.closest('.cl-indent-wrap') || row;
  if (target.position === 'before') {
    refEl.parentNode.insertBefore(indicator, refEl);
  } else {
    refEl.parentNode.insertBefore(indicator, refEl.nextSibling);
  }
}

function dragAutoScroll(y) {
  var main = document.getElementById('cl-main');
  if (!main) return;
  var rect = main.getBoundingClientRect();
  if (y < rect.top + DRAG_SCROLL_ZONE) {
    var intensity = 1 - ((y - rect.top) / DRAG_SCROLL_ZONE);
    main.scrollTop -= DRAG_SCROLL_SPEED * Math.max(0, intensity);
  } else if (y > rect.bottom - DRAG_SCROLL_ZONE) {
    var intensity = 1 - ((rect.bottom - y) / DRAG_SCROLL_ZONE);
    main.scrollTop += DRAG_SCROLL_SPEED * Math.max(0, intensity);
  }
}

function dragCommit(sourceRow, dropTarget) {
  if (!dropTarget) return;
  var sourceLineIndex = parseInt(sourceRow.dataset.lineIndex, 10);
  var childCount = parseInt(sourceRow.dataset.childCount, 10) || 0;
  var targetLineIndex = parseInt(dropTarget.el.dataset.lineIndex, 10);
  if (dropTarget.position === 'after') {
    var targetChildCount = parseInt(dropTarget.el.dataset.childCount, 10) || 0;
    targetLineIndex = targetLineIndex + targetChildCount + 1;
  }
  // Optimistic DOM reorder
  var sourceRef = sourceRow.closest('.cl-indent-wrap') || sourceRow;
  var targetRef = dropTarget.el.closest('.cl-indent-wrap') || dropTarget.el;
  if (dropTarget.position === 'before') {
    targetRef.parentNode.insertBefore(sourceRef, targetRef);
  } else {
    targetRef.parentNode.insertBefore(sourceRef, targetRef.nextSibling);
  }
  sendMessageToPlugin('reorderTask', JSON.stringify({
    filename: State.currentNoteFilename,
    sourceLineIndex: sourceLineIndex,
    childCount: childCount,
    targetLineIndex: targetLineIndex
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
    dragState.sourceEl.classList.remove('cl-drag-ghost');
  }
  if (dragState.scrollInterval) {
    clearInterval(dragState.scrollInterval);
  }
  document.body.classList.remove('cl-dragging');
  dragState = null;
}

function dragCancel() {
  dragCleanup();
}

function dragStart(sourceRow, y, x) {
  if (State.expandedTaskId) { dragCleanup(); return; }
  sourceRow.classList.add('cl-drag-ghost');
  document.body.classList.add('cl-dragging');
  var clone = dragCreateClone(sourceRow, x, y);
  var indicator = dragCreateIndicator();
  var siblings = dragFindSiblings(sourceRow);
  if (siblings.length === 0) {
    sourceRow.classList.remove('cl-drag-ghost');
    document.body.classList.remove('cl-dragging');
    if (clone.parentNode) clone.parentNode.removeChild(clone);
    dragState = null;
    return;
  }
  dragState.phase = 'dragging';
  dragState.cloneEl = clone;
  dragState.indicatorEl = indicator;
  dragState.siblings = siblings;
  dragState.scrollInterval = setInterval(function() {
    if (dragState && dragState.phase === 'dragging') {
      dragAutoScroll(dragState.currentY);
    }
  }, 16);
}

function dragMove(y, x) {
  if (!dragState || dragState.phase !== 'dragging') return;
  dragState.currentY = y;
  dragUpdateClonePosition(dragState.cloneEl, y);
  var target = dragFindDropTarget(y, dragState.sourceEl, dragState.siblings);
  dragState.currentTarget = target;
  dragPositionIndicator(dragState.indicatorEl, target);
}

function dragEnd() {
  if (!dragState) return;
  if (dragState.phase === 'pending') {
    if (dragState.timer) clearTimeout(dragState.timer);
    dragState = null;
    return;
  }
  if (dragState.phase === 'dragging') {
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

// Wire up mouse + touch + Escape listeners. Called once at init from the
// DOMContentLoaded handler in index.js.
export function attachDragListeners(mainEl) {
  if (!mainEl) return;

  // Mouse events (desktop)
  mainEl.addEventListener('mousedown', function(e) {
    if (State.currentView !== 'note') return;
    if (e.button !== 0) return;
    if (e.target.closest('.cl-cb') || e.target.closest('.cl-task-editor') || e.target.closest('.cl-quick-add')) return;
    var row = dragGetTaskRow(e.target);
    if (!row) return;
    var startY = e.clientY;
    var startX = e.clientX;
    dragState = {
      phase: 'pending',
      sourceEl: row,
      sourceId: row.dataset.taskId,
      sourceLineIndex: parseInt(row.dataset.lineIndex, 10),
      childCount: parseInt(row.dataset.childCount, 10) || 0,
      indentLevel: parseInt(row.dataset.indent, 10) || 0,
      cloneEl: null, indicatorEl: null,
      startY: startY, startX: startX, currentY: startY,
      currentTarget: null, siblings: null, scrollInterval: null,
      timer: setTimeout(function() {
        if (dragState && dragState.phase === 'pending') {
          e.preventDefault();
          dragStart(row, startY, startX);
        }
      }, DRAG_LONG_PRESS_MS)
    };
  });

  mainEl.addEventListener('mousemove', function(e) {
    if (!dragState) return;
    if (dragState.phase === 'pending') {
      var dx = e.clientX - dragState.startX;
      var dy = e.clientY - dragState.startY;
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_CANCEL_DISTANCE) {
        clearTimeout(dragState.timer);
        dragState = null;
      }
      return;
    }
    if (dragState.phase === 'dragging') {
      e.preventDefault();
      dragMove(e.clientY, e.clientX);
    }
  });

  mainEl.addEventListener('mouseup', function() {
    if (!dragState) return;
    dragEnd();
  });

  // Touch events (mobile)
  mainEl.addEventListener('touchstart', function(e) {
    if (State.currentView !== 'note') return;
    if (e.touches.length !== 1) return;
    if (e.target.closest('.cl-cb') || e.target.closest('.cl-task-editor') || e.target.closest('.cl-quick-add')) return;
    var row = dragGetTaskRow(e.target);
    if (!row) return;
    var touch = e.touches[0];
    var startY = touch.clientY;
    var startX = touch.clientX;
    dragState = {
      phase: 'pending',
      sourceEl: row,
      sourceId: row.dataset.taskId,
      sourceLineIndex: parseInt(row.dataset.lineIndex, 10),
      childCount: parseInt(row.dataset.childCount, 10) || 0,
      indentLevel: parseInt(row.dataset.indent, 10) || 0,
      cloneEl: null, indicatorEl: null,
      startY: startY, startX: startX, currentY: startY,
      currentTarget: null, siblings: null, scrollInterval: null,
      timer: setTimeout(function() {
        if (dragState && dragState.phase === 'pending') {
          dragStart(row, startY, startX);
        }
      }, DRAG_LONG_PRESS_MS)
    };
  }, { passive: true });

  mainEl.addEventListener('touchmove', function(e) {
    if (!dragState) return;
    var touch = e.touches[0];
    if (dragState.phase === 'pending') {
      var dx = touch.clientX - dragState.startX;
      var dy = touch.clientY - dragState.startY;
      if (Math.sqrt(dx * dx + dy * dy) > DRAG_CANCEL_DISTANCE) {
        clearTimeout(dragState.timer);
        dragState = null;
      }
      return;
    }
    if (dragState.phase === 'dragging') {
      e.preventDefault();
      dragMove(touch.clientY, touch.clientX);
    }
  }, { passive: false });

  mainEl.addEventListener('touchend', function() {
    if (!dragState) return;
    dragEnd();
  });

  mainEl.addEventListener('touchcancel', function() {
    if (!dragState) return;
    dragCancel();
  });

  // Escape key to cancel an in-progress drag
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && dragState && dragState.phase === 'dragging') {
      e.preventDefault();
      dragCancel();
    }
  });
}
