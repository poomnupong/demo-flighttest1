import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, copyFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { project, unproject, polygonContains, mergeGrid, segmentDistance, joinClosedRings } from '../src/geography.js';
import { yokohama, yokohamaGround, yokohamaSurface, inYokohamaDetail } from '../src/yokohama.js';
import { getScene, groundHeight, intersectsScenery } from '../src/scenes.js';
import { FlightModel, autopilotInput } from '../src/flight.js';
import { createWorld } from '../src/world.js';
import { excludedBuildingReason } from '../scripts/osm-buildings.mjs';

test('retired synthetic data and generators are absent', () => {
  for (const path of [
    'scripts/build-geodata.mjs', 'scripts/fetch-geodata.mjs', 'src/data/geodata.generated.js',
    'data/geodata/raw/geo.ts', 'data/geodata/raw/himeji-locality.geojson', 'data/geodata/raw/theme_park.geojson',
    'data/geodata/raw/yokohama-minatomirai-1.geojson',
  ]) assert.equal(existsSync(new URL(`../${path}`, import.meta.url)), false, path);
});

test('local-meter projection preserves directions, independent distances, and geographic round trips', () => {
  assert.deepEqual(project(35.455, 139.6317), [-1000, -3000]);
  const east = project(35.455, 139.6327), north = project(35.456, 139.6317);
  assert.ok(Math.abs(east[0] + 1000 - 90.78) < 0.1);
  assert.ok(Math.abs(north[1] + 3000 + 110.95) < 0.1);
  for (const point of [[35.4455, 139.6505], [35.469, 139.626]]) {
    const result = unproject(...project(...point));
    assert.ok(Math.abs(result[0] - point[0]) < 0.000001);
    assert.ok(Math.abs(result[1] - point[1]) < 0.000001);
  }
  assert.throws(() => project(NaN, 139), TypeError);
  assert.throws(() => unproject(1, Infinity), TypeError);
});

test('polygon holes and merged voxel rectangles preserve exact occupancy', () => {
  const shape = [
    { role: 'outer', points: [[0, 0], [50, 0], [50, 50], [0, 50], [0, 0]] },
    { role: 'inner', points: [[10, 10], [40, 10], [40, 40], [10, 40], [10, 10]] },
    { role: 'outer', points: [[60, 0], [80, 0], [80, 20], [60, 20], [60, 0]] },
  ];
  assert.equal(polygonContains(5, 5, shape), true);
  assert.equal(polygonContains(25, 25, shape), false);
  assert.equal(polygonContains(70, 5, shape), true);
  assert.equal(polygonContains(55, 5, shape), false);
  const grid = Uint8Array.from({ length: 40 }, (_, index) => polygonContains(index % 8 * 10 + 5, Math.floor(index / 8) * 10 + 5, shape) ? 2 : 0);
  const restored = new Uint8Array(grid.length);
  for (const [x, z, w, d, value] of mergeGrid(grid, 8, 5)) {
    for (let row = z; row < z + d; row++) for (let col = x; col < x + w; col++) {
      assert.equal(restored[row * 8 + col], 0, 'rectangles do not overlap');
      restored[row * 8 + col] = value;
    }
  }
  assert.deepEqual(restored, grid);
  assert.equal(segmentDistance(5, 3, [0, 0], [10, 0]), 3);
  assert.equal(segmentDistance(0, 3, [0, 0], [0, 0]), 3);
});

test('multipolygon member assembly handles reversed segments and rejects incomplete rings', () => {
  const rings = joinClosedRings([
    [[0, 0], [10, 0], [10, 10]], [[0, 0], [0, 10], [10, 10]],
    [[20, 0], [30, 0], [30, 10], [20, 0]],
  ], 'fixture');
  assert.equal(rings.length, 2);
  assert.deepEqual(rings[0], [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]);
  assert.throws(() => joinClosedRings([[[0, 0], [10, 0]]], 'incomplete'), /Incomplete polygon ring/);
  assert.throws(() => joinClosedRings([[[0, 0]]], 'empty'), /Incomplete polygon segment/);
});

test('pinned snapshot has real feature IDs, provenance, and explicitly estimated heights', () => {
  const bytes = gunzipSync(readFileSync(new URL('../data/geodata/raw/yokohama-osm.json.gz', import.meta.url)));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), yokohama.source.sha256);
  const source = JSON.parse(bytes);
  const ids = new Set(source.elements.map((e) => `${e.type}/${e.id}`));
  for (const feature of yokohama.features) {
    if (feature.id !== 'mapped-corridors') assert.ok(ids.has(feature.id), feature.id);
    assert.ok(feature.heightSource);
  }
  assert.ok(yokohama.features.filter((f) => f.kind === 'building').length > 4000);
  assert.ok(yokohama.features.some((f) => f.heightSource === 'OSM height'));
  assert.ok(yokohama.features.some((f) => f.heightSource === 'estimated default'));
  assert.equal(yokohama.source.license, 'ODbL-1.0');
  assert.equal(yokohama.source.snapshotDate, source.osm3s.timestamp_osm_base);
});

test('rendered buildings reconcile to active source records and mapped canopies remain hollow below', () => {
  const snapshot = JSON.parse(gunzipSync(readFileSync(new URL('../data/geodata/raw/yokohama-osm.json.gz', import.meta.url))));
  const source = new Map(snapshot.elements.map((element) => [`${element.type}/${element.id}`, element]));
  const excluded = new Set(yokohama.reconciliation.excluded.map(({ id }) => id));
  const scene = getScene();
  const blocksById = new Map();
  for (const block of scene.blocks) {
    assert.ok(!excluded.has(block.sourceId), block.sourceId);
    if (!blocksById.has(block.sourceId)) blocksById.set(block.sourceId, []);
    blocksById.get(block.sourceId).push(block);
  }
  let roofs = 0;
  for (const feature of yokohama.features) {
    assert.ok(!excluded.has(feature.id), feature.id);
    const element = source.get(feature.id);
    if (element?.tags.building) assert.equal(excludedBuildingReason(element.tags), null, feature.id);
    if (feature.kind !== 'roof') continue;
    roofs++;
    assert.equal(element.tags.building, 'roof');
    for (const block of blocksById.get(feature.id) || []) {
      assert.equal(block.size[1], 0.6);
      assert.ok(Math.abs(block.position[1] + 0.3 - (46 + feature.height)) < 0.11);
      assert.ok(block.position[1] - 0.3 > 46);
    }
  }
  assert.ok(roofs > 90);
  assert.ok(excluded.has('way/47883239'));
  assert.ok(excluded.has('way/88385448'));
  assert.ok(excluded.has('way/791025983'));
});

test('known shoreline, dock and park samples agree with terrain and rendered rectangles', () => {
  const samples = [
    [35.4546, 139.6315, 46], [35.4577, 139.6374, 46], [35.4455, 139.6505, 46],
    [35.453, 139.653, 38], [35.4537, 139.6323, 38], [35.4517, 139.6405, 46],
  ];
  for (const [latitude, longitude, expected] of samples) {
    const [x, z] = project(latitude, longitude);
    assert.equal(groundHeight(x, z, 'yokohama'), expected);
    const tiles = yokohamaGround().filter(({ position: [cx, , cz], size: [w, , d] }) =>
      x >= cx - w / 2 && x < cx + w / 2 && z >= cz - d / 2 && z < cz + d / 2);
    assert.equal(tiles.length, 1);
    assert.equal(Math.max(38, tiles[0].position[1] + tiles[0].size[1] / 2), expected);
  }
  assert.equal(yokohamaSurface(...project(35.4455, 139.6505)), 3);
  const [minX, minZ, maxX, maxZ] = yokohama.bounds;
  assert.equal(inYokohamaDetail(minX, minZ), true);
  assert.equal(inYokohamaDetail(maxX, maxZ), false);
  for (let z = minZ + 50; z < maxZ; z += 100) {
    assert.equal(groundHeight(minX - 0.1, z, 'yokohama'), groundHeight(minX + 0.1, z, 'yokohama'));
    assert.equal(groundHeight(maxX - 0.1, z, 'yokohama'), groundHeight(maxX + 0.1, z, 'yokohama'));
  }
});

test('verified landmarks replace old placeholders without duplicated representations', () => {
  const scene = getScene('yokohama');
  const tower = yokohama.landmarks.tower;
  const [referenceX, referenceZ] = project(35.4546, 139.63148);
  assert.ok(Math.hypot(tower.x - referenceX, tower.z - referenceZ) < 5);
  assert.equal(scene.landmark.height, 295.8);
  assert.equal(scene.landmark.altitude, 341.8);
  for (const [key, landmark] of Object.entries(yokohama.landmarks)) {
    if (key === 'park') continue;
    const features = yokohama.features.filter((f) => f.id === landmark.id);
    assert.equal(features.length, 1, key);
    assert.ok(scene.blocks.some((b) => b.sourceId === landmark.id), key);
  }
  assert.equal(yokohama.features.filter((f) => f.kind.startsWith('warehouse')).length, 2);
  assert.ok(!scene.blocks.some((b) => b.name.startsWith('Geodata ') || b.name === 'Harbor pier' || b.name === 'Building'));
  const towerBlocks = scene.blocks.filter((b) => b.sourceId === tower.id);
  assert.ok(Math.abs(Math.max(...towerBlocks.map((b) => b.position[1] + b.size[1] / 2)) - scene.landmark.altitude) < 0.1);
  for (const block of scene.blocks) {
    assert.ok(block.size.every((v) => Number.isFinite(v) && v > 0));
    assert.ok(block.position.every(Number.isFinite));
    assert.ok(block.color);
  }
});

test('building voxel centers remain within source footprints rather than bounding rectangles', () => {
  const snapshot = JSON.parse(gunzipSync(readFileSync(new URL('../data/geodata/raw/yokohama-osm.json.gz', import.meta.url))));
  const shapes = new Map(snapshot.elements.filter((e) => e.type === 'way' && e.tags.building).map((e) => [
    `way/${e.id}`, [{ role: 'outer', points: e.geometry.map((p) => project(p.lat, p.lon).map((v) => Math.round(v * 10) / 10)) }],
  ]));
  let count = 0;
  for (const block of getScene('yokohama').blocks) {
    if (!['building', 'tower', 'hotel', 'warehouse1', 'warehouse2'].includes(block.kind)) continue;
    const shape = shapes.get(block.sourceId);
    if (!shape) continue;
    const [x, , z] = block.position, [w, , d] = block.size;
    for (let px = x - w / 2 + 2.5; px < x + w / 2; px += 5) {
      for (let pz = z - d / 2 + 2.5; pz < z + d / 2; pz += 5) {
        assert.equal(polygonContains(px, pz, shape), true, block.sourceId);
        count++;
      }
    }
  }
  assert.ok(count > 10000);
});

test('spatial collision buckets match swept block bounds and leave open harbor water clear', () => {
  const scene = getScene('yokohama');
  for (let i = 0; i < scene.blocks.length; i += 151) {
    const block = scene.blocks[i], [x, y, z] = block.position, [w] = block.size;
    assert.equal(intersectsScenery({ x: x - w / 2 - 10, y, z }, { x: x + w / 2 + 10, y, z }, scene.id, 0), true, block.sourceId);
  }
  for (const [latitude, longitude] of [[35.453, 139.653], [35.456, 139.643]]) {
    const [x, z] = project(latitude, longitude);
    assert.equal(intersectsScenery({ x, y: 42, z }, { x: x + 10, y: 42, z }, scene.id, 0), false);
  }
  const { x, z } = yokohama.landmarks.tower;
  assert.equal(intersectsScenery({ x, y: 500, z }, { x, y: 200, z }, scene.id, 0), true);
});

for (const fps of [30, 60, 120]) test(`waterfront circuit completes at ${fps} FPS with terrain and structure clearance`, () => {
  const flight = new FlightModel('yokohama');
  let clearance = Infinity;
  for (let frame = 0; frame < fps * 120 && !flight.completed && !flight.crashed; frame++) {
    flight.update(1 / fps, autopilotInput(flight));
    clearance = Math.min(clearance, flight.clearance);
    assert.equal(intersectsScenery(flight.previous, flight.body.position, 'yokohama', 100), false);
  }
  assert.equal(flight.completed, true);
  assert.equal(flight.crashed, false);
  assert.equal(flight.gateIndex, 8);
  assert.ok(clearance > 200);
});

test('detailed terrain is emitted once and stays within the scene instance budget', (t) => {
  const world = createWorld(() => '#88aacc', 'yokohama');
  t.after(() => world.dispose());
  const [x0, z0, x1, z1] = yokohama.bounds;
  assert.equal(world.terrain.count, 57600 - (x1 - x0) * (z1 - z0) / 10000 + yokohama.surfaces.length);
  let count = 0;
  world.scene.traverse((o) => { if (o.isInstancedMesh) count += o.count; });
  assert.ok(count < 125000, `instance budget: ${count}`);
  assert.ok(world.landmarks.count < 65000);
});

test('geographic compilation is reproducible, offline, and rejects modified snapshots', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'fuji-yokohama-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'data/geodata/raw'), { recursive: true });
  mkdirSync(join(root, 'src/data'), { recursive: true });
  for (const path of ['data/geodata/raw/yokohama-osm.json.gz', 'data/geodata/yokohama-source.json']) {
    copyFileSync(new URL(`../${path}`, import.meta.url), join(root, path));
  }
  const script = new URL('../scripts/build-yokohama.mjs', import.meta.url);
  execFileSync(process.execPath, [script.pathname], { cwd: root });
  const first = readFileSync(join(root, 'src/data/yokohama.generated.js'));
  assert.deepEqual(first, readFileSync(new URL('../src/data/yokohama.generated.js', import.meta.url)));
  execFileSync(process.execPath, [script.pathname], { cwd: root });
  assert.deepEqual(first, readFileSync(join(root, 'src/data/yokohama.generated.js')));
  const compressed = readFileSync(join(root, 'data/geodata/raw/yokohama-osm.json.gz'));
  const manifest = readFileSync(join(root, 'data/geodata/yokohama-source.json'));
  const incomplete = JSON.parse(gunzipSync(compressed));
  incomplete.elements.find((e) => e.type === 'way' && e.id === 64891750).geometry.pop();
  const candidate = join(root, 'incomplete.json');
  writeFileSync(candidate, JSON.stringify(incomplete));
  const fetcher = new URL('../scripts/fetch-yokohama.mjs', import.meta.url);
  assert.throws(() => execFileSync(process.execPath, [fetcher.pathname, '--input', candidate], { cwd: root, stdio: 'pipe' }));
  assert.deepEqual(readFileSync(join(root, 'data/geodata/raw/yokohama-osm.json.gz')), compressed);
  assert.deepEqual(readFileSync(join(root, 'data/geodata/yokohama-source.json')), manifest);
  const refreshed = JSON.parse(gunzipSync(compressed));
  const buildings = yokohama.features.filter(({ kind }) => kind === 'building');
  const renderedIds = new Set(yokohama.blocks.map((b) => yokohama.features[b[7]].id));
  const removedIds = new Set(buildings.filter(({ id }) => renderedIds.has(id)).slice(0, 2).map(({ id }) => id));
  const [deletedId, demolishedId] = [...removedIds];
  assert.equal(removedIds.size, 2);
  refreshed.elements = refreshed.elements.filter((e) => `${e.type}/${e.id}` !== deletedId);
  refreshed.elements.find((e) => `${e.type}/${e.id}` === demolishedId).tags.demolished = 'yes';
  const updated = Buffer.from(JSON.stringify(refreshed));
  writeFileSync(join(root, 'data/geodata/raw/yokohama-osm.json.gz'), gzipSync(updated));
  writeFileSync(join(root, 'data/geodata/yokohama-source.json'), JSON.stringify({
    ...JSON.parse(manifest), sha256: createHash('sha256').update(updated).digest('hex'),
  }));
  execFileSync(process.execPath, [script.pathname], { cwd: root });
  const output = readFileSync(join(root, 'src/data/yokohama.generated.js'), 'utf8');
  const compiled = JSON.parse(output.slice(output.indexOf(' = ') + 3, output.lastIndexOf(';')));
  assert.ok(compiled.features.length < yokohama.features.length);
  assert.ok(compiled.blocks.length < yokohama.blocks.length);
  assert.ok(compiled.reconciliation.excluded.some(({ id }) => id === demolishedId));
  for (const feature of compiled.features) assert.ok(!removedIds.has(feature.id), feature.id);
  for (const block of compiled.blocks) assert.ok(!removedIds.has(compiled.features[block[7]].id));
  copyFileSync(new URL('../package.json', import.meta.url), join(root, 'data/geodata/raw/yokohama-osm.json.gz'));
  assert.throws(() => execFileSync(process.execPath, [script.pathname], { cwd: root, stdio: 'pipe' }));
});
