# Fuji Flight

**[Play in your browser](https://poomnupong.github.io/demo-flighttest1/)** | [Source on GitHub](https://github.com/poomnupong/demo-flighttest1)

The repository is named **demo-flighttest1**; the game is called **Fuji Flight**. Open the play link in Safari on iPhone or a current Android browser. Touch controls support portrait and landscape. A modern device with WebGL 2 is required; use the lower render-quality setting if performance is slow.

Open **[index.html](index.html)** in a current browser with WebGL 2 support. The game is one self-contained HTML file: all code, libraries, geometry, colors, icons, and synthesized audio are embedded. No server, network connection, installation, or external assets are needed to play.

Explore seven Japanese locations in an F-35A, F-22, or Japan Airlines-inspired Boeing 787 Dreamliner. Open the **gear icon** to choose an aircraft or scene. Terrain, landmarks, aircraft, clouds, celestial objects, gates, and exhaust use blocks, with a colorful retro 16-bit-inspired palette. Aircraft and landmarks are original procedural interpretations, not licensed replicas.

## Controls

The circuit starts airborne with autopilot engaged. Any pitch, roll, or yaw input switches to manual flight. Hover over a tool button for its name and shortcut.

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

**Day/night defaults to the location's current sunlight**, using the device clock and an approximate solar-elevation calculation for the scene's latitude, longitude, and date, not the device's timezone. The settings clock shows Japan Standard Time. Automatic lighting refreshes every minute, accounts for seasonal daylight, and works offline. Select **Day** or **Night** to override it; daylight styles remain available during daytime. Night includes a block moon and stars. This is not a weather service or a precise astronomical simulation.

## Flight Modes

- **Circuit:** clear eight gates in the selected scene. Points are awarded for each gate and for completing the course. Your best score is stored per scene locally when browser storage is available.
- **Free flight:** explore without checkpoints or scoring.
- **Photo mode:** freezes the flight, removes the instruments, and allows camera positioning. The download icon exports the scene as a PNG. Embedded browser viewers may restrict downloads; use a regular browser in that case.

Terrain contact or leaving the bounded flight area ends the flight, with an immediate restart option. Switching tabs pauses the flight. Sound is off until explicitly enabled.

This is an **arcade flight game**, not an aircraft training simulator. All three aircraft share accessible arcade flight handling, not aircraft-specific certified performance. Terrain and landmarks are geographically informed block approximations, not surveyed meshes or a georeferenced navigation map. Fuji's summit targets its real 3,776 m elevation, with a crater and terraced slopes; horizontal distances are compressed to fit the playable area. Landmark silhouettes and proportions are simplified at block resolution. Cockpit mode is a forward pilot view, not a replica instrument panel.

## Scenes and public references

Landmark identity, key dimensions, and silhouettes are based on the following public information. Their arrangement is compressed for play, not a recreation of exact street layouts; scenery is generated offline without fetching maps or external assets.

| Scene | Featured landmarks and references |
| --- | --- |
| Mount Fuji | [3,776 m summit, approximately 750 m-wide / 200 m-deep crater](https://web-japan.org/atlas/nature/nat06.html), terraced volcanic slopes, lake, pagoda and torii |
| Kamakura / Enoshima | Island, causeway, [Sea Candle observation lighthouse](https://enoshima-seacandle.com/), [seated Great Buddha](https://www.city.kamakura.kanagawa.jp/english/buddha.html) |
| Japan Alps / Nagano | Northern Alps and river valley, [Matsumoto's black castle](https://www.matsumoto-castle.jp/lang/eng/) |
| Kyoto | [Three-story Golden Pavilion](https://www.japan.travel/en/spot/1152/), pagoda, torii avenue and mountain basin |
| Himeji | [White Heron Castle](https://www.city.himeji.lg.jp/castle/), tiered keep, ramparts, concentric moat and surrounding castle-town blocks |
| Tokyo | [333 m Tokyo Tower](https://www.tokyotower.co.jp/en.html), [634 m Skytree](https://www.tokyo-skytree.jp/en/), city blocks, river and bay |
| Yokohama | [Landmark Tower](https://www.yokohamajapan.com/things-to-do/detail.php?bbid=183), sail-shaped hotel, [Cosmo Clock Ferris wheel](https://www.senyo.co.jp/cosmo/), Nippon Maru, Yamashita Park, Osan Pier, red-brick warehouses and harbor |

Aircraft length/span references: [USAF F-35A](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/478441/f-35a-lightning-ii/), [USAF F-22](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/), and [JAL Boeing 787-8](https://www.jal.co.jp/en/aircraft/conf/787.html). Automatic daylight uses the [NOAA approximate solar equations](https://gml.noaa.gov/grad/solcalc/solareqns.PDF); it does not account for terrain-obstructed sunrise or local weather.

## Development

Requires Node.js 22 or newer for rebuilding only.

```sh
npm ci
npm run check
npm test
npm run build
```

The generated [index.html](index.html) is the only file needed for distribution. The esbuild bundler is [scripts/build.mjs](scripts/build.mjs). Three.js handles rendering, cannon-es handles fixed-step rigid-body integration, and Lucide provides interface icons. Dependency license notices are embedded in the generated HTML.

Tests cover level flight, steering, throttle and afterburner, pause/reset, terrain and boundary contact, swept gate crossing, course clearance, full autopilot completion, frame-rate independence at 30/60/120 FPS, scene switching, block geometry, aircraft proportions, resource disposal, inverted input, and seasonal/local lighting.

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

- Edit `src/template.html` for the interface and styles, `src/game.js` for input/rendering, `src/flight.js` for flight rules, `src/scenes.js` for geographic scene definitions, `src/world.js` for scenery, `src/aircraft.js` for aircraft, and `src/settings.js` for pitch mapping and local daylight.
- Do not edit the generated `index.html` directly. Run `npm run build` and commit it with source changes; CI rejects a stale generated game.
- Preserve the self-contained, offline build, embedded dependency licenses, existing theme variables, and keyboard and touch controls.
- Keep dependency versions locked and run `npm ci`, `npm run check`, `npm test`, and `npm run build` before opening a pull request.
- Check phone portrait and landscape layouts when changing the interface. Deployments update the shared live site only after merging, not while a pull request is being reviewed.

The cloud agent's Node.js environment and dependencies are prepared by `.github/workflows/copilot-setup-steps.yml`.