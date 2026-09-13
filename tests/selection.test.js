import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import * as THREE from 'three';
import { createWorld } from '../src/world.js';
import { localDayPeriod } from '../src/settings.js';
import { SCENES, groundHeight } from '../src/scenes.js';

const source = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
const sceneHandler = source.slice(source.indexOf("  element('scene-setting').onchange"), source.indexOf("  element('camera-options').onclick"));
const lighting = source.slice(source.indexOf('  function applyLighting()'), source.indexOf("  element('fullscreen-button').onclick"));
const selectionLabels = source.slice(source.indexOf('  function updateSelectionLabels()'), source.indexOf("  element('aircraft-setting').onchange"));

test('photo mode labels follow the selected scene, including switching back to Fuji', () => {
  const template = readFileSync(new URL('../src/template.html', import.meta.url), 'utf8');
  assert.ok(/<span id="photo-label" class="photo-label">/.test(template), 'photo label has a stable DOM id');
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { querySelector: () => ({}) });
    return elements.get(id);
  };
  const context = {
    element, canvas: { setAttribute() {} }, landmarkPosition: new THREE.Vector3(),
    selectedAircraft: { name: 'F-35A', supportsAfterburner: true },
  };
  for (const selectedScene of [...SCENES, SCENES[0]]) {
    context.selectedScene = selectedScene;
    runInNewContext(`${selectionLabels}\nupdateSelectionLabels();`, context);
    assert.equal(element('photo-label').textContent, `${selectedScene.name.toUpperCase()} / PHOTO`);
  }
});

test('every scene positions its landmark label at a finite world-space summit or rooftop', () => {
  const element = () => ({ setAttribute() {}, querySelector: () => ({}) });
  const landmarkPosition = new THREE.Vector3();
  const camera = new THREE.PerspectiveCamera(56, 1, 0.15, 42000);
  for (const selectedScene of SCENES) {
    const context = {
      element, canvas: element(), selectedScene, landmarkPosition,
      selectedAircraft: { name: 'F-35A', supportsAfterburner: true },
    };
    runInNewContext(`${selectionLabels}\nupdateSelectionLabels();`, context);
    const { x, z, height } = selectedScene.landmark;
    const expectedAltitude = ['fuji', 'alps'].includes(selectedScene.id)
      ? height : groundHeight(x, z, selectedScene.id) + height;
    assert.deepEqual(landmarkPosition.toArray(), [x, expectedAltitude, z], selectedScene.name);
    camera.position.set(x, expectedAltitude, z + 1000);
    camera.lookAt(landmarkPosition);
    camera.updateMatrixWorld();
    const projected = landmarkPosition.clone().project(camera);
    assert.ok(projected.toArray().every(Number.isFinite), selectedScene.name);
    assert.ok(Math.abs(projected.x) < 1e-8 && Math.abs(projected.y) < 1e-8);
    assert.ok(projected.z < 1);
  }
});

test('scene selection disposes the old world, resets its flight, and remains paused in settings', () => {
  for (const freeFlight of [false, true]) {
    const elements = new Map();
    const element = (id) => {
      if (!elements.has(id)) elements.set(id, {});
      return elements.get(id);
    };
    const calls = [];
    const nextWorld = { scene: { add: () => calls.push('attach') } };
    const context = {
      element, selectedScene: { id: 'fuji' }, aircraft: { jet: {} }, palette() {},
      world: { scene: { remove: () => calls.push('detach') }, dispose: () => calls.push('dispose') },
      getScene: (id) => ({ id }),
      createWorld: () => nextWorld,
      flight: { freeFlight, paused: true, throttle: 0.6, setScene: () => calls.push('reset') },
      settingsWasPaused: false,
      loadBestScore: () => calls.push('score'),
      rebuildMap: () => calls.push('map'),
      updateSelectionLabels: () => calls.push('labels'),
      restart: (mode) => { assert.equal(mode, freeFlight); context.flight.paused = false; },
      applyLighting: () => calls.push('lighting'),
    };
    runInNewContext(sceneHandler, context);
    element('scene-setting').onchange({ target: { value: 'tokyo' } });
    assert.equal(context.selectedScene.id, 'tokyo');
    assert.equal(context.world, nextWorld);
    assert.equal(context.flight.paused, true);
    assert.deepEqual(calls, ['detach', 'dispose', 'attach', 'reset', 'score', 'map', 'labels', 'lighting']);
    element('scene-setting').onchange({ target: { value: 'tokyo' } });
    assert.equal(calls.length, 8, 'reselecting the active scene is a no-op');
  }
});

test('lighting changes the real world sky, sun, ambient light, stars and moon without restarting flight', (t) => {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { value: id === 'day-setting' ? 'night' : 'morning' });
    return elements.get(id);
  };
  const colors = {
    'night-top': '#101831', 'night-horizon': '#394273', 'sky-top': '#528ec6',
    'sky-horizon': '#f5d9b0', snow: '#ffffff', moon: '#d6e7ff', sun: '#fff2cf',
  };
  const palette = (name) => colors[name] ?? '#ffffff';
  const world = createWorld(palette);
  t.after(() => world.dispose());
  const context = {
    THREE, element, palette, localDayPeriod,
    selectedScene: { latitude: 35.36, longitude: 138.73 }, lightMinute: -1, dayPeriod: 'day',
    world,
    renderer: {},
  };
  runInNewContext(lighting, context);
  element('day-setting').onchange();
  assert.equal(context.dayPeriod, 'night');
  assert.equal(context.world.sky.material.uniforms.daylight.value, 0);
  assert.equal(context.world.stars.visible, true);
  assert.equal(context.world.moon.visible, true);
  assert.equal(element('light-setting').disabled, true);
  assert.equal(context.world.sun.intensity, 0.35);
  assert.ok(world.sky.material.uniforms.sunlight.value.equals(new THREE.Color(colors.moon)));
  element('day-setting').value = 'day';
  element('day-setting').onchange();
  assert.equal(context.dayPeriod, 'day');
  assert.equal(context.world.sky.material.uniforms.daylight.value, 1);
  assert.equal(context.world.stars.visible, false);
  assert.equal(context.world.moon.visible, false);
  assert.equal(context.world.hemisphere.intensity, 1.85);
  assert.equal(element('light-setting').disabled, false);
  for (const style of ['morning', 'golden', 'noon', 'golden', 'morning']) {
    element('light-setting').value = style;
    element('light-setting').onchange();
    const expected = new THREE.Color(colors[style === 'golden' ? 'sky-horizon' : 'sun']);
    assert.ok(world.sun.color.equals(expected), style);
    assert.ok(world.sky.material.uniforms.sunlight.value.equals(expected), style);
  }
});
