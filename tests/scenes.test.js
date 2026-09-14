import test from 'node:test';
import assert from 'node:assert/strict';
import { SCENES, getScene, FUJI, CELL, terrainHeight, groundHeight, lakeDistance, intersectsScenery } from '../src/scenes.js';
import { FlightModel, autopilotInput, crossedGate, ROUTE, GATE_NORMALS, GATE_RADIUS } from '../src/flight.js';
import { createWorld } from '../src/world.js';
import { GEODATA_OVERLAYS } from '../src/data/geodata.generated.js';
import * as THREE from 'three';

test('seven public-reference scenes expose the reusable selection contract', () => {
  assert.deepEqual(SCENES.map(({ id }) => id), ['fuji', 'kamakura', 'alps', 'kyoto', 'himeji', 'tokyo', 'yokohama']);
  for (const scene of SCENES) {
    assert.equal(getScene(scene.id), scene);
    assert.ok(scene.name && scene.description && scene.landmark.name && scene.landmark.height > 0);
    assert.ok(scene.latitude >= 34 && scene.latitude <= 37);
    assert.ok(scene.longitude >= 134 && scene.longitude <= 140);
    assert.ok(scene.references.every((url) => url.startsWith('https://')));
    assert.ok(scene.horizontalScale.includes('ompressed'));
    assert.equal(scene.blocks.length, scene.collisionBounds.length);
  }
  assert.throws(() => getScene('missing'), RangeError);
  assert.throws(() => terrainHeight(0, 0, 'missing'), RangeError);
  assert.equal(ROUTE, getScene().route);
  assert.equal(GATE_NORMALS.length, ROUTE.length);
});

test('Fuji summit is 3776 m, with a 700–800 m crater and a 200 m depression', () => {
  assert.equal(terrainHeight(FUJI.x, FUJI.z), 3576);
  for (const radius of [350, 375, 400]) assert.equal(terrainHeight(FUJI.x + radius, FUJI.z), 3776);
  assert.ok(terrainHeight(FUJI.x + 450, FUJI.z) < 3776);
  assert.equal(getScene().crater.diameter, 750);
  assert.equal(getScene().crater.depth, 200);
  let summit = 0;
  for (let x = FUJI.x - 600 + CELL / 2; x < FUJI.x + 600; x += CELL) {
    for (let z = FUJI.z - 600 + CELL / 2; z < FUJI.z + 600; z += CELL) summit = Math.max(summit, groundHeight(x, z));
  }
  assert.equal(summit, 3776, 'rendered voxel summit retains the calibrated elevation');
  assert.ok(summit - groundHeight(FUJI.x, FUJI.z) >= 190);
});

test('terrain and water match each region rather than reusing the Fuji cone', () => {
  assert.equal(groundHeight(0, 0), 38);
  assert.equal(groundHeight(0, 0, 'kamakura'), 38);
  assert.ok(groundHeight(-2200, -2300, 'kamakura') > 100);
  assert.ok(groundHeight(-4200, -5100, 'alps') > 3000);
  assert.ok(groundHeight(0, -5100, 'alps') < 600);
  assert.ok(groundHeight(-11000, -8000, 'kyoto') > 700);
  assert.ok(groundHeight(-1000, -3400, 'himeji') > groundHeight(0, 0, 'himeji'));
  assert.equal(groundHeight(6000, 0, 'tokyo'), 38);
  assert.equal(groundHeight(6000, 0, 'yokohama'), 38);
  const signatures = SCENES.map(({ id }) => [-6000, -2000, 0, 2000, 6000].map((x) => terrainHeight(x, -2500, id)).join(','));
  assert.equal(new Set(signatures).size, 7);
  for (const { id } of SCENES) for (const x of [-11000, -5000, 0, 5000, 11000]) {
    assert.ok(Number.isFinite(terrainHeight(x, x, id)));
    assert.ok(Number.isFinite(lakeDistance(x, x, id)));
    assert.ok(groundHeight(x, x, id) >= 38);
  }
});

test('Himeji and Yokohama include richer landmark detail with proportional anchors', () => {
  const himeji = getScene('himeji');
  const yokohama = getScene('yokohama');
  const himejiKeep = himeji.blocks.find(({ name }) => name === 'Himeji white main keep');
  const himejiSubsidiary = himeji.blocks.find(({ name }) => name === 'Himeji subsidiary keep');
  assert.ok(himeji.blocks.some(({ name }) => name === 'Himeji moat'));
  assert.ok(himeji.blocks.some(({ name }) => name === 'Himeji castle town'));
  assert.ok(himejiKeep && himejiSubsidiary);
  assert.ok(himejiKeep.size[1] > himejiSubsidiary.size[1]);
  for (const landmark of ['Nippon Maru hull', 'Geodata Yamashita Park lawn', 'Geodata Osanbashi deck', 'Geodata Cosmo World plaza']) {
    assert.ok(yokohama.blocks.some(({ name }) => name === landmark), `${landmark} exists`);
  }
  assert.ok(yokohama.blocks.some(({ name }) => name.startsWith('Geodata road')), 'Yokohama geodata roads exist');
  assert.ok(himeji.blocks.some(({ name }) => name.startsWith('Geodata castle town block')), 'Himeji geodata town blocks exist');
  const tower = yokohama.blocks.find(({ name }) => name === 'Landmark Tower stepped crown');
  assert.ok(tower);
  assert.ok(tower.size[1] === 37);
});

test('colliding Yokohama landmarks use sourced coordinates instead of displacing city blocks', () => {
  const scene = getScene('yokohama');
  const overlays = GEODATA_OVERLAYS.overlays.yokohama;
  const ship = overlays.find(({ name }) => name === 'Geodata Nippon Maru hull');
  const tower = overlays.find(({ name }) => name === 'Geodata Landmark Tower plaza');
  for (const name of ['Nippon Maru hull', 'Nippon Maru deckhouse', 'Nippon Maru mast']) {
    const parts = scene.blocks.filter((block) => block.name === name);
    assert.equal(parts.length, 1);
    assert.equal(parts[0].position[0], ship.x);
    assert.equal(parts[0].position[2], ship.z);
  }
  assert.ok(!scene.blocks.some(({ name }) => name === 'Geodata Nippon Maru hull' || name === 'Geodata Nippon Maru deckhouse'));
  assert.equal(scene.landmark.x, tower.x);
  assert.equal(scene.landmark.z, tower.z);
  for (const block of scene.blocks.filter(({ name }) => name === 'Landmark Tower stepped crown')) {
    assert.equal(block.position[0], tower.x);
    assert.equal(block.position[2], tower.z);
  }
  for (const x of [-660, -540]) {
    assert.ok(scene.blocks.some((block) => block.name === 'Geodata city block' && block.position[0] === x && block.position[2] === -3540),
      'city blocks at the old stylized ship position are retained');
  }
});

test('misplaced Yokohama landmarks are discarded rather than displacing sourced artifacts', () => {
  const { blocks } = getScene('yokohama');
  for (const prefix of ['Yamashita Park ', 'Osan Pier ', 'Cosmo Clock ']) {
    assert.ok(!blocks.some(({ name }) => name.startsWith(prefix)), `${prefix} placeholder is removed`);
  }
  assert.deepEqual(blocks.filter(({ name }) => name === 'Harbor pier').map(({ position }) => position[2]),
    [-800, -1750, -3650], 'only the harbor pier conflicting with sourced Osanbashi is removed');
  for (const name of ['Geodata Yamashita Park lawn', 'Geodata Osanbashi deck', 'Geodata Osanbashi terminal', 'Geodata Cosmo World plaza']) {
    const overlay = GEODATA_OVERLAYS.overlays.yokohama.find((entry) => entry.name === name);
    const matches = blocks.filter((block) => block.name === name);
    assert.equal(matches.length, 1, `${name} has one representation`);
    const [block] = matches;
    assert.deepEqual(block.position, [overlay.x, groundHeight(overlay.x, overlay.z, 'yokohama') + overlay.h / 2, overlay.z]);
    assert.deepEqual(block.size, [overlay.w, overlay.h, overlay.d]);
    assert.equal(block.color, overlay.color);
    for (const legacy of blocks.filter(({ name }) => !name.startsWith('Geodata '))) {
      assert.ok(
        Math.abs(block.position[0] - legacy.position[0]) >= (block.size[0] + legacy.size[0]) / 2 ||
        Math.abs(block.position[2] - legacy.position[2]) >= (block.size[2] + legacy.size[2]) / 2,
        `${name} overlaps ${legacy.name}`,
      );
    }
  }
  for (const [x, y, z] of [[100, 200, -3300], [1750, 40, -1650], [2390, 48, -1880], [1750, 42, -2700]]) {
    const point = { x, y, z };
    assert.equal(intersectsScenery(point, point, 'yokohama', 0), false, 'removed landmarks leave no ghost colliders');
  }
});

test('geodata town blocks leave hand-authored and sourced landmark footprints clear', () => {
  for (const id of ['himeji', 'yokohama']) {
    const { blocks } = getScene(id);
    const townBlocks = blocks.filter(({ name }) => name === 'Geodata city block' || name === 'Geodata castle town block');
    const landmarks = blocks.filter(({ name }) => !name.startsWith('Geodata road ') &&
      name !== 'Geodata city block' && name !== 'Geodata castle town block' &&
      name !== 'Building' && name !== 'Building roof');
    assert.ok(townBlocks.length > 0, `${id} retains geodata town blocks`);
    assert.ok(landmarks.length > 0, `${id} retains landmarks`);
    for (const town of townBlocks) for (const landmark of landmarks) {
      assert.ok(
        Math.abs(town.position[0] - landmark.position[0]) >= (town.size[0] + landmark.size[0]) / 2 ||
        Math.abs(town.position[2] - landmark.position[2]) >= (town.size[2] + landmark.size[2]) / 2,
        `${id} town block at ${town.position} overlaps ${landmark.name}`,
      );
    }
  }
});

test('Nippon Maru park retains its sourced footprint without overlapping town fills', () => {
  const { blocks } = getScene('yokohama');
  const park = GEODATA_OVERLAYS.overlays.yokohama.find(({ name }) => name === 'Geodata Nippon Maru park');
  const renderedPark = blocks.find(({ name }) => name === park.name);
  assert.equal(renderedPark.position[0], park.x);
  assert.equal(renderedPark.position[2], park.z);
  assert.equal(renderedPark.size[0], park.w);
  assert.equal(renderedPark.size[2], park.d);
  assert.ok(!blocks.some(({ name, position }) =>
    name === 'Geodata city block' && position[0] === -780 && position[2] === -2820));
});

for (const scene of SCENES) {
  test(`${scene.name}: scene-local route safely completes all eight gates`, () => {
    const flight = new FlightModel(scene.id);
    assert.equal(flight.sceneId, scene.id);
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

  test(`${scene.name}: instanced world is boxes only and disposes shared resources once`, () => {
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
      for (const x of [-120, 120]) for (const y of [-120, 120]) {
        assert.equal(crossing(x, y), true, `${scene.name} gate ${index}: visible corner`);
      }
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

  test(`${scene.name}: rendered landmark blocks share swept collision bounds`, () => {
    const block = scene.blocks.find(({ name }) => name !== 'Building');
    const [x, y, z] = block.position;
    const halfWidth = block.size[0] / 2;
    const previous = { x: x - halfWidth - 20, y, z };
    const current = { x: x + halfWidth + 20, y, z };
    assert.equal(intersectsScenery(previous, current, scene.id), true);
    assert.equal(intersectsScenery({ x, y: 9000, z }, { x: x + 100, y: 9000, z }, scene.id), false);
    const flight = new FlightModel(scene.id);
    flight.body.position.set(x, y, z);
    flight.update(1 / 60);
    assert.equal(flight.crashed, true);
    assert.equal(flight.event, 'crash');
  });
}

test('scene switching resets all state, selects local terrain, and rejects invalid IDs atomically', () => {
  const flight = new FlightModel('tokyo');
  flight.gateIndex = 5;
  flight.paused = true;
  flight.freeFlight = true;
  flight.setScene('alps');
  assert.equal(flight.sceneId, 'alps');
  assert.equal(flight.gateIndex, 0);
  assert.equal(flight.paused, false);
  assert.equal(flight.freeFlight, false);
  assert.equal(flight.route, getScene('alps').route);
  assert.equal(flight.clearance, 1100 - groundHeight(0, 1800, 'alps'));
  assert.throws(() => flight.setScene('missing'), RangeError);
  assert.equal(flight.sceneId, 'alps');
});
