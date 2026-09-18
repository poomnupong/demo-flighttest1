import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { getScene, terrainHeight, EXTENT } from '../src/scenes.js';
import { getAircraft, DEFAULT_AIRCRAFT } from '../src/aircraft.js';

const source = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');

test('initial aircraft and dropdown defaults explicitly select F-22 and daytime', () => {
  assert.equal(DEFAULT_AIRCRAFT, 'f22');
  assert.equal(getAircraft().id, DEFAULT_AIRCRAFT);
  assert.throws(() => getAircraft('missing'), RangeError);
  assert.ok(source.includes("element('aircraft-setting').value = selectedAircraft.id"));
  assert.ok(source.includes("element('scene-setting').value = selectedScene.id"));
  const template = readFileSync(new URL('../src/template.html', import.meta.url), 'utf8');
  const selector = template.match(/<select id="day-setting">([\s\S]*?)<\/select>/)[1];
  assert.deepEqual([...selector.matchAll(/<option value="([^"]+)" selected>/g)].map((match) => match[1]), ['day']);
  assert.ok(selector.includes('value="auto"') && selector.includes('value="night"'));
});

test('waterfront minimap uses scene bounds, sampled geography and expands for free flight', () => {
  const calls = [];
  const drawing = {
    fillRect() { calls.push(this.fillStyle); }, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {},
    stroke() {}, setLineDash() {}, arc() {}, fill() {}, save() {}, translate() {}, rotate() {}, closePath() {}, restore() {},
  };
  const map = { width: 332, height: 274, getContext: () => drawing };
  const flight = { freeFlight: true, body: { position: { x: 0, z: -3000 } }, heading: 0 };
  const context = {
    element: () => map, document: { createElement: () => ({ getContext: () => drawing }) },
    selectedScene: getScene('yokohama'), flight, terrainHeight, EXTENT, palette: (name) => name,
  };
  const code = source.slice(source.indexOf("  const map = element('minimap');"), source.indexOf('  const ticks = [];'));
  runInNewContext(`${code}\nrebuildMap(); result = mapPoint(flight.body.position);`, context);
  assert.ok(context.result.x > 0 && context.result.x < map.width);
  assert.ok(context.result.y > 0 && context.result.y < map.height);
  assert.ok(calls.includes('water') && calls.includes('urban'));
  assert.equal(calls.includes('grass'), false);
  flight.body.position = { x: 11000, z: 7000 };
  runInNewContext('drawMap(); result = mapPoint(flight.body.position);', context);
  assert.ok(context.result.x > 0 && context.result.x < map.width);
  assert.ok(context.result.y > 0 && context.result.y < map.height);
  context.selectedScene = { id: 'yokohama' };
  runInNewContext('rebuildMap(); result = mapPoint({x: 0, z: 0});', context);
  assert.equal(context.result.x, 166);
  assert.equal(context.result.y, 137);
});

test('Yokohama photo exports include attribution without modifying the WebGL canvas', () => {
  const code = source.slice(source.indexOf("  element('save-photo').onclick"), source.indexOf("  canvas.addEventListener('webglcontextlost'"));
  for (const scene of ['yokohama', 'unmapped-fixture']) {
    const button = {}, texts = [], draws = [], notices = [];
    const context2d = { drawImage: (image) => draws.push(image), fillRect() {}, fillText: (text) => texts.push(text) };
    const photo = { getContext: () => context2d, toDataURL: () => 'data:image/png;attributed' };
    const original = { width: 500, height: 300, toDataURL: () => 'data:image/png;original' };
    const link = { click() { this.clicked = true; }, remove() {} };
    const context = {
      element: () => button, renderer: { render() {} }, world: { scene: {} }, camera: {},
      canvas: original, selectedScene: { id: scene }, palette: (name) => name,
      notify: (message) => notices.push(message),
      document: { createElement: (type) => type === 'canvas' ? photo : link, body: { append() {} } },
    };
    runInNewContext(code, context);
    button.onclick();
    assert.equal(link.clicked, true);
    assert.equal(link.download, 'atlas-flight.png');
    assert.equal(link.href, scene === 'yokohama' ? 'data:image/png;attributed' : 'data:image/png;original');
    if (scene === 'yokohama') {
      assert.ok(texts.some((text) => text.includes('OpenStreetMap contributors')));
      assert.ok(texts.some((text) => text.includes('openstreetmap.org/copyright')));
      assert.equal(draws[0], original);
      assert.equal(photo.width, original.width);
      assert.equal(photo.height, original.height);
      photo.getContext = () => null;
      button.onclick();
      assert.deepEqual(notices, ['Photo export is unavailable in this browser']);
    } else assert.equal(texts.length, 0);
  }
});

test('attribution is outside the hidden flight HUD and remains available in photo mode', () => {
  const template = readFileSync(new URL('../src/template.html', import.meta.url), 'utf8');
  assert.ok(template.indexOf('<aside id="map-attribution"') > template.indexOf('</dialog>'));
  assert.ok(template.includes('https://opendatacommons.org/licenses/odbl/1-0/'));
  assert.ok(source.includes("element('map-attribution').hidden = selectedScene.id !== 'yokohama'"));
  assert.ok(source.includes("element('map-snapshot-date').textContent = selectedScene.mapSnapshot || ''"));
});
