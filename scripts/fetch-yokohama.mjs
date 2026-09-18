import { readFile, writeFile, rename, mkdtemp, mkdir, rm } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const endpoint = 'https://overpass.private.coffee/api/interpreter';
export const query = '[out:json][timeout:60];(' + [
  'way["natural"="coastline"]', 'way["building"]', 'relation["building"]', 'way["highway"]',
  'way["railway"="rail"]', 'nwr["leisure"="park"]', 'nwr["natural"="water"]',
  'nwr["waterway"]', 'nwr["man_made"="pier"]', 'nwr["attraction"]',
].map((selector) => `${selector}(35.428,139.612,35.479,139.665);`).join('') + ');out geom;';

const input = process.argv.indexOf('--input');
let bytes;
if (input !== -1) {
  if (!process.argv[input + 1]) throw new Error('--input requires a downloaded Overpass JSON path');
  bytes = await readFile(process.argv[input + 1]);
} else {
  const url = `${endpoint}?data=${encodeURIComponent(query)}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'AtlasFlight-offline-geodata/1.0 (https://github.com/poomnupong/demo-flighttest1)' },
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok) throw new Error(`Yokohama snapshot download failed: HTTP ${response.status}. Existing snapshot retained.`);
  bytes = Buffer.from(await response.arrayBuffer());
}
const data = JSON.parse(bytes);
if (data.remark || !data.osm3s?.timestamp_osm_base || !Array.isArray(data.elements)) {
  throw new Error(`Invalid or incomplete Overpass snapshot: ${data.remark || 'missing metadata/elements'}`);
}
for (const id of [64891750, 57932445, 138101264, 363854124, 72998296, 72998303, 504126759, 35866698]) {
  if (!data.elements.some((element) => element.type === 'way' && element.id === id && element.geometry?.length > 1)) {
    throw new Error(`Snapshot missing required landmark way/${id}; existing snapshot retained`);
  }
}
if (data.elements.filter((element) => element.tags?.natural === 'coastline').length < 10) {
  throw new Error('Snapshot has insufficient coastline coverage; existing snapshot retained');
}
const metadata = {
  endpoint, query, snapshotDate: data.osm3s.timestamp_osm_base,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  license: 'ODbL-1.0', attribution: 'OpenStreetMap contributors',
  licenseUrl: 'https://opendatacommons.org/licenses/odbl/1-0/',
  copyrightUrl: 'https://www.openstreetmap.org/copyright',
  detailBounds: [35.441, 139.625, 35.470, 139.657],
};
const path = 'data/geodata/raw/yokohama-osm.json.gz';
const compressed = gzipSync(bytes, { level: 9 }), manifest = `${JSON.stringify(metadata, null, 2)}\n`;
const staging = await mkdtemp(join(tmpdir(), 'atlas-yokohama-download-'));
try {
  await mkdir(join(staging, 'data/geodata/raw'), { recursive: true });
  await mkdir(join(staging, 'src/data'), { recursive: true });
  await writeFile(join(staging, path), compressed);
  await writeFile(join(staging, 'data/geodata/yokohama-source.json'), manifest);
  execFileSync(process.execPath, [fileURLToPath(new URL('./build-yokohama.mjs', import.meta.url))], { cwd: staging, stdio: 'inherit' });
} finally {
  await rm(staging, { recursive: true, force: true });
}
await writeFile(`${path}.tmp`, compressed);
await rename(`${path}.tmp`, path);
await writeFile('data/geodata/yokohama-source.json', manifest);
console.log(`Saved verified OSM snapshot: ${data.elements.length} features, ${metadata.snapshotDate}, SHA256 ${metadata.sha256}`);
