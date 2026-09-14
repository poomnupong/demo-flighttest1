import { mkdir, writeFile } from 'node:fs/promises';

const SOURCES = [
  {
    id: 'yokohama-minatomirai-1',
    url: 'https://raw.githubusercontent.com/whosonfirst-data/whosonfirst-data-admin-jp/6ac4e1339705ddb8e99d3d85d5837a23b0cca09b/data/859/128/55/85912855-alt-quattroshapes.geojson',
    file: 'yokohama-minatomirai-1.geojson',
  },
  {
    id: 'yokohama-minatomirai-2',
    url: 'https://raw.githubusercontent.com/whosonfirst-data/whosonfirst-data-admin-jp/6ac4e1339705ddb8e99d3d85d5837a23b0cca09b/data/859/128/59/85912859-alt-quattroshapes.geojson',
    file: 'yokohama-minatomirai-2.geojson',
  },
  {
    id: 'yokohama-minatomirai-3',
    url: 'https://raw.githubusercontent.com/whosonfirst-data/whosonfirst-data-admin-jp/6ac4e1339705ddb8e99d3d85d5837a23b0cca09b/data/859/128/61/85912861-alt-quattroshapes.geojson',
    file: 'yokohama-minatomirai-3.geojson',
  },
  {
    id: 'yokohama-minatomirai-4',
    url: 'https://raw.githubusercontent.com/whosonfirst-data/whosonfirst-data-admin-jp/6ac4e1339705ddb8e99d3d85d5837a23b0cca09b/data/859/128/63/85912863-alt-quattroshapes.geojson',
    file: 'yokohama-minatomirai-4.geojson',
  },
  {
    id: 'yokohama-minatomirai-6',
    url: 'https://raw.githubusercontent.com/whosonfirst-data/whosonfirst-data-admin-jp/6ac4e1339705ddb8e99d3d85d5837a23b0cca09b/data/859/128/65/85912865-alt-quattroshapes.geojson',
    file: 'yokohama-minatomirai-6.geojson',
  },
  {
    id: 'himeji-locality',
    url: 'https://raw.githubusercontent.com/whosonfirst-data/whosonfirst-data-admin-jp/6ac4e1339705ddb8e99d3d85d5837a23b0cca09b/data/102/031/745/102031745.geojson',
    file: 'himeji-locality.geojson',
  },
  {
    id: 'japan-travel-batch3',
    url: 'https://raw.githubusercontent.com/ookami0210/japan-travel-mcp/main/docs/quality/judge_v3_batches/random-r2_100case/batch_3_prompt.txt',
    file: 'batch_3_prompt.txt',
  },
  {
    id: 'japan-travel-batch8',
    url: 'https://raw.githubusercontent.com/ookami0210/japan-travel-mcp/7a7ef438337020796b961a84c03284c3c057945c/docs/quality/judge_v3_batches/iter153-r420_100case/batch_8_prompt.txt',
    file: 'batch_8_prompt.txt',
  },
  {
    id: 'theme-parks',
    url: 'https://raw.githubusercontent.com/tabachain/geoJSON/be0cd31774f477da08d94f9e4d71b616f2933c69/theme_park.geojson',
    file: 'theme_park.geojson',
  },
  {
    id: 'cruise-locations',
    url: 'https://raw.githubusercontent.com/mixingchex/GMcruise/3f6688fb2ba3198350639859e754727c007dece2/data/locations.json',
    file: 'locations.json',
  },
  {
    id: 'landmark-radio-geo',
    url: 'https://raw.githubusercontent.com/BoxPistols/DID-J26/ebdbef4caad10ad74b31c34f70e00a85c3d69c21/src/lib/utils/geo.ts',
    file: 'geo.ts',
  },
];

await mkdir('data/geodata/raw', { recursive: true });

for (const source of SOURCES) {
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`Failed to download ${source.id}: ${response.status} ${response.statusText}`);
  const text = await response.text();
  await writeFile(`data/geodata/raw/${source.file}`, text);
  console.log(`Saved ${source.file} (${text.length.toLocaleString()} chars)`);
}

await writeFile('data/geodata/raw/sources.json', `${JSON.stringify(SOURCES, null, 2)}\n`);
console.log('Geodata raw download complete.');
