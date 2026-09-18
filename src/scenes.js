import { yokohama, yokohamaTerrain, yokohamaSurface, yokohamaBlocks, yokohamaRoute, yokohamaGround, inYokohamaDetail } from './yokohama.js';

export const DEFAULT_SCENE = 'yokohama';
export const CELL = 100;
export const EXTENT = 12000;
export const WATER_LEVEL = 38;
export const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
export const lerp = (start, end, amount) => start + (end - start) * amount;

const tower = yokohama.landmarks.tower;
const definitions = [
  {
    id: 'yokohama', name: 'Yokohama', latitude: 35.455, longitude: 139.6317,
    landmark: { name: 'Landmark Tower', height: tower.height, x: tower.x, z: tower.z },
    water: 'Yokohama harbor',
    description: 'Mapped Minato Mirai, Shinko and Yamashita waterfront with real coastline, streets and building footprints.',
    horizontalScale: 'Uncompressed local-meter geography in the central waterfront; 5-10 m block sampling, estimated missing heights and schematic outer scenery.',
    mapBounds: [-2700, -5300, 1900, -200],
    mapSnapshot: yokohama.source.snapshotDate.slice(0, 10),
    references: ['https://www.openstreetmap.org/copyright', 'https://www.yokohama-landmark.jp/', 'https://www.senyo.co.jp/cosmo/', 'https://www.nippon-maru.or.jp/english/', 'https://osanbashi.jp/en/'],
    spawn: { x: -450, y: 620, z: -1000 },
    route: yokohamaRoute,
    sampleTerrain: yokohamaTerrain,
    sampleSurface: yokohamaSurface,
    detailBounds: yokohama.bounds,
    containsDetail: inYokohamaDetail,
    groundBlocks: yokohamaGround,
    architecture: yokohamaBlocks,
  },
];

export const SCENES = definitions.map((entry) => {
  const scene = { ...entry };
  const { x, z, height } = scene.landmark;
  scene.landmark = { ...scene.landmark, altitude: Math.max(WATER_LEVEL, scene.sampleTerrain(x, z)) + height };
  scene.blocks = scene.architecture();
  scene.collisionBounds = scene.blocks.map(({ position, size }) => ({
    min: { x: position[0] - size[0] / 2, y: position[1] - size[1] / 2, z: position[2] - size[2] / 2 },
    max: { x: position[0] + size[0] / 2, y: position[1] + size[1] / 2, z: position[2] + size[2] / 2 },
  }));
  scene.maxStructureHeight = scene.collisionBounds.reduce((height, { max }) => Math.max(height, max.y), 0);
  const buckets = new Map(), size = 100;
  for (const bound of scene.collisionBounds) {
    for (let x = Math.floor(bound.min.x / size); x <= Math.floor(bound.max.x / size); x++)
      for (let z = Math.floor(bound.min.z / size); z <= Math.floor(bound.max.z / size); z++) {
        const key = `${x},${z}`;
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(bound);
      }
  }
  scene.nearbyBounds = (minX, minZ, maxX, maxZ) => {
    const found = new Set();
    for (let x = Math.floor(minX / size); x <= Math.floor(maxX / size); x++)
      for (let z = Math.floor(minZ / size); z <= Math.floor(maxZ / size); z++)
        for (const bound of buckets.get(`${x},${z}`) || []) found.add(bound);
    return found;
  };
  return scene;
});

export function getScene(id = DEFAULT_SCENE) {
  const scene = SCENES.find((entry) => entry.id === id);
  if (!scene) throw new RangeError(`Unknown scene: ${id}`);
  return scene;
}

export function terrainHeight(x, z, sceneId = DEFAULT_SCENE) {
  return getScene(sceneId).sampleTerrain(x, z);
}

export function groundHeight(x, z, sceneId = DEFAULT_SCENE) {
  return Math.max(WATER_LEVEL, terrainHeight(x, z, sceneId));
}

export function lakeDistance(x, z, sceneId = DEFAULT_SCENE) {
  return getScene(sceneId).sampleSurface(x, z) === 1 ? 0 : 2;
}

export function intersectsScenery(previous, current, sceneId = DEFAULT_SCENE, radius = 6) {
  const scene = getScene(sceneId);
  if (Math.min(previous.y, current.y) > scene.maxStructureHeight + radius) return false;
  const bounds = scene.nearbyBounds(Math.min(previous.x, current.x) - radius, Math.min(previous.z, current.z) - radius,
    Math.max(previous.x, current.x) + radius, Math.max(previous.z, current.z) + radius);
  for (const { min, max } of bounds) {
    let enter = 0, exit = 1;
    for (const axis of ['x', 'y', 'z']) {
      const delta = current[axis] - previous[axis];
      const low = min[axis] - radius, high = max[axis] + radius;
      if (Math.abs(delta) < 1e-9) {
        if (previous[axis] < low || previous[axis] > high) { enter = 1; exit = 0; break; }
      } else {
        const first = (low - previous[axis]) / delta, second = (high - previous[axis]) / delta;
        enter = Math.max(enter, Math.min(first, second));
        exit = Math.min(exit, Math.max(first, second));
        if (enter > exit) break;
      }
    }
    if (enter <= exit) return true;
  }
  return false;
}
