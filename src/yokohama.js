import { YOKOHAMA } from './data/yokohama.generated.js';

export const yokohama = YOKOHAMA;
const { bounds, cell, width, depth } = YOKOHAMA;
const grid = new Uint8Array(width * depth);
for (const [x, z, w, d, kind] of YOKOHAMA.surfaces) {
  for (let row = z; row < z + d; row++) grid.fill(kind, row * width + x, row * width + x + w);
}

export function inYokohamaDetail(x, z) {
  return x >= bounds[0] && x < bounds[2] && z >= bounds[1] && z < bounds[3];
}

export function yokohamaSurface(x, z) {
  if (x > bounds[2] + 600) return 1;
  if (x < bounds[0] - 600) return 2;
  const column = Math.max(0, Math.min(width - 1, Math.floor((x - bounds[0]) / cell)));
  const row = Math.max(0, Math.min(depth - 1, Math.floor((z - bounds[1]) / cell)));
  return grid[row * width + column];
}

export function yokohamaTerrain(x, z) {
  if (!inYokohamaDetail(x, z)) {
    x = Math.floor(x / 100) * 100 + 50;
    z = Math.floor(z / 100) * 100 + 50;
  }
  if (yokohamaSurface(x, z) === 1) return -30;
  const distance = Math.max(bounds[0] - x, 0);
  return 46 + Math.round(Math.max(0, distance - 400) * 0.025);
}

export function yokohamaBlocks() {
  return YOKOHAMA.blocks.map(([x, y, z, w, h, d, color, feature]) => {
    const source = YOKOHAMA.features[feature];
    return { position: [x, y, z], size: [w, h, d], color: YOKOHAMA.colors[color],
      name: source.name, sourceId: source.id, kind: source.kind };
  });
}

export function yokohamaGround() {
  return YOKOHAMA.surfaces.map(([x, z, w, d, kind]) => {
    const height = kind === 1 ? -30 : 46;
    return { position: [bounds[0] + (x + w / 2) * cell, (height - 170) / 2, bounds[1] + (z + d / 2) * cell],
      size: [w * cell, height + 170, d * cell], color: kind === 3 ? 'grass-light' : 'urban' };
  });
}

export const yokohamaRoute = [
  [-200, 620, -2100, 'Yamashita waterfront'],
  [500, 650, -3400, 'Osanbashi harbor'],
  [-200, 700, -4750, 'Minato Mirai north'],
  [-1700, 720, -4500, 'Modern skyline'],
  [-2200, 750, -3100, 'Landmark Tower panorama'],
  [-1650, 690, -1650, 'Nippon Maru approach'],
  [-600, 620, -650, 'Waterfront panorama'],
  [750, 620, -1300, 'Harbor return'],
].map(([x, y, z, name]) => ({ x, y, z, name }));
