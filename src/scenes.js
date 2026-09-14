import { GEODATA_OVERLAYS } from './data/geodata.generated.js';

export const CELL = 100;
export const EXTENT = 12000;
export const WATER_LEVEL = 38;
export const FUJI = { x: -500, z: -5500 };
export const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
export const lerp = (start, end, amount) => start + (end - start) * amount;

const yokohamaTower = GEODATA_OVERLAYS.overlays.yokohama.find(({ name }) => name === 'Geodata Landmark Tower plaza');

const definitions = [
  { id: 'fuji', name: 'Mount Fuji', latitude: 35.3606, longitude: 138.7274,
    landmark: { name: 'Mount Fuji', height: 3776, ...FUJI }, water: 'Lake Kawaguchi',
    description: 'A snow-capped volcanic cone, summit crater, lakeside pagoda and forest.',
    references: ['https://web-japan.org/atlas/nature/nat06.html'],
    crater: { diameter: 750, depth: 200 }, horizontalScale: 'Compressed foothills and lake distances; summit elevation and 750 m crater retained.' },
  { id: 'kamakura', name: 'Kamakura / Enoshima', latitude: 35.2997, longitude: 139.4803,
    landmark: { name: 'Enoshima Sea Candle', height: 59.8, x: -2200, z: -2300 }, water: 'Sagami Bay',
    description: 'An offshore island and lighthouse, coastal hills, causeway and seated Great Buddha.',
    references: ['https://enoshima-seacandle.com/', 'https://www.city.kamakura.kanagawa.jp/english/buddha.html'] },
  { id: 'alps', name: 'Japan Alps / Nagano', latitude: 36.2892, longitude: 137.6481,
    landmark: { name: 'Mount Hotaka', height: 3190, x: -4200, z: -5100 }, water: 'Alpine river',
    description: 'Snowy Northern Alps, a deep river valley and Matsumoto’s black castle.',
    references: ['https://www.go-nagano.net/en/trip-idea/id18040', 'https://www.matsumoto-castle.jp/lang/eng/'] },
  { id: 'kyoto', name: 'Kyoto', latitude: 35.0394, longitude: 135.7292,
    landmark: { name: 'Kinkaku-ji Golden Pavilion', height: 13, x: -1300, z: -2700 }, water: 'Kyoko-chi inspired pond',
    description: 'A mountain-ringed basin, golden three-tier pavilion, pagoda and vermilion torii avenue.',
    references: ['https://www.shokoku-ji.jp/en/kinkakuji/', 'https://www.japan.travel/en/spot/1152/'] },
  { id: 'himeji', name: 'Himeji', latitude: 34.8394, longitude: 134.6939,
    landmark: { name: 'Himeji Castle', height: 46.4, x: -1000, z: -3400 }, water: 'Castle moat',
    description: 'White Heron Castle’s tiered keep, stone ramparts, concentric moats and castle-town plain.',
    references: ['https://www.city.himeji.lg.jp/castle/', 'https://whc.unesco.org/en/list/661/'] },
  { id: 'tokyo', name: 'Tokyo', latitude: 35.6586, longitude: 139.7454,
    landmark: { name: 'Tokyo Tower', height: 333, x: -1500, z: -3000 }, water: 'Tokyo Bay / Sumida River',
    description: 'A dense city plain with orange-white Tokyo Tower, Skytree and a broad bay.',
    references: ['https://www.tokyotower.co.jp/en.html', 'https://www.tokyo-skytree.jp/en/'] },
  { id: 'yokohama', name: 'Yokohama', latitude: 35.455, longitude: 139.6317,
    landmark: { name: 'Landmark Tower', height: 296, x: yokohamaTower.x, z: yokohamaTower.z }, water: 'Yokohama harbor',
    description: 'Minato Mirai skyline with Landmark Tower, Nippon Maru, Yamashita Park, Osan Pier and Cosmo Clock.',
    references: ['https://www.yokohama-landmark.jp/', 'https://www.senyo.co.jp/cosmo/', 'https://www.nippon-maru.or.jp/english/', 'https://www.welcome.city.yokohama.jp/spot/details.php?bbid=190', 'https://osanbashi.jp/en/'] },
];

function definition(id) {
  const scene = definitions.find((entry) => entry.id === id);
  if (!scene) throw new RangeError(`Unknown scene: ${id}`);
  return scene;
}

export function lakeDistance(x, z, sceneId = 'fuji') {
  definition(sceneId);
  switch (sceneId) {
    case 'fuji': return Math.hypot((x - 150) / 2520, (z - 50) / 2100)
      + Math.sin(x * 0.0017 + z * 0.002) * 0.035 + Math.sin(z * 0.0032) * 0.025;
    case 'kamakura': return Math.min((Math.hypot(x + 2200, z + 2300) < 650 ? 2 : 0.2) + Math.max(0, -z - 3900) / 600, 3);
    case 'alps': return Math.abs(x - Math.sin(z * 0.00065) * 320) / 180;
    case 'kyoto': return Math.hypot((x + 1300) / 750, (z + 2200) / 550);
    case 'himeji': return Math.abs(Math.max(Math.abs(x + 1000) / 850, Math.abs(z + 3400) / 720) - 1) * 8;
    case 'tokyo': return Math.min((3500 - x + Math.sin(z * 0.0007) * 160) / 650, Math.abs(x - 1600 - Math.sin(z * 0.0005) * 200) / 160);
    case 'yokohama': return (1400 - x + Math.sin(z * 0.0009) * 350) / 650;
  }
}

export function terrainHeight(x, z, sceneId = 'fuji') {
  const lake = lakeDistance(x, z, sceneId);
  const rolling = 130 + 105 * Math.sin(x * 0.00073 + z * 0.00024)
    + 90 * Math.cos(z * 0.00082 - x * 0.0002)
    + 42 * Math.sin(x * 0.0019) * Math.cos(z * 0.0018)
    + 26 * Math.sin(x * 0.0041 + z * 0.0015) * Math.cos(z * 0.0034 - x * 0.0011);
  let height;
  if (sceneId === 'fuji') {
    const radial = Math.hypot(x - FUJI.x, z - FUJI.z);
    // Keep a one-voxel-wide summit rim at exactly 3,776 m, not a rounded-down peak.
    const volcano = radial < 350 ? 3576 + 200 * (radial / 350) ** 2
      : radial <= 400 ? 3776 : 3776 * Math.max(0, 1 - (radial - 400) / 3800) ** 1.12;
    const highlands = clamp((Math.abs(x) - 2600) / 4200, 0, 1) ** 0.8 * 650;
    const land = lake < 0.98 ? -45 : lake < 1.04 ? 52
      : lerp(52, Math.max(76, rolling + highlands), clamp((lake - 1.04) / 0.32, 0, 1));
    return Math.max(Math.round(land / 26) * 26, volcano > 140 ? Math.round(volcano) : -100);
  }
  if (sceneId === 'kamakura') {
    const island = Math.hypot((x + 2200) / 650, (z + 2300) / 580);
    height = island < 1 ? 52 + 75 * (1 - island) : z < -4300 ? 90 + Math.max(0, rolling) * 1.3 : -45;
    if (Math.abs(x + 2200) < 85 && z < -2600 && z > -4600) height = 52;
  } else if (sceneId === 'alps') {
    const peak = (px, pz, altitude, width) => altitude * Math.max(0, 1 - Math.hypot(x - px, (z - pz) * 0.8) / width) ** 0.8;
    height = Math.max(440 + rolling * 0.3, peak(-4200, -5100, 3190, 3300), peak(-5600, -1500, 2857, 2800),
      peak(4300, -5400, 3015, 2900), peak(5400, -1100, 2956, 3100), peak(-3700, -8600, 3000, 2600));
    if (lake < 1) height = -24;
  } else if (sceneId === 'kyoto') {
    height = 78 + Math.max(0, rolling) * 0.12 + 780 * clamp((Math.abs(x) - 3600) / 4000, 0, 1)
      + 800 * clamp((-z - 7000) / 4300, 0, 1);
    if (lake < 1) height = -20;
  } else if (sceneId === 'himeji') {
    height = 65 + Math.max(0, rolling) * 0.1 + 760 * clamp((-z - 6500) / 5000, 0, 1);
    if (Math.abs(x + 1000) < 650 && Math.abs(z + 3400) < 550) height = 105;
    if (lake < 1 || z > 5000) height = -20;
  } else if (sceneId === 'tokyo') {
    height = lake < 1 ? -30 : 65 + Math.max(0, rolling) * 0.055;
  } else {
    height = lake < 1 ? -30 : 72 + Math.max(0, rolling) * 0.2 + 160 * clamp((-x - 4000) / 5000, 0, 1);
  }
  return Math.round(height);
}

export function groundHeight(x, z, sceneId = 'fuji') {
  return Math.max(WATER_LEVEL, terrainHeight(Math.floor(x / CELL) * CELL + CELL / 2, Math.floor(z / CELL) * CELL + CELL / 2, sceneId));
}

function architecture(scene) {
  const blocks = [];
  const add = (x, y, z, w, h, d, color, name) => blocks.push({ position: [x, y, z], size: [w, h, d], color, name });
  const building = (x, z, w, h, d, color = 'wall', name = 'Building') => {
    const base = groundHeight(x, z, scene.id);
    add(x, base + h / 2, z, w, h, d, color, name);
    return base;
  };
  const pagoda = (x, z, levels, height, wall, name) => {
    const base = groundHeight(x, z, scene.id);
    for (let level = 0; level < levels; level++) {
      const width = height * (0.85 - level / levels * 0.48);
      const floor = height / levels;
      add(x, base + floor * (level + 0.42), z, width, floor * 0.84, width * 0.8, wall, name);
      add(x, base + floor * (level + 0.88), z, width * 1.3, floor * 0.13, width, 'roof', name);
      add(x, base + floor * (level + 0.98), z, width, floor * 0.07, width * 0.72, 'roof', name);
    }
  };
  const torii = (x, z) => {
    const base = groundHeight(x, z, scene.id);
    for (const side of [-1, 1]) add(x + side * 24, base + 29, z, 7, 58, 8, 'torii', 'Torii');
    add(x, base + 57, z, 74, 8, 12, 'torii', 'Torii');
    add(x, base + 43, z, 58, 5, 8, 'torii', 'Torii');
  };
  if (scene.id === 'fuji') {
    pagoda(-2570, 450, 5, 160, 'wall', 'Lakeside pagoda');
    torii(-2180, 470);
  } else if (scene.id === 'kamakura') {
    const { x, z, height } = scene.landmark;
    const base = building(x, z, 13, height - 14, 13, 'wall', 'Sea Candle shaft');
    add(x, base + height - 9, z, 34, 12, 34, 'glass-light', 'Sea Candle observation deck');
    add(x, base + height - 1.5, z, 23, 3, 23, 'wall', 'Sea Candle roof');
    const bx = 800, bz = -4900, by = groundHeight(bx, bz, scene.id);
    add(bx, by + 1, bz, 19, 2, 15, 'rock', 'Great Buddha pedestal');
    add(bx, by + 3, bz, 11, 4, 9, 'pine', 'Great Buddha crossed legs');
    add(bx, by + 7, bz, 7, 6, 6, 'pine', 'Great Buddha torso');
    add(bx, by + 11.675, bz, 4.5, 3.35, 4.5, 'pine', 'Great Buddha head');
    pagoda(450, -5400, 3, 55, 'wall', 'Kamakura temple');
    building(-2200, -3450, 75, 8, 1600, 'wall', 'Enoshima causeway');
  } else if (scene.id === 'alps') {
    pagoda(-1300, -2100, 5, 65, 'roof', 'Matsumoto Castle black keep');
    building(-1190, -2100, 150, 13, 40, 'wall', 'Matsumoto Castle wing');
    building(-1450, -1960, 140, 7, 25, 'torii', 'Castle red bridge');
  } else if (scene.id === 'kyoto') {
    building(-1300, -2700, 25, 1, 22, 'rock', 'Golden Pavilion pond terrace');
    pagoda(-1300, -2700, 3, scene.landmark.height, 'sun', 'Kinkaku-ji golden pavilion');
    pagoda(1700, -3800, 5, 95, 'wall', 'Kyoto five-story pagoda');
    for (let index = 0; index < 16; index++) torii(-500 + index * 42, -4400);
  } else if (scene.id === 'himeji') {
    const { x, z } = scene.landmark;
    const mainKeepScale = 1.2;
    building(x, z, 120, 10, 110, 'rock', 'Himeji stone foundation');
    pagoda(x, z, 5, scene.landmark.height * mainKeepScale, 'snow', 'Himeji white main keep');
    for (const [dx, dz] of [[-90, -20], [70, -90], [90, 70]]) pagoda(x + dx, z + dz, 3, 27, 'snow', 'Himeji subsidiary keep');
    for (const offset of [-490, 490]) {
      building(x + offset, z, 16, 22, 930, 'snow', 'Castle defensive wall');
      building(x, z + offset, 980, 22, 16, 'snow', 'Castle defensive wall');
    }
    for (const [w, d] of [[1260, 16], [16, 1140], [1540, 16], [16, 1360]]) {
      building(x, z, w, 6, d, 'water', 'Himeji moat');
    }
    for (let row = 0; row < 4; row++) for (let col = 0; col < 6; col++) {
      const townX = x - 1150 + col * 460, townZ = z + 450 + row * 420;
      if (Math.abs(townX - x) < 760 && Math.abs(townZ - z) < 740) continue;
      building(townX, townZ, 120, 14 + ((row + col) % 3) * 4, 95, 'wall', 'Himeji castle town');
    }
  } else if (scene.id === 'tokyo') {
    const { x, z } = scene.landmark, base = groundHeight(x, z, scene.id);
    for (let level = 0; level < 24; level++) {
      const y = 8 + level * 11, width = 83 * (1 - level / 29);
      for (const sideX of [-1, 1]) for (const sideZ of [-1, 1])
        add(x + sideX * width / 2, base + y, z + sideZ * width / 2, 6, 12, 6, level % 7 < 4 ? 'torii' : 'snow', 'Tokyo Tower lattice legs');
      if (level % 2 === 0) {
        add(x, base + y, z, width, 4, 6, 'torii', 'Tokyo Tower crossbeam');
        add(x, base + y, z, 6, 4, width, 'torii', 'Tokyo Tower crossbeam');
      }
    }
    add(x, base + 150, z, 55, 17, 55, 'snow', 'Tokyo Tower main deck');
    add(x, base + 250, z, 29, 12, 29, 'snow', 'Tokyo Tower upper deck');
    add(x, base + 296.5, z, 5, 73, 5, 'torii', 'Tokyo Tower antenna');
    const sx = 900, sz = -5400, sb = groundHeight(sx, sz, scene.id);
    for (let level = 0; level < 24; level++) {
      const width = 60 - level * 1.8;
      add(sx, sb + 10 + level * 20, sz, width, 20, width, 'wall', 'Tokyo Skytree shaft');
    }
    add(sx, sb + 350, sz, 85, 23, 85, 'glass-light', 'Skytree Tembo Deck');
    add(sx, sb + 450, sz, 53, 16, 53, 'glass-light', 'Skytree Tembo Galleria');
    add(sx, sb + 557, sz, 8, 154, 8, 'snow', 'Skytree antenna');
  } else {
    const { x, z } = scene.landmark, base = groundHeight(x, z, scene.id);
    for (let level = 0; level < 8; level++) add(x, base + 18.5 + level * 37, z, 140 - level * 9, 37, 120 - level * 7, 'wall', 'Landmark Tower stepped crown');
    for (let level = 0; level < 12; level++) add(-50 + level * 5, groundHeight(-50, -2500, scene.id) + 5 + level * 10, -2500,
      110 - level * 7, 10, 150, 'snow', 'InterContinental sail hotel');
    const wx = 100, wz = -3300, wy = groundHeight(wx, wz, scene.id) + 56.25;
    for (let i = 0; i < 28; i++) {
      const angle = i / 28 * Math.PI * 2;
      add(wx + Math.cos(angle) * 56, wy + Math.sin(angle) * 56, wz, 8, 8, 8, 'torii', 'Cosmo Clock gondola');
      for (let step = 1; step < 7; step++) add(wx + Math.cos(angle) * step * 8, wy + Math.sin(angle) * step * 8, wz, 3, 3, 3, 'wall', 'Cosmo Clock spoke');
    }
    add(wx, wy - 27, wz, 10, 58, 10, 'wall', 'Cosmo Clock support');
    const ship = GEODATA_OVERLAYS.overlays.yokohama.find(({ name }) => name === 'Geodata Nippon Maru hull');
    const shipBase = groundHeight(ship.x, ship.z, scene.id);
    add(ship.x, shipBase + 4, ship.z, 230, 8, 34, 'snow', 'Nippon Maru hull');
    add(ship.x, shipBase + 14, ship.z, 170, 12, 26, 'wall', 'Nippon Maru deckhouse');
    add(ship.x, shipBase + 40, ship.z, 8, 64, 8, 'torii', 'Nippon Maru mast');
    building(1750, -1650, 980, 4, 260, 'grass-light', 'Yamashita Park lawn');
    building(1750, -1515, 980, 3, 34, 'wall', 'Yamashita Park promenade');
    building(2230, -1880, 1250, 8, 260, 'rock', 'Osan Pier deck');
    building(2390, -1880, 110, 14, 250, 'wall', 'Osan Pier terminal');
    for (let pier = 0; pier < 4; pier++) building(1750, -800 - pier * 950, 1100, 9, 140, 'rock', 'Harbor pier');
    for (let warehouse = 0; warehouse < 3; warehouse++) building(700, -1100 - warehouse * 170, 360, 30, 90, 'torii', 'Red Brick Warehouse');
  }
  const overlays = (GEODATA_OVERLAYS.overlays[scene.id] || []).filter(({ name }) =>
    name !== 'Geodata Nippon Maru hull' && name !== 'Geodata Nippon Maru deckhouse');
  const isTownBlock = ({ name }) => name === 'Geodata city block' || name === 'Geodata castle town block';
  const landmarkBlocks = blocks.concat(overlays
    .filter((overlay) => !isTownBlock(overlay) && !overlay.name.startsWith('Geodata road '))
    .map(({ x, z, w, d }) => ({ position: [x, 0, z], size: [w, 0, d] })));
  for (const overlay of overlays) {
    if (isTownBlock(overlay) && landmarkBlocks.some((block) =>
      Math.abs(overlay.x - block.position[0]) < (overlay.w + block.size[0]) / 2 &&
      Math.abs(overlay.z - block.position[2]) < (overlay.d + block.size[2]) / 2)) continue;
    building(overlay.x, overlay.z, overlay.w, overlay.h, overlay.d, overlay.color, overlay.name);
  }
  const urban = scene.id === 'tokyo' || scene.id === 'yokohama';
  for (let index = 0; index < (urban ? 420 : 90); index++) {
    const x = -3700 + (index % 21) * 345;
    const z = -6300 + Math.floor(index / 21) * 330;
    if (groundHeight(x, z, scene.id) <= WATER_LEVEL || blocks.some((block) => Math.abs(x - block.position[0]) < block.size[0] / 2 + 130 && Math.abs(z - block.position[2]) < block.size[2] / 2 + 130)) continue;
    const h = urban ? 30 + ((index * 71) % 170) : 12 + index % 15;
    const base = building(x, z, urban ? 115 : 40, h, urban ? 90 : 32, 'wall');
    add(x, base + h + 3, z, urban ? 119 : 50, 6, urban ? 94 : 42, 'roof', 'Building roof');
  }
  return blocks;
}

const routePoints = [
  [0, 1120, -200, 'Waterfront approach'], [-950, 1390, -2300, 'Landmark approach'],
  [-3100, 2500, -4300, 'Western panorama'], [-2200, 3600, -6200, 'High pass'],
  [-450, 4300, -5600, 'Summit pass'], [2150, 3000, -5400, 'Eastern panorama'],
  [2600, 1540, -2800, 'Valley run'], [700, 1130, 800, 'Homeward'],
];
export const SCENES = definitions.map((entry) => {
  const scene = { horizontalScale: 'Stylized, horizontally compressed landmark arrangement; not a navigation map.', ...entry };
  const { x, z, height } = scene.landmark;
  // Mountain heights are ASL; building heights are measured above the rendered ground.
  scene.landmark = { ...scene.landmark, altitude: height + (['fuji', 'alps'].includes(scene.id) ? 0 : groundHeight(x, z, scene.id)) };
  scene.spawn = { x: 0, y: 1100, z: 1800 };
  scene.route = routePoints.map(([x, y, z, name], index) => ({
    x, z, y: scene.id === 'fuji' ? y : scene.id === 'alps' ? [1120, 1800, 3100, 3700, 3500, 2900, 1850, 1130][index] : [1120, 1100, 1050, 1200, 1200, 1100, 1050, 1130][index],
    name: index === 4 && scene.id !== 'fuji' ? `${scene.landmark.name} panorama` : name,
  }));
  scene.blocks = architecture(scene);
  scene.collisionBounds = scene.blocks.map(({ position, size }) => ({
    min: { x: position[0] - size[0] / 2, y: position[1] - size[1] / 2, z: position[2] - size[2] / 2 },
    max: { x: position[0] + size[0] / 2, y: position[1] + size[1] / 2, z: position[2] + size[2] / 2 },
  }));
  scene.maxStructureHeight = Math.max(...scene.collisionBounds.map(({ max }) => max.y));
  return scene;
});

export function getScene(id = 'fuji') {
  const scene = SCENES.find((entry) => entry.id === id);
  if (!scene) throw new RangeError(`Unknown scene: ${id}`);
  return scene;
}

export function intersectsScenery(previous, current, sceneId = 'fuji', radius = 6) {
  const scene = getScene(sceneId);
  if (Math.min(previous.y, current.y) > scene.maxStructureHeight + radius) return false;
  return scene.collisionBounds.some(({ min, max }) => {
    let enter = 0, exit = 1;
    for (const axis of ['x', 'y', 'z']) {
      const delta = current[axis] - previous[axis];
      const low = min[axis] - radius, high = max[axis] + radius;
      if (Math.abs(delta) < 1e-9) {
        if (previous[axis] < low || previous[axis] > high) return false;
      } else {
        const first = (low - previous[axis]) / delta, second = (high - previous[axis]) / delta;
        enter = Math.max(enter, Math.min(first, second));
        exit = Math.min(exit, Math.max(first, second));
        if (enter > exit) return false;
      }
    }
    return true;
  });
}
