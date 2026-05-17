// Focus mode for the note view: dims everything outside the focused section(s).
// State lives on the DOM (data-focused="true" on .cl-note-heading) and is
// mirrored on disk by appending/stripping a trailing 👀 on the heading line,
// so it survives reload and is shared with the Donote plugin.

// Recompute dimming based on which headings have data-focused="true".
//
// The DOM nests sections: each heading is followed by a `.cl-section-body` that
// contains its descendants (sub-headings + their bodies, paragraphs, tasks).
// To focus correctly on a nested heading we must dim *inside* each ancestor's
// section-body — sparing only the chain leading to the focused descendant —
// rather than sparing the whole ancestor section.
//
// Walk strategy per container:
//   - heading is the focused one              → leave it + skip-and-keep its body subtree
//   - heading is on the chain to a focused descendant → leave it visible, recurse into its body
//   - everything else                         → dim it
export function applyFocusMode() {
  var main = document.getElementById('cl-main');
  if (!main) return;
  var contentRoot = main.querySelector('.cl-note-content');
  if (!contentRoot) return;

  var prev = contentRoot.querySelectorAll('.cl-dimmed');
  for (var p = 0; p < prev.length; p++) prev[p].classList.remove('cl-dimmed');

  var focusedNodes = contentRoot.querySelectorAll('.cl-note-heading[data-focused="true"]');
  if (focusedNodes.length === 0) return;
  var focusedSet = new Set();
  for (var fi = 0; fi < focusedNodes.length; fi++) focusedSet.add(focusedNodes[fi]);

  function containsFocused(el) {
    if (focusedSet.has(el)) return true;
    return !!el.querySelector('.cl-note-heading[data-focused="true"]');
  }

  function processContainer(container) {
    var children = container.children;
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      var next = children[i + 1];
      var nextIsBody = next && next.classList && next.classList.contains('cl-section-body');
      if (c.classList && c.classList.contains('cl-note-heading')) {
        if (focusedSet.has(c)) {
          // Focused heading: spare it and its whole subtree.
          if (nextIsBody) i++;
        } else if (nextIsBody && containsFocused(next)) {
          // Chain heading: visible, but recurse into the body to dim siblings.
          processContainer(next);
          i++;
        } else {
          c.classList.add('cl-dimmed');
          if (nextIsBody) { next.classList.add('cl-dimmed'); i++; }
        }
      } else if (c.classList && c.classList.contains('cl-section-body')) {
        // Orphan body (no preceding heading in this container). Treat as
        // chain-or-dim based on whether it contains a focused descendant.
        if (containsFocused(c)) processContainer(c);
        else c.classList.add('cl-dimmed');
      } else {
        c.classList.add('cl-dimmed');
      }
    }
  }

  processContainer(contentRoot);
}

// Click-handler entry point. Optimistically flips data-focused + the eye icon
// on the heading, then notifies the host to persist the 👀 marker. Called from
// the main click delegator in index.js.
export function toggleHeadingFocusUI(headingEl) {
  if (!headingEl) return false;
  var now = headingEl.getAttribute('data-focused') === 'true';
  headingEl.setAttribute('data-focused', now ? 'false' : 'true');
  var icon = headingEl.querySelector('.cl-heading-focus i');
  if (icon) {
    icon.classList.toggle('fa-regular', now);
    icon.classList.toggle('fa-solid', !now);
  }
  applyFocusMode();
  return true;
}
