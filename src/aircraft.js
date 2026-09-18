import * as THREE from 'three';

// Metre-scale length/span: USAF F-35A and F-22 fact sheets; JAL 787-8 aircraft guide,
// doubled (x2) from the real-world reference figures to make the in-game aircraft larger.
// https://www.af.mil/About-Us/Fact-Sheets/Display/Article/478441/f-35a-lightning-ii/
// https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/
// https://www.jal.co.jp/en/aircraft/conf/787.html
export const AIRCRAFT = [
  { id: 'f35', name: 'F-35A Lightning II', cameraDistance: 90, cockpitOffset: [0, 3.8, -8.4], supportsAfterburner: true },
  { id: 'f22', name: 'F-22 Raptor', cameraDistance: 104, cockpitOffset: [0, 4, -10.4], supportsAfterburner: true },
  { id: 'b787', name: 'Boeing 787-8 · Japan Airlines inspired', cameraDistance: 290, cockpitOffset: [0, 4.2, -48], supportsAfterburner: false },
];
export const DEFAULT_AIRCRAFT = 'f22';

export function getAircraft(id = DEFAULT_AIRCRAFT) {
  const aircraft = AIRCRAFT.find((entry) => entry.id === id);
  if (!aircraft) throw new RangeError(`Unknown aircraft: ${id}`);
  return aircraft;
}

// 8-bit (256-color) palette quantization: RGB332 (3 red bits, 3 green bits, 2 blue bits),
// giving the blocky aircraft a retro, limited-palette look.
const QUANTIZE_RED_BITS = 3;
const QUANTIZE_GREEN_BITS = 3;
const QUANTIZE_BLUE_BITS = 2;
export function quantize8bit(hex) {
  // Quantize the encoded sRGB bytes (not the linear working-space channels) so the
  // result really lands on the RGB332 levels, e.g. blue on 00/55/aa/ff.
  const bytes = new THREE.Color(hex).getHexString();
  const levels = (byte, bits) => {
    const steps = (1 << bits) - 1;
    return Math.round((Math.round((byte * steps) / 255) * 255) / steps);
  };
  const channel = (index, bits) =>
    levels(Number.parseInt(bytes.slice(index * 2, index * 2 + 2), 16), bits)
      .toString(16).padStart(2, '0');
  return `#${channel(0, QUANTIZE_RED_BITS)}${channel(1, QUANTIZE_GREEN_BITS)}${channel(2, QUANTIZE_BLUE_BITS)}`;
}

export function createJet(palette, id = DEFAULT_AIRCRAFT) {
  const definition = getAircraft(id);
  const airliner = definition.id === 'b787';
  const raptor = definition.id === 'f22';
  const length = airliner ? 56.7 : raptor ? 18.9 : 15.7;
  const span = airliner ? 60.1 : raptor ? 13.6 : 10.7;
  // The whole jet is built at reference scale below, then doubled in size (100% increase)
  // via a uniform group scale so every part (fuselage, wings, engines, lights) grows together.
  const SIZE_MULTIPLIER = 2;
  const jet = new THREE.Group();
  jet.name = definition.name;
  jet.userData.aircraftId = definition.id;
  jet.userData.dimensions = { length: length * SIZE_MULTIPLIER, span: span * SIZE_MULTIPLIER };
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const paint = new THREE.MeshStandardMaterial({ roughness: 0.62, metalness: 0.22 });
  const batches = new Map();
  const body = quantize8bit(airliner ? '#f8f7f2' : palette('jet'));
  const light = quantize8bit(airliner ? '#d8dfe2' : palette('jet-light'));
  const dark = quantize8bit(airliner ? '#263440' : palette('jet-dark'));
  const red = quantize8bit('#c8102e');
  const green = quantize8bit('#63dba2');
  function box(part, position, size, color = body) {
    if (!batches.has(part)) batches.set(part, []);
    batches.get(part).push({ position, size, color });
  }
  function sweptWing(part, root, tip, leading, trailing, height, thickness, color, rise = 0) {
    // Wider block pitch vs. the original divisor keeps the wing built from fewer, larger blocks.
    const steps = Math.ceil((tip - root) / (airliner ? 1.3 : 0.46));
    const width = (tip - root) / steps;
    for (const side of [-1, 1]) {
      for (let index = 0; index < steps; index++) {
        const offset = (index + 0.5) * width;
        const front = leading(offset);
        const back = trailing(offset);
        box(part, [side * (root + offset), height + offset * rise, (front + back) / 2],
          [width, thickness, back - front], color);
      }
    }
  }
  function fuselage(profile, steps, heightRatio) {
    const depth = length / steps;
    for (let index = 0; index < steps; index++) {
      const t = (index + 0.5) / steps;
      const next = profile.findIndex(([at]) => at >= t);
      const [start, startWidth] = profile[next - 1];
      const [end, endWidth] = profile[next];
      const width = THREE.MathUtils.lerp(startWidth, endWidth, (t - start) / (end - start));
      const z = -length / 2 + (index + 0.5) * depth;
      box('fuselage', [0, 0, z], [width, width * heightRatio * 0.64, depth]);
      for (const side of [-1, 1]) {
        box('fuselage', [0, side * width * heightRatio * 0.405, z],
          [width * 0.73, width * heightRatio * 0.19, depth]);
      }
    }
  }
  function fin(side, baseX, baseY, front, back, height, color, cant = 0) {
    const steps = airliner ? 12 : 8;
    for (let step = 0; step < steps; step++) {
      const t = (step + 0.5) / steps;
      const leading = front + t * height * 0.65;
      const trailing = back + t * height * 0.05;
      box('vertical-tails', [side * (baseX + t * cant), baseY + t * height, (leading + trailing) / 2],
        [airliner ? 0.42 : 0.26, height / steps, trailing - leading], color);
    }
  }

  if (airliner) {
    fuselage([[0, 0.35], [0.06, 3.5], [0.15, 5.77], [0.83, 5.77], [0.92, 3.5], [1, 0.45]], 36, 1);
    sweptWing('wings', 2.4, span / 2, (x) => -5 + x * 0.46, (x) => 6 + x * 0.11, -0.9, 0.46, light, 0.075);
    sweptWing('stabilizers', 1.2, 10, (x) => 18 + x * 0.47, (x) => 25 + x * 0.08, 1.1, 0.38, light, 0.055);
    fin(1, 0, 1.5, 15.5, 27.2, 11.7, red);
    for (const side of [-1, 1]) {
      const x = side * 9.3;
      box('engines', [x, -2.05, -0.25], [0.65, 2.7, 3.4], light);
      // Four box walls leave the underslung nacelles visibly open at the intake.
      for (const [z, width, depth] of [[-4.2, 3.2, 1.8], [-2.4, 3, 1.8], [-0.9, 2.6, 1.2]]) {
        for (const edge of [-1, 1]) {
          box('engines', [x + edge * (width / 2 - 0.23), -3.65, z], [0.46, width, depth]);
          box('engines', [x, -3.65 + edge * (width / 2 - 0.23), z], [width - 0.92, 0.46, depth]);
        }
      }
      box('engines', [x, -3.65, -4.85], [2.28, 2.28, 0.16], dark);
      box('engines', [x, -3.65, -4.98], [0.38, 0.38, 0.2], light);
      for (let window = 0; window < 38; window++) {
        box('windows', [side * 2.897, 0.8, -18.5 + window * 0.95], [0.08, 0.38, 0.26], dark);
      }
      for (const z of [-18.8, -5.5, 7.4, 18.2]) {
        box('doors', [side * 2.91, -0.2, z], [0.06, 1.7, 0.77], light);
      }
      box('cockpit', [side * 1.08, 1.5, -25], [1.65, 0.5, 1.2], dark);
      box('navigation-lights', [side * (span / 2 - 0.15), 1.37, 8.5], [0.25, 0.12, 0.5],
        side < 0 ? red : green);
    }
  } else {
    fuselage([[0, 0.12], [0.12, 0.85], [0.32, raptor ? 2.8 : 2.25],
      [0.58, raptor ? 3.7 : 2.9], [0.82, raptor ? 3.25 : 2.5],
      [1, raptor ? 2.8 : 1.3]], raptor ? 22 : 19, raptor ? 0.54 : 0.65);
    const root = raptor ? 1.45 : 1.15;
    sweptWing('wings', root, span / 2, (x) => (raptor ? -3.5 : -2.6) + x * 1.02,
      (x) => (raptor ? 3.5 : 2.7) + x * 0.16, 0.12, 0.23, light);
    sweptWing('stabilizers', 0.85, raptor ? 4.5 : 3.5,
      (x) => length * 0.28 + x * 0.62, (x) => length * 0.46 + x * 0.12, 0.05, 0.2, body);
    for (const side of [-1, 1]) {
      fin(side, raptor ? 1.38 : 1.05, 0.65, length * 0.17, length * 0.44,
        raptor ? 3.65 : 3.1, body, raptor ? 1.35 : 0.9);
      box('intakes', [side * (raptor ? 1.52 : 1.15), -0.13, raptor ? -3.6 : -2.6],
        [raptor ? 0.68 : 0.48, 0.85, 0.2], dark);
      box('navigation-lights', [side * (span / 2 - 0.12), 0.27, raptor ? 2.5 : 2],
        [0.16, 0.1, 0.32], side < 0 ? red : green);
    }
    for (let step = 0; step < 6; step++) {
      const t = step / 5;
      box('cockpit', [0, 0.94 + Math.sin(t * Math.PI) * 0.25, -length * 0.32 + step * 0.43],
        [0.55 + Math.sin(t * Math.PI) * 0.55, 0.75, 0.43], quantize8bit(palette('glass')));
    }
  }

  const engineXs = airliner ? [-9.3, 9.3] : raptor ? [-0.94, 0.94] : [0];
  jet.userData.engineCount = engineXs.length;
  const exhaustColor = quantize8bit(palette('exhaust'));
  const exhaustMaterial = new THREE.MeshBasicMaterial({ color: exhaustColor });
  const flameMaterial = new THREE.MeshBasicMaterial({
    color: exhaustColor, transparent: true, opacity: 0.38,
    depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const flame = new THREE.Group();
  flame.name = 'afterburner';
  flame.material = flameMaterial;
  // Scaling local Z grows the plumes aft without moving their nozzle attachment.
  flame.position.z = length / 2 + 0.03;
  const exhaustDisk = new THREE.Group();
  exhaustDisk.name = 'exhaust-glow';
  exhaustDisk.material = exhaustMaterial;
  flame.visible = exhaustDisk.visible = definition.supportsAfterburner;
  if (definition.supportsAfterburner) {
    for (const x of engineXs) {
      const width = raptor ? 1.36 : 1.25;
      box('engines', [x, 0, length / 2 - 0.48], [width, 1.02, 0.96], dark);
      const glow = new THREE.Mesh(cube, exhaustMaterial);
      glow.position.set(x, 0, length / 2 + 0.01);
      glow.scale.set(width * 0.78, 0.73, 0.04);
      exhaustDisk.add(glow);
      for (let step = 0; step < 3; step++) {
        const plume = new THREE.Mesh(cube, flameMaterial);
        plume.position.set(x, 0, 0.4 + step * 0.8);
        plume.scale.set(width * (0.7 - step * 0.18), 0.7 - step * 0.18, 0.8);
        flame.add(plume);
      }
    }
  }
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const size = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  for (const [name, blocks] of batches) {
    const mesh = new THREE.InstancedMesh(cube, paint, blocks.length);
    mesh.name = name;
    for (const [index, block] of blocks.entries()) {
      matrix.compose(position.set(...block.position), rotation, size.set(...block.size));
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, new THREE.Color(block.color));
    }
    mesh.computeBoundingBox();
    mesh.computeBoundingSphere();
    jet.add(mesh);
  }
  jet.add(flame, exhaustDisk);
  jet.scale.set(SIZE_MULTIPLIER, SIZE_MULTIPLIER, SIZE_MULTIPLIER);
  return { jet, flame, exhaustDisk, definition };
}

export function disposeAircraft(aircraft) {
  if (aircraft.jet.userData.disposed) return;
  const geometries = new Set();
  const materials = new Set();
  aircraft.jet.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (object.material) materials.add(object.material);
    if (object.isInstancedMesh) object.dispose();
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  aircraft.jet.removeFromParent();
  aircraft.jet.userData.disposed = true;
}
