// Parses the optional `clarity:` front-matter key. Value is a comma-separated
// list of tokens. Recognized tokens: toc, indent, focus, progress. Tokens are
// case-insensitive, whitespace-tolerant. Unknown tokens are ignored.
//
// Returns an object: { toc: bool, indent: bool, focus: bool, progress: bool }.

export function parseClarityFlags(frontmatter) {
  var flags = { toc: false, indent: false, focus: false, progress: false };
  if (!frontmatter) return flags;
  var raw = frontmatter.clarity;
  if (typeof raw !== 'string' || !raw) return flags;
  var tokens = raw.split(',');
  for (var i = 0; i < tokens.length; i++) {
    var t = tokens[i].trim().toLowerCase();
    if (t === 'toc') flags.toc = true;
    else if (t === 'indent') flags.indent = true;
    else if (t === 'focus') flags.focus = true;
    else if (t === 'progress') flags.progress = true;
  }
  return flags;
}

// Inverse: given a flags object, build the canonical comma-separated string.
// Order: toc, indent, focus, progress. Returns null when no flags set, which
// signals applyFrontmatterUpdates() to remove the key entirely.
export function serializeClarityFlags(flags) {
  if (!flags) return null;
  var out = [];
  if (flags.toc) out.push('toc');
  if (flags.indent) out.push('indent');
  if (flags.focus) out.push('focus');
  if (flags.progress) out.push('progress');
  return out.length ? out.join(', ') : null;
}
