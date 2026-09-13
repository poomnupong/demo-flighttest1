# Fuji Flight

**[Play in your browser](https://poomnupong.github.io/demo-flighttest1/)** | [Source on GitHub](https://github.com/poomnupong/demo-flighttest1)

The repository is named **demo-flighttest1**; the game is called **Fuji Flight**. Open the play link in Safari on iPhone or a current Android browser. Touch controls support portrait and landscape. A modern device with WebGL 2 is required; use the lower render-quality setting if performance is slow.

Open **[index.html](index.html)** in a current browser with WebGL 2 support. The game is one self-contained HTML file: all code, libraries, geometry, colors, icons, and synthesized audio are embedded. No server, network connection, installation, or external assets are needed to play.

A stylized flight around Mount Fuji, with terraced voxel terrain, a snow-capped volcano, a turquoise lake, forests, cherry trees, villages, a pagoda, and a lakeside torii. The custom aircraft is inspired by the F-35A, with swept wings, twin canted tails, a faceted canopy, and an animated afterburner.

## Controls

The circuit starts airborne with autopilot engaged. Any pitch, roll, or yaw input switches to manual flight. Hover over a tool button for its name and shortcut.

| Input | Action |
| --- | --- |
| W / Up arrow | Pitch up |
| S / Down arrow | Pitch down |
| A / D or Left / Right arrows | Bank left / right |
| Q / E | Yaw left / right |
| + / - or ] / [ | Increase / decrease throttle |
| Hold Shift | Afterburner |
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

On narrow screens, the virtual flight stick controls pitch and bank. The rocket button activates the afterburner; the plus/minus buttons change throttle. Drag elsewhere to move the camera. Settings include camera mode, throttle, sensitivity, autopilot, sound, three lighting conditions, render quality, photo mode, and fullscreen.

## Flight Modes

- **Circuit:** clear eight gates around Fuji. Points are awarded for each gate and for completing the course. Your best score is stored locally when browser storage is available.
- **Free flight:** explore without checkpoints or scoring.
- **Photo mode:** freezes the flight, removes the instruments, and allows camera positioning. The download icon exports the scene as a PNG. Embedded browser viewers may restrict downloads; use a regular browser in that case.

Terrain contact or leaving the bounded flight area ends the flight, with an immediate restart option. Switching tabs pauses the flight. Sound is off until explicitly enabled.

This is an **arcade flight game**, not an aircraft training simulator. The aircraft, terrain, elevations, and landmarks are artistic approximations, not an engineering model or georeferenced map. The displayed 3,776 m summit label identifies the real mountain; the playable terrain uses a compressed scale. Cockpit mode is a forward pilot view, not a replica instrument panel.

## Development

Requires Node.js 22 or newer for rebuilding only.

```sh
npm ci
npm run check
npm test
npm run build
```

The generated [index.html](index.html) is the only file needed for distribution. The esbuild bundler is [scripts/build.mjs](scripts/build.mjs). Three.js handles rendering, cannon-es handles fixed-step rigid-body integration, and Lucide provides interface icons. Dependency license notices are embedded in the generated HTML.

Tests cover level flight, steering, throttle and afterburner, pause/reset, terrain and boundary contact, swept gate crossing, course clearance, full autopilot completion, and frame-rate independence at 30/60/120 FPS.

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

- Edit `src/template.html` for the interface and styles, `src/game.js` for input/rendering, `src/flight.js` for flight rules, and `src/world.js` for the scenery and aircraft.
- Do not edit the generated `index.html` directly. Run `npm run build` and commit it with source changes; CI rejects a stale generated game.
- Preserve the self-contained, offline build, embedded dependency licenses, existing theme variables, and keyboard and touch controls.
- Keep dependency versions locked and run `npm ci`, `npm run check`, `npm test`, and `npm run build` before opening a pull request.
- Check phone portrait and landscape layouts when changing the interface. Deployments update the shared live site only after merging, not while a pull request is being reviewed.

The cloud agent's Node.js environment and dependencies are prepared by `.github/workflows/copilot-setup-steps.yml`.