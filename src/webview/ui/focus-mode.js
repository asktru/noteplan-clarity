// Focus mode for the note view: dims everything outside the focused section(s).
// State lives on the DOM (data-focused="true" on .cl-note-heading) and is
// mirrored on disk by appending/stripping a trailing 👀 on the heading line,
// so it survives reload and is shared with the Donote plugin.

// Recompute dimming based on which headings have data-focused="true".
// Builds the "spared set" = focused headings + their following section-body +
// all ancestor headings + their section-bodies. Everything else inside
// .cl-note-content gets `.cl-dimmed`.
export function applyFocusMode() {
  var main = document.getElementById('cl-main');
  if (!main) return;
  var focused = main.querySelectorAll('.cl-note-heading[data-focused="true"]');
  var prev = main.querySelectorAll('.cl-dimmed');
  for (var p = 0; p < prev.length; p++) prev[p].classList.remove('cl-dimmed');
  if (focused.length === 0) return;

  var allHeadings = Array.prototype.slice.call(main.querySelectorAll('.cl-note-heading'));
  function levelOf(el) {
    var cls = el.className.match(/cl-note-h(\d+)/);
    return cls ? parseInt(cls[1], 10) : 1;
  }

  var spared = new Set();
  for (var f = 0; f < focused.length; f++) {
    var fh = focused[f];
    spared.add(fh);
    var sib = fh.nextElementSibling;
    if (sib && sib.classList.contains('cl-section-body')) spared.add(sib);
    var fhLevel = levelOf(fh);
    var fhIdx = allHeadings.indexOf(fh);
    for (var k = fhIdx - 1; k >= 0 && fhLevel > 1; k--) {
      var anc = allHeadings[k];
      var ancLevel = levelOf(anc);
      if (ancLevel < fhLevel) {
        spared.add(anc);
        var ancSib = anc.nextElementSibling;
        if (ancSib && ancSib.classList.contains('cl-section-body')) spared.add(ancSib);
        fhLevel = ancLevel;
      }
    }
  }

  var contentRoot = main.querySelector('.cl-note-content');
  if (!contentRoot) return;
  var direct = contentRoot.children;
  for (var d = 0; d < direct.length; d++) {
    if (!spared.has(direct[d])) direct[d].classList.add('cl-dimmed');
  }
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
