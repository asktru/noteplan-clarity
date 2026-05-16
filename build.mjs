// Build script for the Clarity webview bundle.
//
// Source modules live in `src/webview/`. The entry point at
// `src/webview/index.js` pulls in every module and runs the bootstrap. esbuild
// bundles the tree into a single IIFE at `clarityEvents.js` at the repo root
// — that's the file NotePlan actually loads into the plugin's HTML window.
//
// `sendMessageToPlugin` is injected into the HTML window by NotePlan's plugin
// bridge, so we mark it external (not that it's `import`ed anywhere, but this
// keeps esbuild from warning if a module ever references it by name).

import { build, context } from 'esbuild';

const watch = process.argv.includes('--watch');

const options = {
  entryPoints: ['src/webview/index.js'],
  bundle: true,
  format: 'iife',
  target: 'es2017',
  outfile: 'clarityEvents.js',
  legalComments: 'none',
  logLevel: 'info',
  // External map keeps the shipped JS small in git; Safari Web Inspector picks
  // it up from the sibling .map file when debugging the NotePlan window.
  sourcemap: true,
};

if (watch) {
  const ctx = await context(options);
  await ctx.watch();
  console.log('[clarity] watching src/webview/ for changes...');
} else {
  await build(options);
  console.log('[clarity] built clarityEvents.js');
}
