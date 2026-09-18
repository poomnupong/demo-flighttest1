import * as THREE from 'three';
import { createIcons, Mountain, Camera, Aperture, VolumeX, Volume2, Pause, Play, Settings, Navigation, RotateCcw, X, Download, Maximize, Rocket, Plus, Minus } from 'lucide';
import { FlightModel, autopilotInput, terrainHeight, EXTENT, clamp } from './flight.js';
import { createWorld } from './world.js';
import { AIRCRAFT, getAircraft, createJet, disposeAircraft } from './aircraft.js';
import { SCENES, getScene } from './scenes.js';
import { pitchInput, localDayPeriod } from './settings.js';

function boot() {
  const element = (id) => document.getElementById(id);
  const styles = getComputedStyle(document.documentElement);
  const palette = (name) => styles.getPropertyValue(`--cp-${name}`).trim();
  const icons = { Mountain, Camera, Aperture, VolumeX, Volume2, Pause, Play, Settings, Navigation, RotateCcw, X, Download, Maximize, Rocket, Plus, Minus };
  const refreshIcons = () => createIcons({ icons, attrs: { 'stroke-width': 1.6 } });
  refreshIcons();
  const canvas = element('world');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.6));
  renderer.setSize(innerWidth, innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.03;
  const camera = new THREE.PerspectiveCamera(56, innerWidth / innerHeight, 0.15, 42000);
  let selectedScene = getScene();
  let selectedAircraft = getAircraft();
  let world = createWorld(palette, selectedScene.id);
  let aircraft = createJet(palette, selectedAircraft.id);
  world.scene.add(aircraft.jet);
  const flight = new FlightModel();
  const keys = new Set();
  const touch = { roll: 0, pitch: 0, boost: false, throttle: 0 };
  const view = { azimuth: 0.18, elevation: 0.25, distance: 49 };
  let cameraMode = 'chase';
  let autoPilot = true;
  let photoMode = false;
  let photoWasPaused = false;
  let photoPreviousCamera = 'chase';
  let settingsWasPaused = false;
  let sensitivity = 1;
  let invertY = true;
  let dayPeriod = 'day';
  let lightMinute = -1;
  let drag = null;
  let snapCamera = true;
  let toastUntil = 0;
  let hudAccumulator = 0;
  let frameCount = 0;
  let audioEnabled = false;
  let audioContext;
  let engineGain;
  let engineFilter;
  let engineTone;
  let bestScore = 0;
  const scoreKey = () => `fuji-flight-best-${selectedScene.id}`;
  const loadBestScore = () => {
    bestScore = 0;
    try { bestScore = Number(localStorage.getItem(scoreKey())) || 0; } catch { }
  };
  loadBestScore();
  const jetPosition = new THREE.Vector3();
  const previousPosition = new THREE.Vector3().copy(flight.body.position);
  const forward = new THREE.Vector3();
  const cameraOffset = new THREE.Vector3();
  const cameraTarget = new THREE.Vector3();
  const desiredCamera = new THREE.Vector3();
  const followRotation = new THREE.Quaternion();
  const projected = new THREE.Vector3();
  const landmarkPosition = new THREE.Vector3();
  const clock = new THREE.Clock();
  const timeString = (seconds) => `${Math.floor(seconds / 60).toString().padStart(2, '0')}:${Math.floor(seconds % 60).toString().padStart(2, '0')}`;
  const setIcon = (id, name) => {
    element(id).innerHTML = `<i data-lucide="${name}"></i>`;
    refreshIcons();
  };
  function notify(message) {
    element('toast').textContent = message;
    element('toast').classList.add('show');
    toastUntil = performance.now() + 3000;
  }
  function setAutopilot(enabled, announce = false) {
    autoPilot = enabled && !flight.freeFlight;
    element('assist-setting').checked = autoPilot;
    element('autopilot-button').setAttribute('aria-pressed', String(autoPilot));
    element('pilot-label').textContent = autoPilot ? 'AUTOPILOT ENGAGED' : 'MANUAL FLIGHT';
    if (announce) notify(autoPilot ? 'Autopilot engaged' : 'You have the controls');
  }
  function setCamera(mode) {
    cameraMode = mode;
    view.azimuth = mode === 'orbit' ? 0.7 : innerWidth < 700 ? 0 : 0.05;
    view.elevation = mode === 'orbit' ? 0.32 : 0.25;
    view.distance = selectedAircraft.cameraDistance * (mode === 'orbit' ? 1.2 : 1) * (innerWidth < 700 ? 1.5 : 1);
    camera.fov = innerWidth < 700 ? 64 : 56;
    camera.updateProjectionMatrix();
    snapCamera = true;
    element('camera-label').textContent = `${mode.toUpperCase()} CAMERA`;
    element('cockpit-frame').hidden = mode !== 'cockpit' || photoMode;
    element('reticle').hidden = mode === 'orbit';
    for (const button of document.querySelectorAll('[data-camera]')) button.setAttribute('aria-pressed', String(button.dataset.camera === mode));
  }
  function cycleCamera() {
    const modes = ['chase', 'cockpit', 'orbit'];
    setCamera(modes[(modes.indexOf(cameraMode) + 1) % modes.length]);
  }
  function clearInput() {
    keys.clear();
    stickPointer = null;
    touch.roll = touch.pitch = touch.throttle = 0;
    touch.boost = false;
    element('stick-knob').style.transform = '';
  }
  function pause(show = true) {
    if (flight.crashed || flight.completed) return;
    flight.paused = show;
    clearInput();
    element('pause-screen').hidden = !show;
    element('flight-ui').inert = show;
    element('pause-title').textContent = 'Flight paused';
    element('pause-eyebrow').textContent = `${selectedScene.name} / ${flight.freeFlight ? 'Free flight' : 'Circuit'}`;
    element('pause-detail').textContent = `${flight.freeFlight ? 'Free flight' : flight.route[Math.min(flight.gateIndex, 7)].name} / ${timeString(flight.elapsed)}`;
    element('resume-button').hidden = false;
    setIcon('pause-button', show ? 'play' : 'pause');
    if (show) element('resume-button').focus();
    else element('pause-button').focus({ preventScroll: true });
  }
  function restart(freeFlight = flight.freeFlight) {
    if (photoMode) togglePhoto();
    flight.reset();
    flight.freeFlight = freeFlight;
    clearInput();
    setAutopilot(!freeFlight);
    previousPosition.copy(flight.body.position);
    snapCamera = true;
    toastUntil = 0;
    element('toast').classList.remove('show');
    element('pause-screen').hidden = true;
    element('flight-ui').inert = false;
    element('resume-button').hidden = false;
    element('circuit-mode').setAttribute('aria-pressed', String(!freeFlight));
    element('free-mode').setAttribute('aria-pressed', String(freeFlight));
    element('route-title').textContent = `${selectedScene.name} / ${freeFlight ? 'Explore' : 'Circuit'}`;
    element('route-progress').hidden = freeFlight;
    element('gate-count').hidden = freeFlight;
    element('autopilot-button').hidden = freeFlight;
    element('assist-setting').disabled = freeFlight;
    setIcon('pause-button', 'pause');
    updateHUD();
  }
  function showResult(event) {
    clearInput();
    const completed = event === 'complete';
    element('pause-eyebrow').textContent = completed ? 'All eight waypoints cleared' : event === 'boundary' ? 'Flight area boundary' : 'Terrain contact';
    element('pause-title').textContent = completed ? 'Circuit complete' : 'Flight ended';
    element('pause-detail').textContent = `${flight.gateIndex} / 8 gates / ${timeString(flight.elapsed)} / ${flight.score.toLocaleString()} points`;
    element('resume-button').hidden = true;
    element('pause-screen').hidden = false;
    element('flight-ui').inert = true;
    element('restart-button').focus();
    if (completed && flight.score > bestScore) {
      bestScore = flight.score;
      try { localStorage.setItem(scoreKey(), String(bestScore)); } catch { }
    }
  }
  function openSettings() {
    if (photoMode) return;
    settingsWasPaused = flight.paused;
    flight.paused = true;
    clearInput();
    element('throttle-setting').value = Math.round(flight.throttle * 100);
    element('throttle-output').value = `${Math.round(flight.throttle * 100)}%`;
    element('settings').showModal();
  }
  function closeSettings() {
    element('settings').close();
    flight.paused = settingsWasPaused;
    clock.getDelta();
  }
  function togglePhoto() {
    if (!photoMode) {
      photoWasPaused = flight.paused;
      photoPreviousCamera = cameraMode;
      flight.paused = true;
      photoMode = true;
      setCamera('orbit');
    } else {
      photoMode = false;
      flight.paused = photoWasPaused;
      setCamera(photoPreviousCamera);
    }
    clearInput();
    element('flight-ui').hidden = photoMode;
    element('photo-bar').hidden = !photoMode;
    element('pause-screen').hidden = photoMode || !flight.paused;
    element('flight-ui').inert = !photoMode && flight.paused;
  }
  async function setAudio(enabled) {
    try {
      if (enabled && !audioContext) {
        audioContext = new AudioContext();
        const buffer = audioContext.createBuffer(1, audioContext.sampleRate * 3, audioContext.sampleRate);
        const samples = buffer.getChannelData(0);
        for (let index = 0; index < samples.length; index++) samples[index] = (Math.random() * 2 - 1) * 0.65;
        const noise = audioContext.createBufferSource();
        noise.buffer = buffer;
        noise.loop = true;
        engineFilter = audioContext.createBiquadFilter();
        engineFilter.type = 'lowpass';
        engineFilter.frequency.value = 650;
        engineGain = audioContext.createGain();
        engineGain.gain.value = 0;
        noise.connect(engineFilter).connect(engineGain).connect(audioContext.destination);
        noise.start();
        engineTone = audioContext.createOscillator();
        engineTone.type = 'sawtooth';
        engineTone.frequency.value = 48;
        const toneGain = audioContext.createGain();
        toneGain.gain.value = 0.08;
        engineTone.connect(toneGain).connect(engineFilter);
        engineTone.start();
      }
      if (enabled) await audioContext.resume();
      audioEnabled = enabled;
      element('sound-setting').checked = enabled;
      element('audio-button').setAttribute('aria-pressed', String(enabled));
      element('audio-button').setAttribute('aria-label', enabled ? 'Mute engine sound' : 'Enable engine sound');
      setIcon('audio-button', enabled ? 'volume-2' : 'volume-x');
      if (!enabled && engineGain) engineGain.gain.setTargetAtTime(0, audioContext.currentTime, 0.15);
    } catch {
      notify('Audio is unavailable in this browser');
      audioEnabled = false;
      element('sound-setting').checked = false;
    }
  }
  function chime() {
    if (!audioEnabled || !audioContext) return;
    const tone = audioContext.createOscillator();
    const gain = audioContext.createGain();
    tone.type = 'sine';
    tone.frequency.setValueAtTime(660, audioContext.currentTime);
    tone.frequency.setValueAtTime(990, audioContext.currentTime + 0.1);
    gain.gain.setValueAtTime(0.06, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.5);
    tone.connect(gain).connect(audioContext.destination);
    tone.start();
    tone.stop(audioContext.currentTime + 0.5);
    tone.onended = () => { tone.disconnect(); gain.disconnect(); };
  }
  const map = element('minimap');
  const mapContext = map.getContext('2d');
  const mapBase = document.createElement('canvas');
  mapBase.width = map.width;
  mapBase.height = map.height;
  const baseContext = mapBase.getContext('2d');
  let mapBounds = [-EXTENT, -EXTENT, EXTENT, EXTENT];
  const mapPoint = (point) => ({
    x: (point.x - mapBounds[0]) / (mapBounds[2] - mapBounds[0]) * map.width,
    y: (point.z - mapBounds[1]) / (mapBounds[3] - mapBounds[1]) * map.height,
  });
  function rebuildMap(expandedBounds) {
    mapBounds = expandedBounds || selectedScene.mapBounds || [-EXTENT, -EXTENT, EXTENT, EXTENT];
    for (let column = 0; column < map.width; column += 4) {
      for (let row = 0; row < map.height; row += 4) {
        const height = terrainHeight(mapBounds[0] + column / map.width * (mapBounds[2] - mapBounds[0]),
          mapBounds[1] + row / map.height * (mapBounds[3] - mapBounds[1]), selectedScene.id);
        baseContext.fillStyle = palette(height < 38 ? 'water' : selectedScene.id === 'yokohama' ? 'urban'
          : height > 2200 ? 'snow' : height > 1400 ? 'rock-light' : height > 700 ? 'grass-dark' : 'grass');
        baseContext.fillRect(column, row, 4, 4);
      }
    }
  }
  function drawMap() {
    if (selectedScene.mapBounds) {
      const { x, z } = flight.body.position;
      if (x < mapBounds[0] || x > mapBounds[2] || z < mapBounds[1] || z > mapBounds[3]) {
        rebuildMap([Math.min(mapBounds[0], x - 500), Math.min(mapBounds[1], z - 500),
          Math.max(mapBounds[2], x + 500), Math.max(mapBounds[3], z + 500)]);
      }
    }
    mapContext.drawImage(mapBase, 0, 0);
    if (!flight.freeFlight) {
      mapContext.beginPath();
      for (const [index, gate] of flight.route.entries()) {
        const point = mapPoint(gate);
        if (index === 0) mapContext.moveTo(point.x, point.y);
        else mapContext.lineTo(point.x, point.y);
      }
      mapContext.strokeStyle = palette('snow');
      mapContext.globalAlpha = 0.65;
      mapContext.lineWidth = 1.6;
      mapContext.setLineDash([5, 5]);
      mapContext.stroke();
      mapContext.setLineDash([]);
      mapContext.globalAlpha = 1;
      for (const [index, gate] of flight.route.entries()) {
        const point = mapPoint(gate);
        mapContext.beginPath();
        mapContext.arc(point.x, point.y, index === flight.gateIndex ? 5 : 3, 0, Math.PI * 2);
        mapContext.fillStyle = palette(index === flight.gateIndex ? 'gate' : index < flight.gateIndex ? 'ink-dark' : 'snow');
        mapContext.fill();
      }
    }
    const point = mapPoint(flight.body.position);
    mapContext.save();
    mapContext.translate(point.x, point.y);
    mapContext.rotate(-flight.heading);
    mapContext.beginPath();
    mapContext.moveTo(0, -11); mapContext.lineTo(7, 9); mapContext.lineTo(0, 5); mapContext.lineTo(-7, 9); mapContext.closePath();
    mapContext.fillStyle = palette('ink-light');
    mapContext.strokeStyle = palette('ink-dark');
    mapContext.lineWidth = 1.7;
    mapContext.fill(); mapContext.stroke(); mapContext.restore();
  }
  const ticks = [];
  for (let tick = 0; tick < 9; tick++) {
    const label = document.createElement('span');
    label.className = 'compass-tick mono';
    element('compass-ticks').append(label);
    ticks.push(label);
  }
  function updateHUD() {
    element('speed').textContent = Math.round(flight.speed * 1.94384);
    element('altitude').textContent = Math.round(flight.body.position.y).toLocaleString('en-US');
    element('mach').textContent = `M ${(flight.speed / 340).toFixed(2)}`;
    const verticalSpeed = Math.round(flight.body.velocity.y);
    element('vertical-speed').textContent = `V/S ${verticalSpeed >= 0 ? '+' : ''}${verticalSpeed} m/s`;
    element('throttle').textContent = Math.round(flight.throttle * 100);
    element('throttle-fill').style.width = `${flight.throttle * 100}%`;
    element('engine-status').textContent = flight.boosting ? 'AFTERBURNER' : flight.throttle < 0.15 ? 'IDLE' : selectedAircraft.supportsAfterburner ? 'MIL POWER' : 'CRUISE POWER';
    const heading = ((-flight.heading * 180 / Math.PI) % 360 + 360) % 360;
    element('heading').textContent = (Math.round(heading) % 360).toString().padStart(3, '0');
    element('cardinal').textContent = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round(heading / 45) % 8];
    const centerTick = Math.floor(heading / 30) * 30;
    ticks.forEach((tick, index) => {
      const degrees = ((centerTick + (index - 4) * 30) % 360 + 360) % 360;
      tick.textContent = degrees % 90 === 0 ? ['N', 'E', 'S', 'W'][degrees / 90] : String(degrees).padStart(3, '0');
    });
    element('compass-ticks').style.transform = `translateX(${-207 - (heading - centerTick) / 30 * 46}px)`;
    element('elapsed').textContent = timeString(flight.elapsed);
    element('flight-status').textContent = flight.crashed ? 'FLIGHT ENDED' : flight.completed ? 'COMPLETE' : flight.paused ? 'PAUSED' : 'IN FLIGHT';
    element('best-score').textContent = bestScore ? `PERSONAL BEST / ${bestScore.toLocaleString()} PTS` : `CIRCUIT / ${flight.score.toLocaleString()} PTS`;
    const gate = flight.route[Math.min(flight.gateIndex, 7)];
    const distance = Math.hypot(gate.x - flight.body.position.x, gate.y - flight.body.position.y, gate.z - flight.body.position.z);
    element('gate-count').textContent = `${String(Math.min(flight.gateIndex + 1, 8)).padStart(2, '0')} / 08`;
    element('route-name').textContent = flight.freeFlight ? selectedScene.name : gate.name;
    element('route-detail').textContent = flight.freeFlight ? `${timeString(flight.elapsed)} / ${Math.round(flight.clearance).toLocaleString()} m AGL` : `${(distance / 1000).toFixed(1)} km / ${gate.y.toLocaleString()} m ASL`;
    for (const [index, bar] of [...element('route-progress').children].entries()) bar.className = index < flight.gateIndex ? 'done' : index === flight.gateIndex ? 'active' : '';
    element('gate-distance').textContent = `${(distance / 1000).toFixed(1)} km`;
    element('gate-label').querySelector('.gate-number').textContent = String(Math.min(flight.gateIndex + 1, 8)).padStart(2, '0');
    const terrainRisk = flight.clearance < 180 || (flight.body.velocity.y < -20 && flight.clearance / -flight.body.velocity.y < 6);
    const boundaryRisk = Math.max(Math.abs(flight.body.position.x), Math.abs(flight.body.position.z)) > 10800;
    element('warning').hidden = (!terrainRisk && flight.speed > 100 && !boundaryRisk) || flight.paused || flight.crashed || flight.completed;
    element('warning').textContent = boundaryRisk ? 'FLIGHT AREA / TURN BACK' : terrainRisk ? 'TERRAIN / PULL UP' : 'LOW AIRSPEED';
    drawMap();
  }
  function placeLabels() {
    projected.copy(landmarkPosition).project(camera);
    const landmarkX = (projected.x + 1) * innerWidth / 2;
    const landmarkY = (-projected.y + 1) * innerHeight / 2;
    element('landmark').hidden = projected.z > 1 || landmarkX < (innerWidth < 700 ? 190 : 255) || landmarkX > innerWidth - 140 || landmarkY < 110 || landmarkY > innerHeight - 180;
    element('landmark').style.left = `${landmarkX}px`;
    element('landmark').style.top = `${landmarkY}px`;
    const gate = flight.route[Math.min(flight.gateIndex, 7)];
    projected.set(gate.x, gate.y, gate.z).project(camera);
    const visible = projected.z < 1 && Math.abs(projected.x) < 0.85 && Math.abs(projected.y) < 0.7;
    element('gate-label').hidden = !visible || flight.freeFlight || flight.completed;
    element('next-bearing').hidden = visible || flight.freeFlight || flight.completed;
    element('gate-label').style.left = `${(projected.x + 1) * innerWidth / 2}px`;
    element('gate-label').style.top = `${(-projected.y + 1) * innerHeight / 2}px`;
    if (!visible) {
      const bearing = Math.atan2(-(gate.x - flight.body.position.x), -(gate.z - flight.body.position.z)) - flight.heading;
      element('next-bearing').style.left = `${50 - Math.sin(bearing) * 28}%`;
      element('next-bearing').style.transform = `translate(-50%, -50%) rotate(${-bearing * 180 / Math.PI - 45}deg)`;
    }
  }
  const flightCodes = new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyQ', 'KeyE', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);
  const trackedCodes = new Set([...flightCodes, 'ShiftLeft', 'ShiftRight', 'Equal', 'Minus', 'BracketLeft', 'BracketRight', 'KeyJ', 'KeyL', 'KeyI', 'KeyK']);
  addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey || /INPUT|SELECT|TEXTAREA/.test(event.target.tagName) || element('settings').open) return;
    if (trackedCodes.has(event.code)) {
      event.preventDefault(); keys.add(event.code);
      if (flightCodes.has(event.code) && !flight.paused && autoPilot) setAutopilot(false, true);
    }
    if (event.repeat) return;
    if (event.code === 'KeyC') { event.preventDefault(); cycleCamera(); }
    if (event.code === 'KeyP' || event.code === 'Escape') {
      event.preventDefault();
      if (photoMode) togglePhoto(); else pause(!flight.paused);
    }
    if (event.code === 'KeyR') { event.preventDefault(); restart(); }
    if (event.code === 'KeyG') { event.preventDefault(); setAutopilot(!autoPilot, true); }
    if (event.code === 'KeyO' && !flight.crashed && !flight.completed) { event.preventDefault(); togglePhoto(); }
    if (event.code === 'KeyM') { event.preventDefault(); setAudio(!audioEnabled); }
  });
  addEventListener('keyup', (event) => keys.delete(event.code));
  addEventListener('blur', clearInput);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !flight.paused && !flight.crashed && !flight.completed) pause(true);
  });
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());
  canvas.addEventListener('pointerdown', (event) => {
    drag = { x: event.clientX, y: event.clientY, id: event.pointerId };
    canvas.setPointerCapture(event.pointerId); canvas.style.cursor = 'grabbing';
  });
  canvas.addEventListener('pointermove', (event) => {
    if (!drag || drag.id !== event.pointerId) return;
    view.azimuth -= (event.clientX - drag.x) * 0.006;
    view.elevation = clamp(view.elevation + (event.clientY - drag.y) * 0.004, -0.45, 1.3);
    drag.x = event.clientX; drag.y = event.clientY;
  });
  const releaseCamera = () => { drag = null; canvas.style.cursor = 'grab'; };
  canvas.addEventListener('pointerup', releaseCamera);
  canvas.addEventListener('pointercancel', releaseCamera);
  canvas.addEventListener('lostpointercapture', releaseCamera);
  canvas.addEventListener('wheel', (event) => {
    event.preventDefault();
    if (cameraMode === 'cockpit') { camera.fov = clamp(camera.fov + event.deltaY * 0.025, 38, 90); camera.updateProjectionMatrix(); }
    else view.distance = clamp(view.distance * Math.exp(event.deltaY * 0.001), selectedAircraft.cameraDistance * 0.6, selectedAircraft.cameraDistance * 5);
  }, { passive: false });
  const stick = element('stick');
  let stickPointer = null;
  function moveStick(event) {
    if (event.pointerId !== stickPointer) return;
    const bounds = stick.getBoundingClientRect();
    const offsetX = clamp((event.clientX - bounds.left - bounds.width / 2) / 38, -1, 1);
    const offsetY = clamp((event.clientY - bounds.top - bounds.height / 2) / 38, -1, 1);
    touch.roll = -offsetX; touch.pitch = -offsetY;
    element('stick-knob').style.transform = `translate(${offsetX * 30}px, ${offsetY * 30}px)`;
  }
  stick.addEventListener('pointerdown', (event) => {
    if (stickPointer !== null || flight.paused || flight.crashed || flight.completed) return;
    stickPointer = event.pointerId; stick.setPointerCapture(event.pointerId); setAutopilot(false); moveStick(event);
  });
  stick.addEventListener('pointermove', moveStick);
  const releaseStick = (event) => {
    if (event.pointerId !== stickPointer) return;
    stickPointer = null; touch.roll = touch.pitch = 0; element('stick-knob').style.transform = '';
  };
  stick.addEventListener('pointerup', releaseStick);
  stick.addEventListener('pointercancel', releaseStick);
  stick.addEventListener('lostpointercapture', releaseStick);
  for (const [id, field, value] of [['touch-boost', 'boost', true], ['touch-throttle-up', 'throttle', 1], ['touch-throttle-down', 'throttle', -1]]) {
    const button = element(id);
    button.addEventListener('pointerdown', (event) => { button.setPointerCapture(event.pointerId); touch[field] = value; });
    const release = () => { touch[field] = field === 'boost' ? false : 0; };
    button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
  }
  element('camera-button').onclick = cycleCamera;
  element('camera-caption').onclick = cycleCamera;
  element('pause-button').onclick = () => pause(!flight.paused);
  element('resume-button').onclick = () => pause(false);
  element('restart-button').onclick = () => restart();
  element('circuit-mode').onclick = () => restart(false);
  element('free-mode').onclick = () => restart(true);
  element('autopilot-button').onclick = () => setAutopilot(!autoPilot, true);
  element('assist-setting').onchange = (event) => setAutopilot(event.target.checked);
  element('settings-button').onclick = openSettings;
  element('close-settings').onclick = closeSettings;
  element('settings').addEventListener('cancel', (event) => { event.preventDefault(); closeSettings(); });
  element('photo-button').onclick = togglePhoto;
  element('close-photo').onclick = togglePhoto;
  element('settings-photo').onclick = () => { closeSettings(); togglePhoto(); };
  element('audio-button').onclick = () => setAudio(!audioEnabled);
  element('sound-setting').onchange = (event) => setAudio(event.target.checked);
  element('throttle-setting').oninput = (event) => { flight.throttle = Number(event.target.value) / 100; element('throttle-output').value = `${event.target.value}%`; updateHUD(); };
  element('sensitivity').oninput = (event) => { sensitivity = Number(event.target.value); element('sensitivity-output').value = `${sensitivity.toFixed(1)}x`; };
  element('invert-setting').onchange = (event) => {
    invertY = event.target.checked;
    element('pitch-help').textContent = invertY
      ? 'W / ↑ or stick forward: nose down. S / ↓ or pull back: nose up.'
      : 'W / ↑ or stick forward: nose up. S / ↓ or pull back: nose down.';
  };
  for (const [id, options] of [['aircraft-setting', AIRCRAFT], ['scene-setting', SCENES]]) {
    for (const option of options) element(id).add(new Option(option.name, option.id));
  }
  element('aircraft-setting').value = selectedAircraft.id;
  element('scene-setting').value = selectedScene.id;
  function updateSelectionLabels() {
    canvas.setAttribute('aria-label', `3D flight over ${selectedScene.name}`);
    element('aircraft-label').textContent = selectedAircraft.name;
    element('scene-label').textContent = selectedScene.name.toUpperCase();
    element('photo-label').textContent = `${selectedScene.name.toUpperCase()} / PHOTO`;
    element('selection-label').textContent = `${selectedAircraft.name} / ${selectedScene.name}`;
    element('location-name').textContent = `${selectedScene.name}, Japan`;
    element('location-coordinates').textContent = `${selectedScene.latitude.toFixed(4)}° N  ${selectedScene.longitude.toFixed(4)}° E`;
    element('map-attribution').hidden = selectedScene.id !== 'yokohama';
    element('geography-note').hidden = selectedScene.id !== 'yokohama';
    element('map-snapshot-date').textContent = selectedScene.mapSnapshot || '';
    element('landmark').querySelector('strong').textContent = selectedScene.landmark.name.toUpperCase();
    element('landmark').querySelector('small').textContent = `${selectedScene.landmark.height.toLocaleString()} M / JAPAN`;
    const { x, z, altitude } = selectedScene.landmark;
    landmarkPosition.set(x, altitude, z);
    element('touch-boost').disabled = !selectedAircraft.supportsAfterburner;
    element('touch-boost').title = selectedAircraft.supportsAfterburner ? 'Afterburner' : 'No afterburner on the 787';
  }
  element('aircraft-setting').onchange = (event) => {
    const next = AIRCRAFT.find((option) => option.id === event.target.value);
    if (!next || next === selectedAircraft) return;
    const replacement = createJet(palette, next.id);
    world.scene.remove(aircraft.jet);
    disposeAircraft(aircraft);
    aircraft = replacement;
    selectedAircraft = next;
    world.scene.add(aircraft.jet);
    clearInput();
    flight.boosting = false;
    setCamera(cameraMode);
    updateSelectionLabels();
    updateHUD();
  };
  element('scene-setting').onchange = (event) => {
    const next = getScene(event.target.value);
    if (next.id === selectedScene.id) return;
    const replacement = createWorld(palette, next.id);
    world.scene.remove(aircraft.jet);
    world.dispose();
    world = replacement;
    selectedScene = next;
    world.scene.add(aircraft.jet);
    const freeFlight = flight.freeFlight;
    flight.setScene(next.id);
    loadBestScore();
    rebuildMap();
    updateSelectionLabels();
    restart(freeFlight);
    if (settingsWasPaused) pause(true);
    // The settings dialog remains modal while the new flight is prepared.
    flight.paused = true;
    element('throttle-setting').value = Math.round(flight.throttle * 100);
    element('throttle-output').value = `${Math.round(flight.throttle * 100)}%`;
    applyLighting();
  };
  element('camera-options').onclick = (event) => { const button = event.target.closest('[data-camera]'); if (button) setCamera(button.dataset.camera); };
  element('quality-setting').onchange = (event) => {
    const ratios = { low: 1, balanced: 1.6, high: 2.2 };
    renderer.setPixelRatio(Math.min(devicePixelRatio, ratios[event.target.value])); renderer.setSize(innerWidth, innerHeight);
  };
  function applyLighting() {
    const now = new Date();
    lightMinute = Math.floor(now.getTime() / 60000);
    dayPeriod = element('day-setting').value === 'auto'
      ? localDayPeriod(now, selectedScene.latitude, selectedScene.longitude) : element('day-setting').value;
    const night = dayPeriod === 'night';
    const setting = element('light-setting').value;
    const warm = setting === 'golden';
    world.sky.material.uniforms.zenith.value.set(palette(night ? 'night-top' : 'sky-top')).lerp(new THREE.Color(palette('sky-horizon')), !night && warm ? 0.24 : 0);
    world.sky.material.uniforms.horizon.value.set(palette(night ? 'night-horizon' : warm ? 'blossom-light' : setting === 'noon' ? 'snow-shadow' : 'sky-horizon'));
    world.sky.material.uniforms.daylight.value = night ? 0 : 1;
    world.scene.fog.color.copy(world.sky.material.uniforms.horizon.value);
    world.sun.color.set(palette(night ? 'moon' : warm ? 'sky-horizon' : 'sun'));
    world.sky.material.uniforms.sunlight.value.copy(world.sun.color);
    world.sun.intensity = night ? 0.35 : warm ? 3.6 : setting === 'noon' ? 3.5 : 3.1;
    world.hemisphere.intensity = night ? 0.65 : 1.85;
    world.hemisphere.color.set(palette(night ? 'night-horizon' : 'snow'));
    world.stars.visible = world.moon.visible = night;
    element('light-setting').disabled = night;
    renderer.toneMappingExposure = night ? 0.85 : warm ? 1.1 : 1.03;
    element('local-time').textContent = `${now.toLocaleTimeString('en-GB', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })} JST / ${dayPeriod.toUpperCase()}`;
  }
  element('light-setting').onchange = applyLighting;
  element('day-setting').onchange = applyLighting;
  element('fullscreen-button').onclick = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
      else notify('Fullscreen is unavailable in this browser');
    } catch { notify('Fullscreen is unavailable in this browser'); }
  };
  element('save-photo').onclick = () => {
    renderer.render(world.scene, camera);
    let photo = canvas;
    if (selectedScene.id === 'yokohama') {
      photo = document.createElement('canvas');
      photo.width = canvas.width; photo.height = canvas.height;
      const context = photo.getContext('2d');
      if (!context) { notify('Photo export is unavailable in this browser'); return; }
      context.drawImage(canvas, 0, 0);
      const size = Math.max(12, Math.round(photo.width / 100));
      context.fillStyle = palette('surface');
      context.fillRect(0, photo.height - size * 3, photo.width, size * 3);
      context.fillStyle = palette('text');
      context.font = `${size}px sans-serif`;
      context.fillText('© OpenStreetMap contributors · ODbL', size, photo.height - size * 1.6);
      context.fillText('openstreetmap.org/copyright', size, photo.height - size * 0.4);
    }
    const link = document.createElement('a');
    link.href = photo.toDataURL('image/png');
    link.download = 'fuji-flight.png';
    document.body.append(link);
    link.click();
    link.remove();
  };
  canvas.addEventListener('webglcontextlost', (event) => {
    event.preventDefault(); flight.paused = true;
    element('loading').hidden = false;
    element('loading').querySelector('h1').textContent = 'Graphics interrupted';
    element('loading').querySelector('p').textContent = 'Reload the page to restore the flight.';
  });
  addEventListener('resize', () => {
    clearInput();
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
    setCamera(cameraMode);
  });
  function updateCamera(delta) {
    view.azimuth += ((keys.has('KeyJ') ? 1 : 0) - (keys.has('KeyL') ? 1 : 0)) * delta * 1.2;
    view.elevation = clamp(view.elevation + ((keys.has('KeyI') ? 1 : 0) - (keys.has('KeyK') ? 1 : 0)) * delta * 0.8, -0.45, 1.3);
    forward.set(0, 0, -1).applyQuaternion(aircraft.jet.quaternion);
    camera.position.add(jetPosition).sub(previousPosition);
    if (cameraMode === 'cockpit') {
      cameraOffset.set(...selectedAircraft.cockpitOffset).applyQuaternion(aircraft.jet.quaternion);
      camera.position.copy(jetPosition).add(cameraOffset);
      const lookRotation = new THREE.Quaternion().setFromEuler(new THREE.Euler(-view.elevation + 0.25, -view.azimuth + (innerWidth < 700 ? 0 : 0.05), 0, 'YXZ'));
      cameraTarget.set(0, 0, -100).applyQuaternion(lookRotation).applyQuaternion(aircraft.jet.quaternion).add(camera.position);
      camera.up.set(0, 1, 0).applyQuaternion(aircraft.jet.quaternion);
    } else {
      followRotation.setFromEuler(new THREE.Euler(flight.pitch * 0.65, flight.heading, 0, 'YXZ'));
      cameraOffset.set(Math.sin(view.azimuth) * Math.cos(view.elevation) * view.distance, Math.sin(view.elevation) * view.distance, Math.cos(view.azimuth) * Math.cos(view.elevation) * view.distance).applyQuaternion(followRotation);
      desiredCamera.copy(jetPosition).add(cameraOffset);
      if (snapCamera) camera.position.copy(desiredCamera);
      else camera.position.lerp(desiredCamera, 1 - Math.exp(-delta * 6));
      const lookAhead = cameraMode === 'chase' ? 40 * Math.pow(Math.max(0, Math.cos(view.azimuth)), 4) : 0;
      cameraTarget.copy(jetPosition).addScaledVector(forward, lookAhead).add(new THREE.Vector3(0, cameraMode === 'chase' ? 9 : 1.5, 0));
      camera.up.set(0, 1, 0);
    }
    camera.lookAt(cameraTarget); camera.updateMatrixWorld(); previousPosition.copy(jetPosition); snapCamera = false;
  }
  function frame() {
    requestAnimationFrame(frame);
    const delta = Math.min(clock.getDelta(), 0.05);
    const manual = {
      pitch: pitchInput(keys, touch.pitch, sensitivity, invertY),
      roll: ((keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) - (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) + touch.roll) * sensitivity,
      yaw: ((keys.has('KeyQ') ? 1 : 0) - (keys.has('KeyE') ? 1 : 0)) * sensitivity,
      throttle: (keys.has('Equal') || keys.has('BracketRight') ? 1 : 0) - (keys.has('Minus') || keys.has('BracketLeft') ? 1 : 0) + touch.throttle,
      boost: selectedAircraft.supportsAfterburner && (keys.has('ShiftLeft') || keys.has('ShiftRight') || touch.boost),
    };
    flight.update(delta, autoPilot ? { ...manual, ...autopilotInput(flight) } : manual);
    if (flight.event === 'gate') { notify(`Checkpoint ${String(flight.gateIndex).padStart(2, '0')} / +${(1000 + Math.round(flight.speed)).toLocaleString()} points`); chime(); }
    if (['complete', 'crash', 'boundary'].includes(flight.event)) { showResult(flight.event); if (flight.completed) chime(); }
    jetPosition.copy(flight.body.position);
    aircraft.jet.position.copy(jetPosition); aircraft.jet.quaternion.copy(flight.body.quaternion);
    aircraft.jet.visible = cameraMode !== 'cockpit';
    if (selectedAircraft.supportsAfterburner) {
      aircraft.flame.scale.set(1, 1, (flight.boosting ? 1.9 : 0.42) * (0.94 + Math.sin(flight.elapsed * 43) * 0.06));
      aircraft.flame.material.opacity = flight.boosting ? 0.72 : 0.2;
      aircraft.exhaustDisk.material.color.set(palette(flight.boosting ? 'sun' : 'exhaust'));
    }
    for (const [index, gate] of world.gates.entries()) {
      gate.visible = !flight.freeFlight && index >= flight.gateIndex && index <= flight.gateIndex + 1;
      gate.children[0].material.emissiveIntensity = index === flight.gateIndex ? 0.36 + Math.sin(flight.elapsed * 2) * 0.1 : 0;
    }
    world.sky.position.copy(jetPosition);
    world.glints.material.opacity = (dayPeriod === 'night' ? 0.08 : 0.4) + Math.sin(flight.elapsed * 0.6) * 0.05;
    world.clouds.position.x = Math.sin(flight.elapsed * 0.004) * 300;
    if (Math.floor(Date.now() / 60000) !== lightMinute) applyLighting();
    updateCamera(delta);
    renderer.render(world.scene, camera);
    if (!photoMode) placeLabels();
    hudAccumulator += delta;
    if (hudAccumulator > 0.1) { updateHUD(); hudAccumulator = 0; }
    if (performance.now() > toastUntil) element('toast').classList.remove('show');
    if (engineGain && audioEnabled) {
      engineGain.gain.setTargetAtTime(flight.paused || flight.crashed || flight.completed ? 0 : 0.12 + flight.throttle * 0.12 + (flight.boosting ? 0.1 : 0), audioContext.currentTime, 0.2);
      engineFilter.frequency.setTargetAtTime(350 + flight.throttle * 900 + (flight.boosting ? 600 : 0), audioContext.currentTime, 0.2);
      engineTone.frequency.setTargetAtTime(35 + flight.speed * 0.18, audioContext.currentTime, 0.2);
    }
    frameCount++;
  }
  window.fujiFlight = Object.freeze({
    getState: () => ({
      ready: true, frames: frameCount,
      position: { x: flight.body.position.x, y: flight.body.position.y, z: flight.body.position.z },
      speed: flight.speed, pitch: flight.pitch, bank: flight.bank, heading: flight.heading,
      throttle: flight.throttle, gateIndex: flight.gateIndex, score: flight.score, elapsed: flight.elapsed,
      paused: flight.paused, crashed: flight.crashed, completed: flight.completed, boosting: flight.boosting,
      camera: cameraMode, view: { ...view }, autopilot: autoPilot, photoMode, freeFlight: flight.freeFlight,
      audio: audioEnabled, terrainBlocks: world.terrain.count,
      aircraft: selectedAircraft.id, scene: selectedScene.id, invertY, dayPeriod,
      triangles: renderer.info.render.triangles, drawCalls: renderer.info.render.calls,
    })
  });
  rebuildMap(); updateSelectionLabels(); applyLighting();
  setCamera('chase'); updateHUD(); element('loading').hidden = true; canvas.style.cursor = 'grab'; frame();
}

try { boot(); }
catch (error) {
  console.error(error);
  document.querySelector('#loading h1').textContent = 'Unable to start the flight';
  document.querySelector('#loading p').textContent = 'A browser with WebGL 2 support is required.';
  document.querySelector('#loading').hidden = false;
}