import { mkdir, readFile, writeFile } from 'node:fs/promises';

const RAD = Math.PI / 180;
const SCENES = {
  yokohama: { lat: 35.455, lon: 139.6317, x: -1000, z: -3000, radius: 3200 },
  himeji: { lat: 34.8394, lon: 134.6939, x: -1000, z: -3400, radius: 3600 },
};

function metersToWorld(scene, lat, lon) {
  const north = (lat - scene.lat) * 110540;
  const east = (lon - scene.lon) * 111320 * Math.cos(scene.lat * RAD);
  return [scene.x + east, scene.z - north];
}

function pointInPolygon(point, polygon) {
  const [x, z] = point;
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, zi] = polygon[i];
    const [xj, zj] = polygon[j];
    const intersect = ((zi > z) !== (zj > z)) && (x < (xj - xi) * (z - zi) / ((zj - zi) || 1e-9) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonRing(feature) {
  const { type, coordinates } = feature.geometry;
  if (type === 'Polygon') return coordinates[0];
  if (type === 'MultiPolygon') return coordinates[0][0];
  throw new Error(`Unsupported geometry type: ${type}`);
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function hash(x, z) {
  const seed = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453;
  return seed - Math.floor(seed);
}

function parseBatchCoordinate(text, englishName) {
  const escaped = englishName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`"name_en"\\s*:\\s*"${escaped}"[\\s\\S]{0,180}?"coordinates"\\s*:\\s*\\{[\\s\\S]{0,80}?"lat"\\s*:\\s*([0-9.\\-]+),[\\s\\S]{0,40}?"lng"\\s*:\\s*([0-9.\\-]+)`, 'm');
  const match = text.match(pattern);
  if (!match) throw new Error(`Could not locate coordinates for ${englishName}`);
  return { lat: Number(match[1]), lon: Number(match[2]) };
}

function parseThemeParkCoordinate(geojson, englishName) {
  const feature = geojson.features.find(({ properties }) => String(properties?.name || '').includes(englishName));
  if (!feature) throw new Error(`Could not locate theme park ${englishName}`);
  const [lon, lat] = feature.geometry.coordinates;
  return { lat, lon };
}

function parseOsanbashiCoordinate(locations) {
  const text = locations.terminals?.['Yokohama Osanbashi Pier']?.coordinates;
  if (!text) throw new Error('Could not locate Osanbashi coordinates');
  const [lat, lon] = text.split(',').map(Number);
  return { lat, lon };
}

function parseLandmarkTowerCoordinate(sourceText) {
  const match = sourceText.match(/nameEn:\s*'Yokohama Landmark Tower',[\s\S]{0,120}?coordinates:\s*\[\s*([0-9.\-]+),\s*([0-9.\-]+)\s*\]/m);
  if (!match) throw new Error('Could not locate Yokohama Landmark Tower coordinates');
  return { lon: Number(match[1]), lat: Number(match[2]) };
}

function roadsAndBlocksFromPolygons(sceneId, rings) {
  const scene = SCENES[sceneId];
  const overlays = [];
  let roads = 0;
  let blocks = 0;

  for (const [index, ring] of rings.entries()) {
    const world = ring.map(([lon, lat]) => metersToWorld(scene, lat, lon));
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of world) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    }
    minX = Math.floor(minX / 60) * 60;
    maxX = Math.ceil(maxX / 60) * 60;
    minZ = Math.floor(minZ / 60) * 60;
    maxZ = Math.ceil(maxZ / 60) * 60;

    for (let x = minX; x <= maxX; x += 120) {
      for (let z = minZ; z <= maxZ; z += 120) {
        if (!pointInPolygon([x, z], world)) continue;
        if (Math.hypot(x - scene.x, z - scene.z) > scene.radius) continue;
        const roadCell = Math.floor((x + z) / 120) % 4 === 0;
        if (roadCell && roads < (sceneId === 'yokohama' ? 240 : 180)) {
          const horizontal = Math.floor((x - z) / 120) % 2 === 0;
          overlays.push({ x, z, w: horizontal ? 118 : 22, h: 2, d: horizontal ? 22 : 118, color: 'rock', name: `Geodata road ${index + 1}` });
          roads++;
          continue;
        }
        if (blocks >= (sceneId === 'yokohama' ? 180 : 150)) continue;
        const density = clamp(hash(x, z), 0, 1);
        overlays.push({
          x,
          z,
          w: 70 + Math.round(density * 40),
          h: sceneId === 'yokohama' ? 18 + Math.round(density * 36) : 11 + Math.round(density * 16),
          d: 58 + Math.round((1 - density) * 36),
          color: sceneId === 'yokohama' ? 'wall' : 'snow',
          name: sceneId === 'yokohama' ? 'Geodata city block' : 'Geodata castle town block',
        });
        blocks++;
      }
    }
  }

  return overlays;
}

const batch3 = await readFile('data/geodata/raw/batch_3_prompt.txt', 'utf8');
const batch8 = await readFile('data/geodata/raw/batch_8_prompt.txt', 'utf8');
const fromBatches = (name) => {
  try { return parseBatchCoordinate(batch8, name); } catch {}
  return parseBatchCoordinate(batch3, name);
};
const themePark = JSON.parse(await readFile('data/geodata/raw/theme_park.geojson', 'utf8'));
const cruiseLocations = JSON.parse(await readFile('data/geodata/raw/locations.json', 'utf8'));
const radioGeo = await readFile('data/geodata/raw/geo.ts', 'utf8');

const minatomiraiFiles = ['1', '2', '3', '4', '6'];
const minatomiraiRings = await Promise.all(minatomiraiFiles.map(async (part) => {
  const file = JSON.parse(await readFile(`data/geodata/raw/yokohama-minatomirai-${part}.geojson`, 'utf8'));
  return polygonRing(file);
}));
const himejiLocality = JSON.parse(await readFile('data/geodata/raw/himeji-locality.geojson', 'utf8'));
const himejiRing = polygonRing(himejiLocality);

const yokohamaOverlays = roadsAndBlocksFromPolygons('yokohama', minatomiraiRings);
const himejiOverlays = roadsAndBlocksFromPolygons('himeji', [himejiRing]);

const yokohamaLandmarks = {
  landmarkTower: parseLandmarkTowerCoordinate(radioGeo),
  nipponMaru: fromBatches('Nippon Maru'),
  nipponMaruPark: fromBatches('Nippon Maru Memorial Park'),
  yamashita: fromBatches('Yamashita Park'),
  cosmoWorld: parseThemeParkCoordinate(themePark, 'Yokohama Cosmo World'),
  osanbashi: parseOsanbashiCoordinate(cruiseLocations),
};

const towerWorld = metersToWorld(SCENES.yokohama, yokohamaLandmarks.landmarkTower.lat, yokohamaLandmarks.landmarkTower.lon);
const maruWorld = metersToWorld(SCENES.yokohama, yokohamaLandmarks.nipponMaru.lat, yokohamaLandmarks.nipponMaru.lon);
const maruParkWorld = metersToWorld(SCENES.yokohama, yokohamaLandmarks.nipponMaruPark.lat, yokohamaLandmarks.nipponMaruPark.lon);
const yamashitaWorld = metersToWorld(SCENES.yokohama, yokohamaLandmarks.yamashita.lat, yokohamaLandmarks.yamashita.lon);
const cosmoWorld = metersToWorld(SCENES.yokohama, yokohamaLandmarks.cosmoWorld.lat, yokohamaLandmarks.cosmoWorld.lon);
const osanbashiWorld = metersToWorld(SCENES.yokohama, yokohamaLandmarks.osanbashi.lat, yokohamaLandmarks.osanbashi.lon);

yokohamaOverlays.push(
  { x: towerWorld[0], z: towerWorld[1], w: 140, h: 7, d: 140, color: 'wall', name: 'Geodata Landmark Tower plaza' },
  { x: maruWorld[0], z: maruWorld[1], w: 240, h: 8, d: 36, color: 'snow', name: 'Geodata Nippon Maru hull' },
  { x: maruWorld[0], z: maruWorld[1], w: 170, h: 12, d: 24, color: 'wall', name: 'Geodata Nippon Maru deckhouse' },
  { x: maruParkWorld[0], z: maruParkWorld[1], w: 460, h: 3, d: 220, color: 'grass-light', name: 'Geodata Nippon Maru park' },
  { x: yamashitaWorld[0], z: yamashitaWorld[1], w: 860, h: 4, d: 260, color: 'grass-light', name: 'Geodata Yamashita Park lawn' },
  { x: osanbashiWorld[0], z: osanbashiWorld[1], w: 1280, h: 8, d: 280, color: 'rock', name: 'Geodata Osanbashi deck' },
  { x: osanbashiWorld[0] + 150, z: osanbashiWorld[1], w: 120, h: 14, d: 220, color: 'wall', name: 'Geodata Osanbashi terminal' },
  { x: cosmoWorld[0], z: cosmoWorld[1], w: 130, h: 3, d: 130, color: 'torii', name: 'Geodata Cosmo World plaza' },
);

const himejiAnchor = metersToWorld(SCENES.himeji, 34.8394, 134.6939);
for (const side of [-1, 1]) {
  himejiOverlays.push(
    { x: himejiAnchor[0], z: himejiAnchor[1] + side * 475, w: 1120, h: 5, d: 20, color: 'water', name: 'Geodata Himeji moat ring' },
    { x: himejiAnchor[0] + side * 550, z: himejiAnchor[1], w: 20, h: 5, d: 930, color: 'water', name: 'Geodata Himeji moat ring' },
  );
}

const output = {
  metadata: {
    generatedAt: new Date().toISOString(),
    sources: [
      'Who\'s On First admin-jp (Minatomirai and Himeji polygons)',
      'japan-travel-mcp batch prompt snapshot (Wikidata-derived POI coordinates)',
      'tabachain/geoJSON theme_park.geojson',
      'mixingchex/GMcruise locations.json',
      'BoxPistols/DID-J26 geo.ts',
    ],
  },
  overlays: {
    yokohama: yokohamaOverlays,
    himeji: himejiOverlays,
  },
};

await mkdir('src/data', { recursive: true });
await writeFile('src/data/geodata.generated.js', `export const GEODATA_OVERLAYS = ${JSON.stringify(output, null, 2)};\n`);
console.log(`Generated geodata overlays: Yokohama=${yokohamaOverlays.length}, Himeji=${himejiOverlays.length}`);
