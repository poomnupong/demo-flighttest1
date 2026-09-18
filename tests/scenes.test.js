import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENES, DEFAULT_SCENE, getScene, terrainHeight, groundHeight, lakeDistance, intersectsScenery } from '../src/scenes.js';
import { FlightModel, autopilotInput, crossedGate, ROUTE, GATE_NORMALS, GATE_RADIUS } from '../src/flight.js';
import { createWorld } from '../src/world.js';
import * as THREE from 'three';

test('only map-backed Yokohama is registered and defaults are consistent', () => {
  assert.deepEqual(SCENES.map(({ id }) => id), ['yokohama']);
  assert.equal(DEFAULT_SCENE, 'yokohama');
  const scene = getScene();
  assert.equal(getScene('yokohama'), scene);
  assert.equal(new FlightModel().sceneId, scene.id);
  assert.ok(scene.name && scene.description && scene.landmark.name && scene.landmark.height > 0);
  assert.ok(scene.references.every((url) => url.startsWith('https://')));
  assert.ok(scene.horizontalScale.includes('Uncompressed'));
  assert.equal(scene.blocks.length, scene.collisionBounds.length);
  assert.equal(ROUTE, scene.route);
  assert.equal(GATE_NORMALS.length, ROUTE.length);
  for (const id of ['fuji', 'kamakura', 'alps', 'kyoto', 'himeji', 'tokyo', 'missing']) {
    assert.throws(() => getScene(id), RangeError);
    assert.throws(() => terrainHeight(0, 0, id), RangeError);
    assert.throws(() => groundHeight(0, 0, id), RangeError);
    assert.throws(() => lakeDistance(0, 0, id), RangeError);
    assert.throws(() => createWorld(() => '#88aacc', id), RangeError);
  }
});

test('mapped terrain and schematic outer ground stay finite across the flight area', () => {
  assert.equal(groundHeight(6000, 0), 38);
  for (const x of [-11000, -5000, 0, 5000, 11000]) {
    assert.ok(Number.isFinite(terrainHeight(x, x)));
    assert.ok(Number.isFinite(lakeDistance(x, x)));
    assert.ok(groundHeight(x, x) >= 38);
  }
});

for (const scene of SCENES) {
  test(`${scene.name}: route safely completes all eight gates`, () => {
    const flight = new FlightModel(scene.id);
    assert.equal(flight.route, scene.route);
    for (const [index, gate] of flight.route.entries()) {
      assert.ok(gate.y - groundHeight(gate.x, gate.z, scene.id) > GATE_RADIUS, gate.name);
      assert.ok(Math.abs(flight.gateNormals[index].length() - 1) < 1e-8);
    }
    let minimumClearance = Infinity;
    for (let frame = 0; frame < 18000 && !flight.completed && !flight.crashed; frame++) {
      flight.update(1 / 60, autopilotInput(flight));
      minimumClearance = Math.min(minimumClearance, flight.clearance);
    }
    assert.equal(flight.crashed, false);
    assert.equal(flight.completed, true);
    assert.equal(flight.gateIndex, 8);
    assert.ok(minimumClearance > 200);
    flight.reset();
    assert.equal(flight.sceneId, scene.id);
    assert.equal(flight.completed, false);
    assert.equal(flight.gateIndex, 0);
  });

  test(`${scene.name}: box-only instanced world disposes shared resources once`, () => {
    const world = createWorld(() => '#88aacc', scene.id);
    const resources = new Set();
    let instances = 0;
    world.scene.traverse((object) => {
      if (object.geometry) {
        assert.equal(object.geometry.type, 'BoxGeometry', object.name);
        resources.add(object.geometry);
      }
      if (object.material) resources.add(object.material);
      if (object.isInstancedMesh) { instances++; resources.add(object); }
    });
    assert.ok(instances >= 5);
    assert.ok(world.terrain.count > 10000);
    assert.equal(world.landmarks.count, scene.blocks.length);
    assert.equal(world.gates.length, scene.route.length);
    assert.ok(world.hemisphere.isHemisphereLight && world.moon.isMesh && world.stars.isInstancedMesh);
    assert.equal(world.stars.visible, false);
    const calls = new Map();
    for (const resource of resources) resource.addEventListener('dispose', () => calls.set(resource, (calls.get(resource) || 0) + 1));
    world.dispose();
    world.dispose();
    assert.equal(world.scene.children.length, 0);
    assert.equal(calls.size, resources.size);
    assert.ok([...calls.values()].every((count) => count === 1));
  });

  test(`${scene.name}: square gate scoring matches rendered corners and edges`, (t) => {
    const world = createWorld(() => '#88aacc', scene.id);
    t.after(() => world.dispose());
    const flight = new FlightModel(scene.id);
    for (const [index, gate] of world.gates.entries()) {
      gate.updateMatrixWorld();
      const point = (x, y, z) => gate.localToWorld(new THREE.Vector3(x, y, z));
      const crossing = (x, y) => crossedGate(point(x, y, 300), point(x, y, -300), flight.route[index], flight.gateNormals[index]);
      for (const x of [-120, 120]) for (const y of [-120, 120]) assert.equal(crossing(x, y), true);
      const halfSize = GATE_RADIUS - 15;
      for (const sign of [-1, 1]) {
        assert.equal(crossing(sign * (halfSize - 0.01), 0), true);
        assert.equal(crossing(0, sign * (halfSize - 0.01)), true);
        assert.equal(crossing(sign * (halfSize + 0.01), 0), false);
        assert.equal(crossing(0, sign * (halfSize + 0.01)), false);
      }
      assert.equal(crossedGate(point(0, 0, 300), point(0, 0, 200), flight.route[index], flight.gateNormals[index]), false);
      assert.equal(crossedGate(point(-50, 0, 100), point(50, 0, 100), flight.route[index], flight.gateNormals[index]), false);
    }
  });

  test(`${scene.name}: rendered structures share swept collision bounds`, () => {
    const block = scene.blocks.find(({ kind }) => kind === 'building');
    const [x, y, z] = block.position, halfWidth = block.size[0] / 2;
    assert.equal(intersectsScenery({ x: x - halfWidth - 20, y, z }, { x: x + halfWidth + 20, y, z }, scene.id), true);
    assert.equal(intersectsScenery({ x, y: 9000, z }, { x: x + 100, y: 9000, z }, scene.id), false);
    const flight = new FlightModel(scene.id);
    flight.body.position.set(x, y, z);
    flight.update(1 / 60);
    assert.equal(flight.crashed, true);
    assert.equal(flight.event, 'crash');
  });
}

test('scene reset clears flight state and retired IDs are rejected atomically', () => {
  const flight = new FlightModel();
  flight.gateIndex = 5;
  flight.paused = true;
  flight.freeFlight = true;
  flight.setScene('yokohama');
  assert.equal(flight.sceneId, 'yokohama');
  assert.equal(flight.gateIndex, 0);
  assert.equal(flight.paused, false);
  assert.equal(flight.freeFlight, false);
  assert.equal(flight.route, getScene().route);
  const { x, y, z } = getScene().spawn;
  assert.equal(flight.clearance, y - groundHeight(x, z));
  for (const id of ['fuji', 'himeji', 'missing']) {
    assert.throws(() => flight.setScene(id), RangeError);
    assert.equal(flight.sceneId, 'yokohama');
  }
});
