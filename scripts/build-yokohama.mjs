import { readFile, writeFile } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { project, YOKOHAMA_BOUNDS, boundsOf, polygonContains, segmentDistance, mergeGrid, joinClosedRings } from '../src/geography.js';
import { reconcileBuildings } from './osm-buildings.mjs';

const raw = gunzipSync(await readFile('data/geodata/raw/yokohama-osm.json.gz'));
const source = JSON.parse(await readFile('data/geodata/yokohama-source.json', 'utf8'));
if (createHash('sha256').update(raw).digest('hex') !== source.sha256) throw new Error('Yokohama snapshot checksum mismatch');
const snapshot = JSON.parse(raw);
if (snapshot.remark) throw new Error(`Incomplete OSM response: ${snapshot.remark}`);
const [south, west, north, east] = YOKOHAMA_BOUNDS;
const nw = project(north, west), se = project(south, east);
const bounds = [Math.floor(nw[0] / 100) * 100, Math.floor(nw[1] / 100) * 100,
  Math.ceil(se[0] / 100) * 100, Math.ceil(se[1] / 100) * 100];
const cell = 10, width = (bounds[2] - bounds[0]) / cell, depth = (bounds[3] - bounds[1]) / cell;
const surface = new Uint8Array(width * depth);
const features = [], blocks = [], landmarks = {};
const colors = ['urban', 'road', 'rail', 'wall', 'roof', 'snow', 'glass-light', 'brick', 'grass-light', 'rock', 'torii'];
const landmarkIds = new Map([
  [64891750, ['tower', 'Landmark Tower']], [57932445, ['hotel', 'InterContinental sail hotel']],
  [138101264, ['ship', 'Nippon Maru']], [363854124, ['wheel', 'Cosmo Clock 21']],
  [72998296, ['warehouse2', 'Red Brick Warehouse 2']], [72998303, ['warehouse1', 'Red Brick Warehouse 1']],
  [504126759, ['pier', 'Osanbashi']], [35866698, ['park', 'Yamashita Park']],
]);
const round = (n) => Math.round(n * 10) / 10;
const equal = (a, b) => a[0] === b[0] && a[1] === b[1];
const coordinate = ({ lat, lon }) => project(lat, lon).map(round);
const intersects = (b) => b && b.maxlat >= south && b.minlat <= north && b.maxlon >= west && b.minlon <= east;
const elements = snapshot.elements.filter((e) => intersects(e.bounds) || e.tags?.natural === 'coastline')
  .sort((a, b) => a.type.localeCompare(b.type, 'en') || a.id - b.id);

function ringsOf(element) {
  if (element.type === 'way') {
    const points = element.geometry.map(coordinate);
    if (!equal(points[0], points.at(-1))) throw new Error(`Unclosed polygon: way/${element.id}`);
    return [{ role: 'outer', points }];
  }
  const rings = [];
  for (const role of ['outer', 'inner']) {
    const members = element.members.filter((m) => (m.role || 'outer') === role);
    if (members.some((m) => m.type !== 'way' || !m.geometry?.length || m.geometry.some((p) => !p))) {
      throw new Error(`Incomplete ${role} geometry: relation/${element.id}`);
    }
    for (const points of joinClosedRings(members.map((m) => m.geometry.map(coordinate)), element.id)) rings.push({ role, points });
  }
  if (!rings.some((r) => r.role === 'outer')) throw new Error(`No outer ring: relation/${element.id}`);
  return rings;
}

function polygon(element) {
  const rings = ringsOf(element);
  const bounds = boundsOf(rings.flatMap((r) => r.points));
  return { rings, bounds };
}

function visitGrid(b, gridCell, visitor) {
  const minX = Math.max(bounds[0], Math.floor(b[0] / gridCell) * gridCell);
  const minZ = Math.max(bounds[1], Math.floor(b[1] / gridCell) * gridCell);
  const maxX = Math.min(bounds[2], Math.ceil(b[2] / gridCell) * gridCell);
  const maxZ = Math.min(bounds[3], Math.ceil(b[3] / gridCell) * gridCell);
  for (let z = minZ; z < maxZ; z += gridCell) for (let x = minX; x < maxX; x += gridCell) visitor(x + gridCell / 2, z + gridCell / 2);
}

function paintPolygon(shape, value) {
  visitGrid(shape.bounds, cell, (x, z) => {
    const index = Math.floor((z - bounds[1]) / cell) * width + Math.floor((x - bounds[0]) / cell);
    if (polygonContains(x, z, shape.rings) && (value === 1 || surface[index] !== 1)) surface[index] = value;
  });
}

const coast = elements.filter((e) => e.tags?.natural === 'coastline').map((e) => e.geometry.map(coordinate));
const endpoints = new Map();
for (const line of coast) for (const p of [line[0], line.at(-1)]) endpoints.set(p.join(','), (endpoints.get(p.join(',')) || 0) + 1);
for (const [key, count] of endpoints) {
  const [x, z] = key.split(',').map(Number);
  if (count === 1 && x > bounds[0] && x < bounds[2] && z > bounds[1] && z < bounds[3]) {
    throw new Error(`Coastline terminates inside the detailed region: ${key}`);
  }
}
for (let row = 0; row < depth; row++) {
  const z = bounds[1] + (row + 0.5) * cell, crossings = [];
  for (const line of coast) for (let i = 1; i < line.length; i++) {
    const [ax, az] = line[i - 1], [bx, bz] = line[i];
    if ((az > z) !== (bz > z)) crossings.push({ x: ax + (bx - ax) * (z - az) / (bz - az), landWest: bz < az });
  }
  crossings.sort((a, b) => a.x - b.x);
  if (!crossings.length) throw new Error(`No coastline coverage at world Z ${z}`);
  let next = 0;
  for (let col = 0; col < width; col++) {
    const x = bounds[0] + (col + 0.5) * cell;
    while (next < crossings.length && crossings[next].x < x) next++;
    // OSM coastlines keep land on the left; Z points south in the game.
    const land = next < crossings.length ? crossings[next].landWest : !crossings.at(-1).landWest;
    surface[row * width + col] = land ? 2 : 1;
  }
}

const polygonElements = elements.filter((e) => e.type === 'relation' ? e.tags?.type === 'multipolygon'
  : e.type === 'way' && e.geometry?.length >= 4 && equal(coordinate(e.geometry[0]), coordinate(e.geometry.at(-1))));
const shapes = new Map(polygonElements.map((e) => [`${e.type}/${e.id}`, polygon(e)]));
for (const e of polygonElements) {
  if (e.tags.natural === 'water' || ['dock', 'riverbank'].includes(e.tags.waterway)) paintPolygon(shapes.get(`${e.type}/${e.id}`), 1);
}
for (const e of polygonElements) if (e.tags.leisure === 'park') paintPolygon(shapes.get(`${e.type}/${e.id}`), 3);
const surfaceAt = (x, z) => {
  if (x < bounds[0] || x >= bounds[2] || z < bounds[1] || z >= bounds[3]) return 1;
  return surface[Math.floor((z - bounds[1]) / cell) * width + Math.floor((x - bounds[0]) / cell)];
};
const add = (x, y, z, w, h, d, color, feature) => {
  if ([x, y, z, w, h, d].some((n) => !Number.isFinite(n)) || Math.min(w, h, d) <= 0) throw new Error(`Invalid box for ${feature}`);
  if (!colors.includes(color)) throw new Error(`Unknown geographic palette token: ${color}`);
  blocks.push([x, y, z, w, h, d].map(round).concat(colors.indexOf(color), feature));
};
function register(e, kind, height = null, heightSource = null) {
  const special = landmarkIds.get(e.id);
  const index = features.length;
  features.push({ id: `${e.type}/${e.id}`, name: special?.[1] || e.tags['name:en'] || `Mapped ${kind}`, kind, height, heightSource });
  return index;
}
function measure(shape) {
  const ring = shape.rings.find((r) => r.role === 'outer').points;
  let area = 0, cx = 0, cz = 0, longest = 0, axis = [1, 0];
  for (let i = 1; i < ring.length; i++) {
    const a = ring[i - 1], b = ring[i], cross = a[0] * b[1] - b[0] * a[1];
    area += cross; cx += (a[0] + b[0]) * cross; cz += (a[1] + b[1]) * cross;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (length > longest) { longest = length; axis = [(b[0] - a[0]) / length, (b[1] - a[1]) / length]; }
  }
  if (Math.abs(area) < 1) throw new Error('Degenerate landmark footprint');
  cx /= 3 * area; cz /= 3 * area;
  const along = ring.map(([x, z]) => (x - cx) * axis[0] + (z - cz) * axis[1]);
  const across = ring.map(([x, z]) => -(x - cx) * axis[1] + (z - cz) * axis[0]);
  return { x: round(cx), z: round(cz), axis, length: Math.max(...along) - Math.min(...along), width: Math.max(...across) - Math.min(...across) };
}
function rasterBoxes(shape, sample, feature, color, base = 46, roof = false) {
  const size = 5;
  const b = [Math.max(bounds[0], Math.floor(shape.bounds[0] / size) * size),
    Math.max(bounds[1], Math.floor(shape.bounds[1] / size) * size),
    Math.min(bounds[2], Math.ceil(shape.bounds[2] / size) * size),
    Math.min(bounds[3], Math.ceil(shape.bounds[3] / size) * size)];
  const w = Math.max(0, (b[2] - b[0]) / size), d = Math.max(0, (b[3] - b[1]) / size);
  const grid = new Int32Array(w * d);
  for (let row = 0; row < d; row++) for (let col = 0; col < w; col++) {
    const x = b[0] + (col + 0.5) * size, z = b[1] + (row + 0.5) * size;
    if (polygonContains(x, z, shape.rings)) grid[row * w + col] = Math.round(sample(x, z) * 10);
  }
  for (const [col, row, columns, rows, value] of mergeGrid(grid, w, d)) {
    const h = value / 10, cap = roof ? Math.min(2, h / 4) : 0;
    const x = b[0] + (col + columns / 2) * size, z = b[1] + (row + rows / 2) * size;
    add(x, base + (h - cap) / 2, z, columns * size, h - cap, rows * size, color, feature);
    if (cap) add(x, base + h - cap / 2, z, columns * size, cap, rows * size, 'roof', feature);
  }
}
function numericHeight(value) {
  if (value === undefined) return null;
  const match = String(value).match(/^(\d+(?:\.\d+)?)\s*(m|ft)?$/);
  if (!match) return null;
  const number = Number(match[1]) * (match[2] === 'ft' ? 0.3048 : 1);
  return number > 0 && number < 700 ? number : null;
}
const reconciliation = reconcileBuildings(polygonElements.filter((e) => e.tags.building)
  .map((element) => ({ element, shape: shapes.get(`${element.type}/${element.id}`) })), new Set(landmarkIds.keys()));
for (const e of polygonElements) {
  const id = `${e.type}/${e.id}`, shape = shapes.get(id), special = landmarkIds.get(e.id)?.[0];
  if (special === 'park') {
    landmarks.park = { ...measure(shape), id, height: 0, heightSource: 'mapped footprint' };
    continue;
  }
  if (!e.tags.building && special !== 'pier' && special !== 'wheel') continue;
  if (e.tags.building && !reconciliation.selected.has(id)) continue;
  let h = numericHeight(e.tags.height), heightSource = 'OSM height';
  if (h === null) {
    const levels = numericHeight(e.tags['building:levels']);
    h = levels === null ? (e.tags.building === 'roof' ? 4 : e.tags.building === 'house' ? 8 : 15) : Math.min(400, levels * 3.2);
    heightSource = levels === null ? 'estimated default' : 'estimated from OSM levels (3.2 m/floor)';
  }
  if (special === 'ship') { h = 46; heightSource = 'simplified rigging estimate'; }
  if (special === 'pier') { h = 12; heightSource = 'simplified deck/terminal estimate'; }
  const feature = register(e, special || (e.tags.building === 'roof' ? 'roof' : 'building'), round(h), heightSource);
  let pose;
  if (special) {
    pose = measure(shape);
    landmarks[special] = { ...pose, id, height: h, heightSource };
  }
  if (special === 'wheel') {
    const radius = 50, centerY = 46 + h - radius, [ax, az] = pose.axis;
    const line = (from, to, size, color) => {
      const count = Math.ceil(Math.hypot(...to.map((v, i) => v - from[i])) / (size * 0.8));
      for (let i = 0; i <= count; i++) {
        const p = from.map((v, j) => v + (to[j] - v) * i / count);
        add(...p, size, size, size, color, feature);
      }
    };
    for (let i = 0; i < 64; i++) {
      const angle = i / 64 * Math.PI * 2;
      const x = pose.x + Math.cos(angle) * radius * ax, z = pose.z + Math.cos(angle) * radius * az;
      const y = centerY + Math.sin(angle) * radius;
      add(x, y, z, 5, 5, 5, 'snow', feature);
      if (i % 4 === 0) {
        add(x, y - 4, z, 7, 6, 7, i % 8 ? 'torii' : 'glass-light', feature);
        line([pose.x, centerY, pose.z], [x, y, z], 2, 'snow');
      }
    }
    for (const side of [-1, 1]) line([pose.x + side * az * 24, 46, pose.z - side * ax * 24], [pose.x, centerY, pose.z], 4, 'torii');
    continue;
  }
  const sample = (x, z) => {
    if (!pose) return h;
    const u = (x - pose.x) * pose.axis[0] + (z - pose.z) * pose.axis[1];
    const v = -(x - pose.x) * pose.axis[1] + (z - pose.z) * pose.axis[0];
    if (special === 'tower') {
      const r = Math.max(Math.abs(u) / (pose.length / 2), Math.abs(v) / (pose.width / 2));
      return r < 0.48 ? h : r < 0.65 ? 285 : r < 0.8 ? 268 : r < 0.93 ? 240 : 65;
    }
    if (special === 'hotel') return Math.max(25, Math.round(h * Math.sqrt(Math.max(0, 1 - (u / (pose.length / 2)) ** 2)) / 5) * 5);
    if (special === 'ship') return Math.abs(u) < pose.length * 0.28 && Math.abs(v) < pose.width * 0.28 ? 12 : 6;
    if (special === 'pier') return Math.abs(v) < pose.width * 0.28 && Math.abs(u) < pose.length * 0.4 ? 12 : 5;
    return h;
  };
  const color = special?.startsWith('warehouse') ? 'brick' : special === 'hotel' || special === 'ship' ? 'snow' : special === 'pier' ? 'grass-light' : 'wall';
  if (e.tags.building === 'roof') rasterBoxes(shape, () => 0.6, feature, 'roof', 46 + h - 0.6);
  else rasterBoxes(shape, sample, feature, color, e.tags.building === 'ship' || special === 'pier' ? 39 : 46, special !== 'ship' && special !== 'pier');
  if (special === 'ship') {
    for (const offset of [-0.3, -0.1, 0.1, 0.3]) {
      const x = pose.x + pose.axis[0] * pose.length * offset, z = pose.z + pose.axis[1] * pose.length * offset;
      add(x, 66, z, 2, 46, 2, 'wall', feature);
      for (const y of [62, 71, 80]) {
        for (let i = -4; i <= 4; i++) add(x - pose.axis[1] * i * 2, y, z + pose.axis[0] * i * 2, 2.5, 1.5, 2.5, 'snow', feature);
      }
    }
  }
}
// Ground-level corridors are rasterized once, avoiding thousands of overlapping way meshes.
const roadCell = 5, roadWidth = (bounds[2] - bounds[0]) / roadCell, roadDepth = (bounds[3] - bounds[1]) / roadCell;
const roads = new Uint8Array(roadWidth * roadDepth);
for (const e of elements) {
  if (e.type !== 'way' || !e.geometry?.length || e.tags.tunnel === 'yes' || Number(e.tags.layer) < 0) continue;
  const highway = e.tags.highway, rail = e.tags.railway === 'rail';
  if ((!highway || ['proposed', 'construction', 'steps'].includes(highway)) && !rail) continue;
  const points = e.geometry.map(coordinate);
  const lanes = Math.min(6, Number(e.tags.lanes) || 2);
  const w = numericHeight(e.tags.width) || (rail ? 4 : ['footway', 'path', 'pedestrian', 'cycleway'].includes(highway) ? 4 : lanes * 3.2 + 2);
  const bridge = e.tags.bridge === 'yes';
  const feature = bridge ? register(e, 'bridge', 2, 'estimated deck elevation') : -1;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const limits = boundsOf([a, b]).map((v, j) => v + (j < 2 ? -w : w));
    visitGrid(limits, roadCell, (x, z) => {
      if (segmentDistance(x, z, a, b) > w / 2) return;
      if (bridge) add(x, 53 + Math.max(0, Number(e.tags.layer) || 0) * 5, z, roadCell, 2, roadCell, rail ? 'rail' : 'road', feature);
      else if (surfaceAt(x, z) !== 1) roads[Math.floor((z - bounds[1]) / roadCell) * roadWidth + Math.floor((x - bounds[0]) / roadCell)] = rail ? 2 : 1;
    });
  }
}
const corridors = features.length;
features.push({ id: 'mapped-corridors', name: 'Mapped streets and rail', kind: 'roads', height: 0.6, heightSource: 'surface marking' });
for (const [x, z, w, d, value] of mergeGrid(roads, roadWidth, roadDepth)) {
  add(bounds[0] + (x + w / 2) * roadCell, 46.3, bounds[1] + (z + d / 2) * roadCell,
    w * roadCell, 0.6, d * roadCell, value === 2 ? 'rail' : 'road', corridors);
}
for (const [key] of landmarkIds.values()) if (!landmarks[key]) throw new Error(`Missing compiled landmark: ${key}`);
const output = {
  source: { ...source, license: 'ODbL-1.0', heightDisclosure: 'OSM heights where tagged; otherwise estimated. Flat 46 m game datum, not surveyed elevation.' },
  bounds, cell, width, depth, colors, landmarks, features,
  surfaces: mergeGrid(surface, width, depth),
  reconciliation: { mappedBuildings: reconciliation.selected.size, excluded: reconciliation.excluded },
  blocks,
};
await writeFile('src/data/yokohama.generated.js', `// Generated by scripts/build-yokohama.mjs. OSM-derived data: ODbL-1.0.\nexport const YOKOHAMA = ${JSON.stringify(output)};\n`);
console.log(`Compiled Yokohama: ${features.length} features, ${blocks.length} structure boxes, ${output.surfaces.length} ground rectangles; excluded ${reconciliation.excluded.length} obsolete/duplicate building records`);
