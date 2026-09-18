import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Atlas Flight branding is consistent across the title, masthead, loading screen and docs', () => {
  const template = read('src/template.html');
  assert.match(template, /<title>Atlas Flight \| Real Places, Block Flight<\/title>/);
  assert.match(template, /<h1>Atlas Flight<\/h1>/);
  assert.match(template, /class="brand-name">ATLAS <span>\/ FLIGHT<\/span>/);
  assert.match(template, /data-lucide="globe" aria-hidden="true"/);
  assert.match(template, /Real places &nbsp; \/ &nbsp; Block flight/);
  assert.doesNotMatch(template, /Fuji Flight|FUJI <span>|Japan circuits/i);
  assert.match(read('README.md'), /^# Atlas Flight\n/);
  assert.match(JSON.parse(read('package.json')).description, /^Atlas Flight:/);
});

test('the branding change preserves the existing per-map saved-score namespace', () => {
  const source = read('src/game.js');
  const code = source.slice(source.indexOf('  const scoreKey ='), source.indexOf('  const loadBestScore ='));
  const context = { selectedScene: { id: 'yokohama' } };
  runInNewContext(`${code}\nresult = scoreKey();`, context);
  assert.equal(context.result, 'fuji-flight-best-yokohama');
});
