# Fuji Flight

**[Play in your browser](https://poomnupong.github.io/demo-flighttest1/)** | [Source on GitHub](https://github.com/poomnupong/demo-flighttest1)

The repository is named **demo-flighttest1**; the game is called **Fuji Flight**. Open the play link in Safari on iPhone or a current Android browser. Touch controls support portrait and landscape. A modern device with WebGL 2 is required; use the lower render-quality setting if performance is slow.

Open **[index.html](index.html)** in a current browser with WebGL 2 support. The game is one self-contained HTML file: all code, libraries, geometry, colors, icons, and synthesized audio are embedded. No server, network connection, installation, or external assets are needed to play.

Explore Yokohama's mapped waterfront, starting in an **F-22 Raptor in daylight**. Open the **gear icon** to switch to the F-35A or Japan Airlines-inspired Boeing 787 Dreamliner, or change lighting. Terrain, mapped buildings, landmarks, aircraft, clouds, celestial objects, gates, and exhaust use blocks, with a colorful retro 16-bit-inspired palette. Aircraft and landmark details are simplified interpretations, not licensed replicas.

## Controls

The Yokohama circuit starts airborne in the F-22 with autopilot engaged. Any pitch, roll, or yaw input switches to manual flight. Hover over a tool button for its name and shortcut.

| Input | Action |
| --- | --- |
| W / Up arrow | Pitch down (inverted Y, default) |
| S / Down arrow | Pitch up (inverted Y, default) |
| A / D or Left / Right arrows | Bank left / right |
| Q / E | Yaw left / right |
| + / - or ] / [ | Increase / decrease throttle |
| Hold Shift | Afterburner (fighters only) |
| Drag the scene with the mouse | Look around / orbit the aircraft |
| Mouse wheel | Camera distance; field of view in cockpit mode |
| J / L | Rotate the camera horizontally |
| I / K | Rotate the camera vertically |
| C | Cycle chase, cockpit, and orbit cameras |
| G | Toggle route autopilot |
| P / Escape | Pause / resume; exit photo mode |
| O | Enter / exit photo mode |
| M | Toggle engine sound |
| R | Restart the current flight mode |

On narrow screens, the virtual flight stick controls pitch and bank: push forward to lower the nose and pull back to raise it. Disable **Invert Y axis** in settings to reverse keyboard and touch pitch together; bank and camera controls are unchanged. The rocket button activates fighter afterburners; the plus/minus buttons change throttle. Drag elsewhere to move the camera.

Settings include aircraft, scene, camera, throttle, sensitivity, autopilot, sound, day/night, three daylight styles, render quality, photo mode, and fullscreen. Aircraft selection preserves your flight and adjusts the camera; the 787 has no afterburner. Scene selection restarts the current circuit/free-flight mode and updates its terrain, checkpoints, minimap, and landmark labels. Old scene and aircraft graphics resources are released when switching.

**Lighting defaults to Day**, regardless of the device clock. Night and **Automatic (local sun)** remain selectable. Automatic mode uses an approximate solar-elevation calculation for the scene's latitude, longitude and date, not the device's timezone, and refreshes every minute offline. The settings clock shows Japan Standard Time. Daylight styles remain available during daytime; night includes a block moon and stars. This is not a weather service or a precise astronomical simulation.

## Flight Modes

- **Circuit:** clear eight gates in the selected scene. Points are awarded for each gate and for completing the course. Your best score is stored per scene locally when browser storage is available.
- **Free flight:** explore without checkpoints or scoring.
- **Photo mode:** freezes the flight, removes the instruments, and allows camera positioning. The download icon exports the scene as a PNG. Embedded browser viewers may restrict downloads; use a regular browser in that case.

Terrain contact or leaving the bounded flight area ends the flight, with an immediate restart option. Switching tabs pauses the flight. Sound is off until explicitly enabled.

This is an **arcade flight game**, not an aircraft training simulator. All three aircraft share accessible arcade flight handling, not aircraft-specific certified performance. Terrain and landmarks are block approximations, not surveyed meshes or a navigation system. Yokohama's detailed central waterfront uses local-meter map geography, with estimated missing heights and flat ground elevation. Landmark silhouettes remain simplified at block resolution. Cockpit mode is a forward pilot view, not a replica instrument panel.

## Scenes and public references

**Yokohama is the only available scene.** The former Mount Fuji, Kamakura/Enoshima, Alps, Kyoto, Himeji and Tokyo maps, their synthetic building generators, and their legacy geodata pipeline have been removed. New locations must be backed by real map data before being registered; there are no placeholder maps or random city grids.

| Scene | Featured landmarks and references |
| --- | --- |
| Yokohama | Mapped Minato Mirai, Shinko and Yamashita waterfront; [Landmark Tower](https://www.yokohama-landmark.jp/about/), sail-shaped hotel, Nippon Maru, Cosmo Clock 21, two Red Brick Warehouses, Osanbashi and Yamashita Park |

All scenery is compiled offline without fetching maps or external assets during play.

### Yokohama mapped waterfront

Yokohama uses a checked-in **OpenStreetMap snapshot dated 2026-05-31**, acquired through the public Private.coffee Overpass service. The detailed region covers approximately 35.441–35.470 N, 139.625–139.657 E (about 3 × 3.2 km), including Minato Mirai, Shinko, Osanbashi and Yamashita Park. This is the central waterfront, not the whole city or Bay Bridge.

Coastline and inland-water polygons define land, docks and harbor water. Actual building footprints, streets, bridges, railway corridors and park polygons replace the old random grid and schematic piers. Geographic coordinates use a common local-meter projection, with east as positive X and north as negative Z. Ground is sampled at 10 m and buildings/streets at 5 m, merging adjacent boxes without filling polygon holes. The minimap, ground contact and rendered terrain share this data. Swept structure collision uses the rendered boxes, indexed into local spatial buckets.

Landmark Tower (295.8 m in the snapshot), the InterContinental sail hotel, Nippon Maru and its four masts, Cosmo Clock 21, the two Red Brick Warehouses and Osanbashi use their mapped footprints and orientations. Their silhouettes are simplified block models. Heights prefer OSM height tags, then 3.2 m per tagged floor, then explicit 8 m house / 15 m other-building estimates. Mapped canopies (`building=roof`) are thin roofs, not solid buildings, with a 4 m estimated height when untagged. Ship rigging, pier/deck elevations, road widths without tags and tree placement are approximate. Ground uses the game's flat 46 m datum above its 38 m water surface, **not surveyed elevation**. Beyond the detailed region, the outer landscape is a coarse, building-free schematic continuation; it should not be used as geographic evidence.

Every rendered building is traceable to an active source footprint. Compilation excludes `building=no`, construction-only/proposed and explicitly demolished/removed structures; suppresses ways already represented by a building multipolygon; and reconciles identical footprints without stacking duplicate buildings. Disused occupants and old project end dates alone do not establish demolition. The generated dataset records excluded IDs and reasons. Rebuilding replaces the entire dataset, so removed source buildings cannot survive as stale meshes or colliders. These guarantees are relative to the pinned map snapshot, not a live survey.

The scene has its own eight-gate waterfront circuit. Its minimap starts at waterfront scale and expands to keep the aircraft visible in free flight. Map attribution remains visible in photo mode and is included in exported Yokohama photographs.

**Data license:** © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), available under [ODbL 1.0](https://opendatacommons.org/licenses/odbl/1-0/). The original compressed snapshot and query/date/checksum manifest are in [`data/geodata/`](data/geodata/); the derived database is [`src/data/yokohama.generated.js`](src/data/yokohama.generated.js), also under ODbL. See [`LICENSE-OSM.txt`](data/geodata/LICENSE-OSM.txt). This data license does not change the game's code license.

```sh
# Explicit network operation: obtain and validate a new geographic snapshot.
npm run yokohama:fetch
# Deterministically rebuild from the checked-in snapshot, with no network.
npm run yokohama:build
npm run build
```

The fetcher validates required landmarks, complete polygon rings and coastline coverage before replacing the existing snapshot. Download/validation failures are reported, not replaced by invented geography. If the public service is unavailable, retain the pinned snapshot. A previously downloaded response can be validated with `node scripts/fetch-yokohama.mjs --input /path/to/overpass.json`. Normal builds and tests never fetch map data.

Aircraft length/span references: [USAF F-35A](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/478441/f-35a-lightning-ii/), [USAF F-22](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/), and [JAL Boeing 787-8](https://www.jal.co.jp/en/aircraft/conf/787.html). Automatic daylight uses the [NOAA approximate solar equations](https://gml.noaa.gov/grad/solcalc/solareqns.PDF); it does not account for terrain-obstructed sunrise or local weather.

## Development

Requires Node.js 22 or newer for rebuilding only.

```sh
npm ci
npm run check
npm test
npm run build
```

`npm run geodata:update` is an optional, network-dependent refresh of the Yokohama dataset; it is not required to build or play. Commit regenerated data and `index.html` together after an intentional refresh.

To add another real-data scene, provide a licensed, pinned snapshot and deterministic compiler, then register its terrain/surface samplers, detail bounds, ground boxes, source-backed architecture, route and spawn in `src/scenes.js`. The shared renderer and collision index consume that contract without scene-specific synthetic building generators. Add source reconciliation, geometry, route and disposal tests before making the scene selectable.

The generated [index.html](index.html) is the only file needed for distribution. The esbuild bundler is [scripts/build.mjs](scripts/build.mjs). Three.js handles rendering, cannon-es handles fixed-step rigid-body integration, and Lucide provides interface icons. Dependency license notices are embedded in the generated HTML.

Tests cover level flight, steering, throttle and afterburner, pause/reset, terrain and boundary contact, swept gate crossing, course clearance, full autopilot completion, frame-rate independence at 30/60/120 FPS, scene switching, block geometry, aircraft proportions, resource disposal, inverted input, and seasonal/local lighting. Yokohama adds projection accuracy, coastline/dock samples, footprint occupancy and polygon holes, spatial collision, source provenance, deterministic offline regeneration and a 125,000-instance scene budget.

## Make changes from your iPhone

1. In GitHub Mobile, open **Copilot**, then **New Session**.
2. Select **poomnupong/demo-flighttest1** with base branch **main**.
3. Describe the change and ask for a pull request, for example: "Add a landing challenge. Keep the phone touch controls and offline build working. Rebuild index.html and open a pull request."
4. Follow the session and provide feedback. Review the pull request, approve workflow execution if GitHub requests it, and merge it when ready. You can request follow-up edits with an `@copilot` pull-request comment.
5. After the **Build and deploy game** workflow finishes, reopen or refresh the play link to see the update.

Alternatively, create an issue describing a change and assign it to **Copilot**. Cloud-agent access requires an eligible Copilot plan and enabled account or organization policies. If this repository is missing from the agent picker, check your [Copilot settings](https://github.com/settings/copilot).

See [GitHub's mobile cloud-agent guide](https://docs.github.com/en/copilot/how-tos/use-copilot-agents/cloud-agent/use-cloud-agent-on-mobile).

## Deployment and contributor guidance

GitHub Pages hosts only the built `index.html`; it does not require a running Mac or a backend. Pull requests run the checks, tests, and build without deploying. Pushes or merges to `main` publish the game automatically. The repository's **Settings > Pages > Source** must be **GitHub Actions**.

- Edit `src/template.html` for the interface and styles, `src/game.js` for input/rendering, `src/flight.js` for flight rules, `src/scenes.js` for scene definitions, `src/world.js` for scenery, `src/aircraft.js` for aircraft, and `src/settings.js` for pitch mapping and local daylight. `src/geography.js`, `src/yokohama.js` and `scripts/build-yokohama.mjs` own the mapped waterfront.
- Do not edit the generated `index.html` directly. Run `npm run build` and commit it with source changes; CI rejects a stale generated game.
- Preserve the self-contained, offline build, embedded dependency licenses, existing theme variables, and keyboard and touch controls.
- Keep dependency versions locked and run `npm ci`, `npm run check`, `npm test`, and `npm run build` before opening a pull request.
- Check phone portrait and landscape layouts when changing the interface. Deployments update the shared live site only after merging, not while a pull request is being reviewed.

The cloud agent's Node.js environment and dependencies are prepared by `.github/workflows/copilot-setup-steps.yml`.