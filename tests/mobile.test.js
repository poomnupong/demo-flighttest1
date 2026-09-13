import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('../src/game.js', import.meta.url), 'utf8');
const clearInput = source.slice(source.indexOf('  function clearInput()'), source.indexOf('  function pause('));
const controls = source.slice(source.indexOf("  const stick = element('stick');"), source.indexOf("  element('camera-button').onclick"));

function setup() {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      const listeners = new Map();
      elements.set(id, {
        style: {},
        addEventListener: (type, callback) => listeners.set(type, callback),
        setPointerCapture() {},
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 104, height: 104 }),
        dispatch: (type, pointerId = 1, clientX = 90, clientY = 14) =>
          listeners.get(type)?.({ pointerId, clientX, clientY }),
      });
    }
    return elements.get(id);
  };
  const context = {
    element,
    keys: new Set(),
    touch: { roll: 0, pitch: 0, throttle: 0, boost: false },
    flight: { paused: false, crashed: false, completed: false },
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    setAutopilot: (enabled) => { context.autopilot = enabled; },
    autopilot: true,
  };
  runInNewContext(`${clearInput}\n${controls}\nthis.clear = clearInput;`, context);
  return context;
}

test('touch joystick takes manual control and recenters on release or cancellation', () => {
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    const game = setup();
    const stick = game.element('stick');
    stick.dispatch('pointerdown');
    assert.equal(game.autopilot, false);
    assert.equal(game.touch.roll, -1);
    assert.equal(game.touch.pitch, 1);
    stick.dispatch(event);
    assert.equal(game.touch.roll, 0);
    assert.equal(game.touch.pitch, 0);
    assert.equal(game.element('stick-knob').style.transform, '');
  }
});

test('joystick ignores other fingers and cannot reactivate after inputs are cleared', () => {
  const game = setup();
  const stick = game.element('stick');
  stick.dispatch('pointerdown');
  stick.dispatch('pointerdown', 2, 14, 90);
  stick.dispatch('pointerup', 2);
  assert.equal(game.touch.roll, -1);
  game.clear();
  stick.dispatch('pointermove');
  assert.equal(game.touch.roll, 0);
  assert.equal(game.element('stick-knob').style.transform, '');
  game.flight.paused = true;
  game.autopilot = true;
  stick.dispatch('pointerdown');
  assert.equal(game.autopilot, true);
  assert.equal(game.touch.pitch, 0);
});

test('touch boost and throttle release on cancellation and input clearing', () => {
  for (const [id, field, active, idle] of [
    ['touch-boost', 'boost', true, false],
    ['touch-throttle-up', 'throttle', 1, 0],
    ['touch-throttle-down', 'throttle', -1, 0],
  ]) {
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'clear']) {
      const game = setup();
      const button = game.element(id);
      button.dispatch('pointerdown');
      assert.equal(game.touch[field], active);
      if (event === 'clear') game.clear();
      else button.dispatch(event);
      assert.equal(game.touch[field], idle);
    }
  }
});
