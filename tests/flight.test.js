import test from 'node:test';
import assert from 'node:assert/strict';
import { FlightModel, autopilotInput, crossedGate, ROUTE, GATE_NORMALS, groundHeight, terrainHeight } from '../src/flight.js';
import * as THREE from 'three';
import { getScene } from '../src/scenes.js';

const spawn = getScene().spawn;

test('cruise stays airborne and moves forward at finite speed', () => {
  const flight = new FlightModel();
  for (let frame = 0; frame < 300; frame++) flight.update(1 / 60);
  assert.ok(flight.body.position.z < spawn.z - 900);
  assert.ok(Math.abs(flight.body.position.y - spawn.y) < 1);
  assert.ok(Number.isFinite(flight.speed));
  assert.equal(flight.crashed, false);
});
test('pitch and coordinated bank change the flight path', () => {
  const flight = new FlightModel();
  for (let frame = 0; frame < 180; frame++) flight.update(1 / 60, { pitch: 0.5, roll: -0.5 });
  assert.ok(flight.body.position.y > spawn.y + 100);
  assert.ok(flight.body.position.x > spawn.x + 50);
  assert.ok(flight.heading < 0);
});
test('pause freezes time and position; reset clears flight state', () => {
  const flight = new FlightModel();
  flight.paused = true;
  flight.update(0.05, { pitch: 1, throttle: 1 });
  assert.equal(flight.elapsed, 0);
  assert.equal(flight.body.position.z, spawn.z);
  flight.crashed = true;
  flight.gateIndex = 4;
  flight.reset();
  assert.equal(flight.crashed, false);
  assert.equal(flight.gateIndex, 0);
  assert.equal(flight.paused, false);
});
test('swept gate detection catches fast crossings but rejects near misses', () => {
  const gate = { x: 0, y: 100, z: 0 };
  const normal = { x: 0, y: 0, z: -1 };
  assert.equal(crossedGate({ x: 0, y: 100, z: 300 }, { x: 0, y: 100, z: -300 }, gate, normal), true);
  assert.equal(crossedGate({ x: 200, y: 100, z: 300 }, { x: 200, y: 100, z: -300 }, gate, normal), false);
  assert.equal(crossedGate({ x: 0, y: 100, z: 300 }, { x: 0, y: 100, z: 200 }, gate, normal), false);
});
test('first gate is credited once; free flight does not score gates', () => {
  const flight = new FlightModel();
  const gate = flight.route[0];
  flight.body.position.set(gate.x, gate.y, gate.z + 4);
  flight.update(0.05);
  assert.equal(flight.gateIndex, 1);
  assert.equal(flight.event, 'gate');
  flight.update(0.05);
  assert.equal(flight.gateIndex, 1);
  flight.reset();
  flight.freeFlight = true;
  flight.body.position.set(gate.x, gate.y, gate.z + 4);
  flight.update(0.05);
  assert.equal(flight.gateIndex, 0);
});
test('square gate detection handles vertical, forward and reverse-facing gates', () => {
  const gate = new THREE.Vector3(50, 1100, -200);
  for (const normal of [new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1), new THREE.Vector3(0, 1, 0)]) {
    const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);
    const point = (x, y, z) => new THREE.Vector3(x, y, z).applyQuaternion(rotation).add(gate);
    for (const direction of [-1, 1]) {
      assert.equal(crossedGate(point(120, 120, direction * 300), point(120, 120, -direction * 300), gate, normal), true);
      assert.equal(crossedGate(point(160, 0, direction * 300), point(160, 0, -direction * 300), gate, normal), false);
    }
    assert.equal(crossedGate(point(60, 60, 300), point(60, 60, -300), gate, normal, 50), false);
    assert.equal(crossedGate(point(40, 40, 300), point(40, 40, -300), gate, normal, 50), true);
  }
});
test('crossing a visible gate corner advances the circuit exactly once', () => {
  const flight = new FlightModel();
  const gate = flight.route[0];
  const rotation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3().copy(flight.gateNormals[0]));
  flight.body.position.copy(new THREE.Vector3(120, 120, -2).applyQuaternion(rotation).add(new THREE.Vector3().copy(gate)));
  flight.update(0.05);
  assert.equal(flight.gateIndex, 1);
  assert.equal(flight.event, 'gate');
  const score = flight.score;
  flight.update(0.05);
  assert.equal(flight.gateIndex, 1);
  assert.equal(flight.score, score);
});
test('all gates clear terrain and have unit normals', () => {
  for (const [index, gate] of ROUTE.entries()) {
    assert.ok(gate.y - groundHeight(gate.x, gate.z) > 165, gate.name);
    assert.ok(Math.abs(GATE_NORMALS[index].length() - 1) < 0.0001);
  }
  assert.equal(terrainHeight(-1000, -3000), 46);
  assert.equal(groundHeight(6000, 0), 38);
});
test('terrain contact and world boundary end the flight', () => {
  const flight = new FlightModel();
  flight.body.position.y = 39;
  flight.update(1 / 60);
  assert.equal(flight.crashed, true);
  assert.equal(flight.event, 'crash');
  flight.reset();
  flight.body.position.x = 11800;
  flight.update(1 / 60);
  assert.equal(flight.event, 'boundary');
});
test('afterburner increases speed and throttle remains bounded', () => {
  const normal = new FlightModel();
  const boosted = new FlightModel();
  for (let frame = 0; frame < 360; frame++) {
    normal.update(1 / 60);
    boosted.update(1 / 60, { boost: true, throttle: 1 });
  }
  assert.ok(boosted.speed > normal.speed + 50);
  assert.equal(boosted.throttle, 1);
});

test('route autopilot can complete all eight gates without terrain contact', () => {
  const flight = new FlightModel();
  for (let frame = 0; frame < 60 * 300 && !flight.completed && !flight.crashed; frame++) {
    flight.update(1 / 60, autopilotInput(flight));
  }
  assert.equal(flight.crashed, false);
  assert.equal(flight.gateIndex, 8);
  assert.equal(flight.completed, true);
});

test('physics and steering agree at 30, 60, and 120 render frames per second', () => {
  const flights = [30, 60, 120].map((rate) => {
    const flight = new FlightModel();
    for (let frame = 0; frame < rate * 4; frame++) flight.update(1 / rate, { pitch: 0.15, roll: -0.2, boost: true });
    return flight;
  });
  for (const flight of flights.slice(1)) {
    assert.ok(flight.body.position.distanceTo(flights[0].body.position) < 0.00001);
    assert.ok(Math.abs(flight.speed - flights[0].speed) < 0.00001);
  }
});