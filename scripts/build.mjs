import { build } from 'esbuild';
import { readFile, writeFile } from 'node:fs/promises';

const result = await build({
  entryPoints: ['src/game.js'],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2022'],
  write: false,
  legalComments: 'inline',
});
const template = await readFile('src/template.html', 'utf8');
const script = result.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
const html = template.replace('<!-- GAME_SCRIPT -->', () => `<script>${script}</script>`);
if (html.includes('<!-- GAME_SCRIPT -->') || /<(?:script|link)[^>]+(?:src|href)=["']https?:/i.test(html)) {
  throw new Error('The artifact must have no external runtime dependencies.');
}
const licenses = await Promise.all(['three', 'cannon-es', 'lucide'].map(async (name) => `${name}\n${await readFile(`node_modules/${name}/LICENSE`, 'utf8')}`));
const artifact = html.replace('</html>', () => `<!-- Third-party licenses\n${licenses.join('\n\n').replace(/-->/g, '-- >')}\n-->\n</html>`);
await writeFile('index.html', artifact);
console.log(`Built offline index.html (${(Buffer.byteLength(artifact) / 1024).toFixed(0)} KB)`);