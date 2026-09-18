import * as THREE from 'three';
import { GATE_RADIUS, gateRotation, routeNormals } from './flight.js';
import { DEFAULT_SCENE, CELL, EXTENT, getScene, terrainHeight as sampleTerrain, groundHeight as sampleGround } from './scenes.js';

export function disposeObject(object) {
  const resources = new Set();
  object.traverse((child) => {
    if (child.geometry) resources.add(child.geometry);
    for (const material of Array.isArray(child.material) ? child.material : child.material ? [child.material] : []) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
    if (child.isInstancedMesh) resources.add(child);
  });
  for (const resource of resources) resource.dispose();
}

export function createWorld(palette, sceneId = DEFAULT_SCENE) {
  const descriptor = getScene(sceneId);
  const terrainHeight = (x, z) => sampleTerrain(x, z, sceneId);
  const groundHeight = (x, z) => sampleGround(x, z, sceneId);
  const gateNormals = routeNormals(descriptor.route, descriptor.spawn);
  const tint = (name) => new THREE.Color(palette(name));
  const scene = new THREE.Scene();
  scene.name = descriptor.name;
  scene.fog = new THREE.Fog(palette('sky-horizon'), 6200, 20500);
  const sun = new THREE.DirectionalLight(palette('sun'), 3.1);
  sun.position.set(-6500, 7500, 2500);
  const hemisphere = new THREE.HemisphereLight(palette('snow'), palette('rock'), 1.85);
  scene.add(sun, hemisphere);
  const sky = new THREE.Mesh(new THREE.BoxGeometry(64000, 64000, 64000), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      zenith: { value: tint('sky-top') },
      horizon: { value: tint('sky-horizon') },
      sunlight: { value: tint('sun') },
      daylight: { value: 1 },
    },
    vertexShader: 'varying vec3 direction; void main(){direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec3 direction; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunlight; uniform float daylight;
      void main(){
        vec3 ray=normalize(direction);
        float elevation=clamp(ray.y,0.0,1.0);
        vec3 skyColor=mix(horizon,zenith,pow(smoothstep(-0.12,0.7,ray.y),0.42));
        float sunDistance=dot(ray,normalize(vec3(-0.65,0.30,-0.72)));
        skyColor=mix(skyColor,sunlight,pow(max(sunDistance,0.0),40.0)*0.22*daylight);
        skyColor=mix(skyColor,sunlight,smoothstep(0.9990,0.9994,sunDistance)*daylight);
        gl_FragColor=vec4(skyColor,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  scene.add(sky);
  let seed = 73591;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const cube = new THREE.BoxGeometry(1, 1, 1);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const scale = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const matte = new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0, flatShading: true });
  function blockBatch(blocks, material = matte) {
    const mesh = new THREE.InstancedMesh(cube, material, blocks.length);
    for (const [index, block] of blocks.entries()) {
      position.set(...block.position);
      scale.set(...block.size);
      rotation.setFromAxisAngle(new THREE.Vector3(0, 1, 0), block.rotation || 0);
      matrix.compose(position, rotation, scale);
      mesh.setMatrixAt(index, matrix);
      mesh.setColorAt(index, block.color);
    }
    mesh.computeBoundingSphere();
    scene.add(mesh);
    return mesh;
  }
  const groundBlocks = [];
  for (let worldX = -EXTENT + CELL / 2; worldX < EXTENT; worldX += CELL) {
    for (let worldZ = -EXTENT + CELL / 2; worldZ < EXTENT; worldZ += CELL) {
      if (descriptor.containsDetail(worldX, worldZ)) continue;
      const height = terrainHeight(worldX, worldZ);
      groundBlocks.push({ position: [worldX, (height - 170) / 2, worldZ], size: [CELL, height + 170, CELL], color: tint('urban') });
    }
  }
  groundBlocks.push(...descriptor.groundBlocks().map((block) => ({ ...block, color: tint(block.color) })));
  const terrain = blockBatch(groundBlocks);
  terrain.name = 'Voxel terrain';
  const water = new THREE.Mesh(new THREE.BoxGeometry(EXTENT * 2, 2, EXTENT * 2), new THREE.MeshStandardMaterial({
    color: palette('water'), roughness: 0.35, metalness: 0.25,
  }));
  water.position.y = 37;
  scene.add(water);
  const waterTiles = [];
  const sparkles = [];
  for (let tile = 0; tile < 680; tile++) {
    const worldX = (random() - 0.5) * EXTENT * 2;
    const worldZ = (random() - 0.5) * EXTENT * 2;
    if (groundHeight(worldX, worldZ) > 38) continue;
    waterTiles.push({ position: [worldX, 38.5 + random(), worldZ], size: [70 + random() * 220, 0.3, 50 + random() * 100], color: tint('water-deep').lerp(tint('water'), random()) });
    if (tile % 3 === 0) sparkles.push({ position: [worldX, 41, worldZ], size: [20 + random() * 65, 0.4, 2 + random() * 3], color: tint('water-glint') });
  }
  blockBatch(waterTiles, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.19, depthWrite: false }));
  const glints = blockBatch(sparkles, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }));
  const trees = [];
  const bark = tint('bark');
  const [minX, minZ, maxX, maxZ] = descriptor.detailBounds;
  for (let x = minX + 15; x < maxX; x += 35) for (let z = minZ + 15; z < maxZ; z += 35) {
    if (descriptor.sampleSurface(x, z) !== 3) continue;
    const occupied = [...descriptor.nearbyBounds(x - 8, z - 8, x + 8, z + 8)].some(({ min, max }) =>
      max.y > 46.5 && x + 8 > min.x && x - 8 < max.x && z + 8 > min.z && z - 8 < max.z);
    if (occupied) continue;
    trees.push({ position: [x, 50, z], size: [2, 8, 2], color: bark },
      { position: [x, 57, z], size: [11, 9, 11], color: tint('pine-light') });
  }
  blockBatch(trees);
  const landmarks = blockBatch(descriptor.blocks.map((block) => ({ ...block, color: tint(block.color) })));
  landmarks.name = `${descriptor.name} architecture`;
  landmarks.userData.blocks = descriptor.blocks;
  const clouds = new THREE.Group();
  const cloudMaterial = new THREE.MeshStandardMaterial({ color: palette('snow'), roughness: 1, flatShading: true });
  for (let cloudIndex = 0; cloudIndex < 37; cloudIndex++) {
    const cloud = new THREE.Group();
    const worldX = (random() - 0.5) * 25500;
    const worldZ = (random() - 0.5) * 24000;
    if (Math.abs(worldX) < 2200 && worldZ > -9000 && worldZ < -2000) continue;
    cloud.position.set(worldX, 2700 + random() * 2600, worldZ);
    const width = 270 + random() * 420;
    for (let puff = 0; puff < 5; puff++) {
      const mesh = new THREE.Mesh(cube, cloudMaterial);
      mesh.scale.set(width * (0.6 + random()), 90 + random() * 140, width * (0.35 + random() * 0.45));
      mesh.position.set((puff - 2) * width * 0.45, Math.sin(puff * 1.5) * 70, (random() - 0.5) * width * 0.5);
      cloud.add(mesh);
    }
    clouds.add(cloud);
  }
  scene.add(clouds);
  const stars = blockBatch(Array.from({ length: 350 }, () => {
    const angle = random() * Math.PI * 2, elevation = 0.1 + random() * 1.35;
    const radius = 24500, size = 16 + random() * 28;
    return { position: [Math.cos(angle) * Math.cos(elevation) * radius, Math.sin(elevation) * radius, Math.sin(angle) * Math.cos(elevation) * radius],
      size: [size, size, size], color: tint('snow') };
  }), new THREE.MeshBasicMaterial({ transparent: true, opacity: 1, depthWrite: false, toneMapped: false }));
  stars.name = 'Box stars';
  stars.visible = false;
  const moon = new THREE.Mesh(cube, new THREE.MeshBasicMaterial({ color: palette('snow'), toneMapped: false }));
  moon.scale.set(580, 580, 180);
  moon.position.set(8500, 14500, -16000);
  moon.name = 'Box moon';
  moon.visible = false;
  scene.add(moon);
  const gates = descriptor.route.map((gate, index) => {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: palette('gate'), emissive: palette('gate'), emissiveIntensity: 0.28, roughness: 0.65 });
    for (const side of [-1, 1]) {
      const horizontal = new THREE.Mesh(cube, material);
      horizontal.scale.set(GATE_RADIUS * 2 + 12, 12, 12);
      horizontal.position.y = side * GATE_RADIUS;
      group.add(horizontal);
      const vertical = new THREE.Mesh(cube, material);
      vertical.scale.set(12, GATE_RADIUS * 2 - 12, 12);
      vertical.position.x = side * GATE_RADIUS;
      group.add(vertical);
    }
    group.position.set(gate.x, gate.y, gate.z);
    group.quaternion.copy(gateRotation(gateNormals[index]));
    scene.add(group);
    return group;
  });
  let disposed = false;
  return { scene, sky, sun, hemisphere, terrain, water, glints, clouds, gates, stars, moon, landmarks,
    dispose() {
      if (disposed) return;
      disposed = true;
      disposeObject(scene);
      scene.clear();
    },
  };
}
