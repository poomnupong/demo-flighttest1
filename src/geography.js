export const YOKOHAMA_ORIGIN = { latitude: 35.455, longitude: 139.6317, x: -1000, z: -3000 };
export const YOKOHAMA_BOUNDS = [35.441, 139.625, 35.470, 139.657];

const latitude = YOKOHAMA_ORIGIN.latitude * Math.PI / 180;
const northMeters = 111132.92 - 559.82 * Math.cos(2 * latitude) + 1.175 * Math.cos(4 * latitude);
const eastMeters = 111412.84 * Math.cos(latitude) - 93.5 * Math.cos(3 * latitude) + 0.118 * Math.cos(5 * latitude);

export function project(latitude, longitude) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) throw new TypeError('Geographic coordinates must be finite');
  return [YOKOHAMA_ORIGIN.x + (longitude - YOKOHAMA_ORIGIN.longitude) * eastMeters,
    YOKOHAMA_ORIGIN.z - (latitude - YOKOHAMA_ORIGIN.latitude) * northMeters];
}

export function unproject(x, z) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) throw new TypeError('World coordinates must be finite');
  return [YOKOHAMA_ORIGIN.latitude - (z - YOKOHAMA_ORIGIN.z) / northMeters,
    YOKOHAMA_ORIGIN.longitude + (x - YOKOHAMA_ORIGIN.x) / eastMeters];
}

export function ringContains(x, z, ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [ax, az] = ring[i], [bx, bz] = ring[j];
    if ((az > z) !== (bz > z) && x < (bx - ax) * (z - az) / (bz - az) + ax) inside = !inside;
  }
  return inside;
}

export function polygonContains(x, z, rings) {
  return rings.some(({ role, points }) => role === 'outer' && ringContains(x, z, points))
    && !rings.some(({ role, points }) => role === 'inner' && ringContains(x, z, points));
}

export function boundsOf(points) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const [x, z] of points) {
    bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], z);
    bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], z);
  }
  return bounds;
}

export function joinClosedRings(parts, id) {
  const pending = parts.map((part) => part.slice()), rings = [];
  const equal = (a, b) => a[0] === b[0] && a[1] === b[1];
  if (pending.some((part) => part.length < 2)) throw new Error(`Incomplete polygon segment: ${id}`);
  while (pending.length) {
    const ring = pending.shift();
    while (!equal(ring[0], ring.at(-1))) {
      const end = ring.at(-1);
      const index = pending.findIndex((part) => equal(part[0], end) || equal(part.at(-1), end));
      if (index === -1) throw new Error(`Incomplete polygon ring: ${id}`);
      const [part] = pending.splice(index, 1);
      if (!equal(part[0], end)) part.reverse();
      ring.push(...part.slice(1));
    }
    if (ring.length < 4) throw new Error(`Degenerate polygon ring: ${id}`);
    rings.push(ring);
  }
  return rings;
}

export function segmentDistance(x, z, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const lengthSquared = dx * dx + dz * dz;
  const t = lengthSquared ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / lengthSquared)) : 0;
  return Math.hypot(x - a[0] - t * dx, z - a[1] - t * dz);
}

export function mergeGrid(grid, width, height) {
  const visited = new Uint8Array(grid.length);
  const rectangles = [];
  for (let z = 0; z < height; z++) for (let x = 0; x < width; x++) {
    const index = z * width + x, value = grid[index];
    if (!value || visited[index]) continue;
    let w = 1, d = 1;
    while (x + w < width && !visited[index + w] && grid[index + w] === value) w++;
    extend: while (z + d < height) {
      for (let col = 0; col < w; col++) {
        const next = (z + d) * width + x + col;
        if (visited[next] || grid[next] !== value) break extend;
      }
      d++;
    }
    for (let row = 0; row < d; row++) visited.fill(1, (z + row) * width + x, (z + row) * width + x + w);
    rectangles.push([x, z, w, d, value]);
  }
  return rectangles;
}
