import test from 'node:test';
import assert from 'node:assert/strict';
import { pitchInput, localDayPeriod } from '../src/settings.js';

test('inverted Y is the default for keyboard and touch, not bank or camera', () => {
  for (const key of ['KeyW', 'ArrowUp']) assert.equal(pitchInput(new Set([key])), -1);
  for (const key of ['KeyS', 'ArrowDown']) assert.equal(pitchInput(new Set([key])), 1);
  assert.equal(pitchInput(new Set(), 1), -1);
  assert.equal(pitchInput(new Set(), -1), 1);
  assert.equal(pitchInput(new Set(['KeyW']), 0, 1.5, false), 1.5);
  assert.equal(pitchInput(new Set(), 1, 1, false), 1);
  assert.equal(pitchInput(new Set(['KeyW', 'KeyS'])), 0);
});

test('automatic lighting uses the scene location rather than the device timezone', () => {
  for (const latitude of [34.8, 35.4, 36.3]) {
    assert.equal(localDayPeriod(new Date('2026-09-13T03:00:00Z'), latitude, 139), 'day');
    assert.equal(localDayPeriod(new Date('2026-09-13T15:00:00Z'), latitude, 139), 'night');
  }
  const sameInstant = new Date('2026-09-13T03:00:00Z');
  assert.equal(localDayPeriod(sameInstant, 35, -40), 'night');
});

test('automatic daylight accounts for seasons, including the previous UTC date', () => {
  assert.equal(localDayPeriod(new Date('2026-06-20T20:00:00Z'), 35.7, 139.7), 'day');
  assert.equal(localDayPeriod(new Date('2026-12-20T20:00:00Z'), 35.7, 139.7), 'night');
  assert.equal(localDayPeriod(new Date('2026-06-21T09:00:00Z'), 35.7, 139.7), 'day');
  assert.equal(localDayPeriod(new Date('2026-12-21T09:00:00Z'), 35.7, 139.7), 'night');
  assert.equal(localDayPeriod(new Date('2028-02-29T03:00:00Z'), 35.7, 139.7), 'day');
  assert.equal(localDayPeriod(new Date('2028-02-29T15:00:00Z'), 35.7, 139.7), 'night');
});
