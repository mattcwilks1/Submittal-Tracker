// Bundles index.html + css + js into one self-contained page body for publishing as a claude.ai artifact.
// The artifact host supplies <!doctype>, <html>, <head> and <body>, so the output starts at <title>.
// Usage: node tools/build-artifact.mjs  → dist/submittal-tracker.html
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const read = (p) => readFileSync(join(root, p), 'utf8');

const head = html.match(/<head>([\s\S]*?)<\/head>/)[1];
const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1];

const title = head.match(/<title>[\s\S]*?<\/title>/)[0];
const fontLinks = (head.match(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/g) || []).join('\n');
const css = head.match(/<link rel="stylesheet" href="(css\/[^"]+)">/g).map((tag) => read(tag.match(/href="([^"]+)"/)[1])).join('\n');

const inlined = body.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => {
  const js = read(src);
  if (/<\/script/i.test(js)) throw new Error(src + ' contains </script>');
  return `<script>/* ${src} */\n${js}</script>`;
});

const out = `${title}\n${fontLinks}\n<style>\n${css}\n</style>\n${inlined.trim()}\n`;
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'submittal-tracker.html'), out);
console.log('dist/submittal-tracker.html', (out.length / 1024).toFixed(1) + ' KB');
