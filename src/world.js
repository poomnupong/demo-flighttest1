import * as THREE from 'three';
import { CELL, EXTENT, FUJI, ROUTE, GATE_NORMALS, GATE_RADIUS, terrainHeight, groundHeight, lakeDistance, clamp } from './flight.js';

export function createWorld(palette) {
  const tint = (name) => new THREE.Color(palette(name));
  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(palette('sky-horizon'), 6200, 20500);
  const sun = new THREE.DirectionalLight(palette('sun'), 3.1);
  sun.position.set(-6500, 7500, 2500);
  const hemisphere = new THREE.HemisphereLight(palette('snow'), palette('rock'), 1.85);
  scene.add(sun, hemisphere);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(32000, 32, 20), new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    toneMapped: false,
    uniforms: {
      zenith: { value: tint('sky-top') },
      horizon: { value: tint('sky-horizon') },
      sunlight: { value: tint('sun') },
    },
    vertexShader: 'varying vec3 direction; void main(){direction=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec3 direction; uniform vec3 zenith; uniform vec3 horizon; uniform vec3 sunlight;
      void main(){
        vec3 ray=normalize(direction);
        float elevation=clamp(ray.y,0.0,1.0);
        vec3 skyColor=mix(horizon,zenith,pow(smoothstep(-0.12,0.7,ray.y),0.42));
        float sunDistance=dot(ray,normalize(vec3(-0.65,0.30,-0.72)));
        skyColor=mix(skyColor,sunlight,pow(max(sunDistance,0.0),40.0)*0.22);
        skyColor=mix(skyColor,sunlight,smoothstep(0.9990,0.9994,sunDistance));
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
  const grassDark = tint('grass-dark');
  const grass = tint('grass');
  const grassLight = tint('grass-light');
  const rock = tint('rock');
  const rockLight = tint('rock-light');
  const snow = tint('snow');
  const snowShadow = tint('snow-shadow');
  const groundBlocks = [];
  for (let worldX = -EXTENT + CELL / 2; worldX < EXTENT; worldX += CELL) {
    for (let worldZ = -EXTENT + CELL / 2; worldZ < EXTENT; worldZ += CELL) {
      const height = terrainHeight(worldX, worldZ);
      const angle = Math.atan2(worldZ - FUJI.z, worldX - FUJI.x);
      const snowline = 2200 + Math.sin(angle * 8) * 170 + Math.sin(angle * 15) * 70;
      const variation = random();
      let shade;
      if (height > snowline) shade = snowShadow.clone().lerp(snow, clamp((height - snowline) / 330 + variation * 0.3, 0.25, 1));
      else if (height > 1500) shade = rock.clone().lerp(rockLight, variation * 0.35 + (height - 1500) / 1600);
      else if (height > 750) shade = grassDark.clone().lerp(rock, (height - 750) / 1000).lerp(grass, variation * 0.18);
      else shade = grassDark.clone().lerp(grass, 0.35 + variation * 0.32).lerp(grassLight, clamp((450 - height) / 1100 + Math.sin(worldX * 0.001 + worldZ * 0.0007) * 0.12, 0, 0.5));
      if (lakeDistance(worldX, worldZ) > 0.98 && lakeDistance(worldX, worldZ) < 1.07 && height < 80) shade.lerp(tint('wall'), 0.65);
      groundBlocks.push({ position: [worldX, (height - 170) / 2, worldZ], size: [CELL + 0.3, height + 170, CELL + 0.3], color: shade });
    }
  }
  const terrain = blockBatch(groundBlocks);
  terrain.name = 'Voxel terrain';
  const water = new THREE.Mesh(new THREE.PlaneGeometry(EXTENT * 2, EXTENT * 2), new THREE.MeshStandardMaterial({
    color: palette('water'), roughness: 0.35, metalness: 0.25,
  }));
  water.rotation.x = -Math.PI / 2;
  water.position.y = 38;
  scene.add(water);
  const waterTiles = [];
  const sparkles = [];
  for (let tile = 0; tile < 680; tile++) {
    const worldX = (random() - 0.5) * 5200;
    const worldZ = (random() - 0.5) * 4300;
    if (lakeDistance(worldX, worldZ) > 0.94) continue;
    waterTiles.push({ position: [worldX, 38.5 + random(), worldZ], size: [70 + random() * 220, 0.3, 50 + random() * 100], color: tint('water-deep').lerp(tint('water'), random()) });
    if (tile % 3 === 0) sparkles.push({ position: [worldX, 41, worldZ], size: [20 + random() * 65, 0.4, 2 + random() * 3], color: tint('water-glint') });
  }
  blockBatch(waterTiles, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.19, depthWrite: false }));
  const glints = blockBatch(sparkles, new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.5, depthWrite: false }));
  const trees = [];
  const bark = tint('bark');
  for (let treeIndex = 0; treeIndex < 8400; treeIndex++) {
    const worldX = (random() - 0.5) * 18400;
    const worldZ = (random() - 0.5) * 18400;
    const height = groundHeight(worldX, worldZ);
    if (height < 78 || height > 1680 || lakeDistance(worldX, worldZ) < 1.10 || random() > 0.8) continue;
    const size = 22 + random() * 32;
    const shade = tint('pine').lerp(tint('pine-light'), random() * 0.8);
    trees.push({ position: [worldX, height + size * 0.48, worldZ], size: [size * 0.22, size, size * 0.22], color: bark });
    for (let level = 0; level < 3; level++) {
      trees.push({ position: [worldX, height + size * (0.9 + level * 0.42), worldZ], size: [size * (1.12 - level * 0.3), size * 0.6, size * (1.12 - level * 0.3)], color: shade.clone().lerp(grassLight, level * 0.08) });
    }
  }
  const village = [];
  for (let houseIndex = 0; houseIndex < 125; houseIndex++) {
    const angle = random() * Math.PI * 2;
    const radius = 1.1 + random() * 0.18;
    const worldX = 150 + Math.cos(angle) * 2520 * radius;
    const worldZ = 50 + Math.sin(angle) * 2100 * radius;
    const height = groundHeight(worldX, worldZ);
    if (height > 350 || height < 50) continue;
    const buildingHeight = 14 + random() * 14;
    const turn = Math.round(angle / (Math.PI / 2)) * Math.PI / 2;
    village.push({ position: [worldX, height + buildingHeight / 2, worldZ], size: [30, buildingHeight, 24], color: tint('wall'), rotation: turn });
    village.push({ position: [worldX, height + buildingHeight + 2, worldZ], size: [38, 5, 32], color: tint('roof'), rotation: turn });
    village.push({ position: [worldX, height + buildingHeight + 6, worldZ], size: [30, 5, 23], color: tint('roof').lerp(rockLight, 0.2), rotation: turn });
    const cherryX = worldX + 28;
    const cherryZ = worldZ + 12;
    const cherryBase = groundHeight(cherryX, cherryZ);
    trees.push({ position: [cherryX, cherryBase + 15, cherryZ], size: [5, 30, 5], color: bark });
    trees.push({ position: [cherryX, cherryBase + 34, cherryZ], size: [38, 23, 33], color: tint('blossom') });
    trees.push({ position: [cherryX - 9, cherryBase + 45, cherryZ - 5], size: [24, 15, 25], color: tint('blossom-light') });
  }
  blockBatch(trees);
  blockBatch(village);
  const shrine = [];
  const shrineX = -2570;
  const shrineZ = 450;
  const shrineBase = groundHeight(shrineX, shrineZ);
  for (let level = 0; level < 5; level++) {
    const width = 80 - level * 10;
    shrine.push({ position: [shrineX, shrineBase + 15 + level * 26, shrineZ], size: [width - 16, 24, width - 16], color: tint('wall') });
    shrine.push({ position: [shrineX, shrineBase + 29 + level * 26, shrineZ], size: [width + 15, 6, width + 15], color: tint('roof') });
    shrine.push({ position: [shrineX, shrineBase + 35 + level * 26, shrineZ], size: [width, 6, width], color: tint('roof') });
  }
  shrine.push({ position: [shrineX, shrineBase + 165, shrineZ], size: [4, 43, 4], color: tint('glass-light') });
  const toriiX = -2180;
  const toriiZ = 470;
  for (const side of [-1, 1]) shrine.push({ position: [toriiX + side * 28, 64, toriiZ], size: [9, 70, 10], color: tint('torii') });
  shrine.push({ position: [toriiX, 99, toriiZ], size: [94, 9, 16], color: tint('torii') });
  shrine.push({ position: [toriiX, 105, toriiZ], size: [105, 5, 18], color: tint('roof') });
  shrine.push({ position: [toriiX, 85, toriiZ], size: [73, 6, 10], color: tint('torii') });
  shrine.push({ position: [toriiX - 140, 43, toriiZ], size: [330, 6, 25], color: bark });
  blockBatch(shrine);
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
  const stars = new THREE.Group();
  const starMaterial = new THREE.MeshBasicMaterial({ color: palette('star'), transparent: true, opacity: 0.9 });
  const starBlocks = [];
  for (let starIndex = 0; starIndex < 420; starIndex++) {
    const azimuth = random() * Math.PI * 2;
    const elevation = 0.12 + random() * 0.78;
    const radius = 27500;
    const size = 18 + random() * 34;
    starBlocks.push({
      position: [Math.cos(azimuth) * Math.cos(elevation) * radius, Math.sin(elevation) * radius, Math.sin(azimuth) * Math.cos(elevation) * radius],
      size: [size, size, size],
      color: tint('star'),
    });
  }
  stars.add(blockBatch(starBlocks, starMaterial));
  stars.visible = false;
  scene.add(stars);
  const moon = new THREE.Group();
  const moonMaterial = new THREE.MeshBasicMaterial({ color: palette('moon') });
  for (let row = -2; row <= 2; row++) {
    for (let column = -2; column <= 2; column++) {
      if (Math.hypot(row, column) > 2.4) continue;
      const face = new THREE.Mesh(cube, moonMaterial);
      face.position.set(column * 95, row * 95, 0);
      face.scale.set(95, 95, 60);
      moon.add(face);
    }
  }
  moon.position.set(6200, 6800, -9000);
  moon.visible = false;
  scene.add(moon);
  const gates = ROUTE.map((gate, index) => {
    const group = new THREE.Group();
    const material = new THREE.MeshStandardMaterial({ color: palette('gate'), emissive: palette('gate'), emissiveIntensity: 0.28, roughness: 0.65 });
    for (let segment = 0; segment < 16; segment++) {
      const angle = segment / 16 * Math.PI * 2;
      const marker = new THREE.Mesh(new THREE.BoxGeometry(13, 30, 20), material);
      marker.position.set(Math.cos(angle) * GATE_RADIUS, Math.sin(angle) * GATE_RADIUS, 0);
      marker.rotation.z = angle;
      group.add(marker);
    }
    group.position.set(gate.x, gate.y, gate.z);
    group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3().copy(GATE_NORMALS[index]));
    scene.add(group);
    return group;
  });
  return { scene, sky, sun, hemisphere, terrain, water, glints, clouds, stars, moon, gates };
}

export function createJet(palette) {
  const jet = new THREE.Group();
  jet.name = 'F-35A inspired aircraft';
  const material = (name, options = {}) => new THREE.MeshStandardMaterial({ color: palette(name), roughness: 0.54, metalness: 0.35, flatShading: true, ...options });
  const bodyMaterial = material('jet');
  const lightMaterial = material('jet-light');
  const darkMaterial = material('jet-dark');
  const glassMaterial = material('glass', { metalness: 0.72, roughness: 0.19 });
  const frameMaterial = material('glass-light', { metalness: 0.65, roughness: 0.22 });
  const geometryFromFaces = (vertices, indices) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices.flat(), 3));
    geometry.setIndex(indices);
    geometry.computeVertexNormals();
    return geometry;
  };
  function hull(sections, surface) {
    const vertices = [];
    const indices = [];
    for (const [depth, width, bottom, top] of sections) {
      const bevel = (top - bottom) * 0.2;
      vertices.push([-width * 0.6, bottom, depth], [width * 0.6, bottom, depth], [width, bottom + bevel, depth], [width, top - bevel, depth], [width * 0.55, top, depth], [-width * 0.55, top, depth], [-width, top - bevel, depth], [-width, bottom + bevel, depth]);
    }
    for (let section = 0; section < sections.length - 1; section++) {
      for (let corner = 0; corner < 8; corner++) {
        const start = section * 8 + corner;
        const next = section * 8 + (corner + 1) % 8;
        indices.push(start, next, start + 8, next, next + 8, start + 8);
      }
    }
    for (let corner = 1; corner < 7; corner++) {
      indices.push(0, corner + 1, corner);
      const offset = (sections.length - 1) * 8;
      indices.push(offset, offset + corner, offset + corner + 1);
    }
    const mesh = new THREE.Mesh(geometryFromFaces(vertices, indices), surface);
    jet.add(mesh);
    return mesh;
  }
  function plate(points, bottom, top, surface) {
    const vertices = [...points.map(([worldX, worldZ]) => [worldX, top, worldZ]), ...points.map(([worldX, worldZ]) => [worldX, bottom, worldZ])];
    const count = points.length;
    const indices = [];
    const triangles = THREE.ShapeUtils.triangulateShape(points.map(([worldX, worldZ]) => new THREE.Vector2(worldX, worldZ)), []);
    for (const [first, second, third] of triangles) indices.push(third, second, first, first + count, second + count, third + count);
    for (let edge = 0; edge < count; edge++) {
      const next = (edge + 1) % count;
      indices.push(edge, next, edge + count, next, next + count, edge + count);
    }
    const mesh = new THREE.Mesh(geometryFromFaces(vertices, indices), surface);
    jet.add(mesh);
    return mesh;
  }
  hull([[-14, 0.04, 0.1, 0.2], [-10, 0.85, -0.45, 0.85], [-6, 1.55, -0.85, 1.35], [-1, 2.15, -1.1, 1.65], [4, 2.25, -1.05, 1.35], [8, 1.65, -0.65, 0.95], [10, 1.25, -0.45, 0.8]], bodyMaterial);
  hull([[-8.3, 0.05, 1.12, 1.22], [-6.4, 0.82, 1.2, 2.6], [-3.2, 1.01, 1.42, 2.95], [-1.2, 0.78, 1.55, 2.18], [-0.4, 0.32, 1.58, 1.7]], glassMaterial);
  hull([[-6.7, 0.84, 1.18, 2.48], [-6.45, 0.88, 1.20, 2.66]], frameMaterial);
  for (const side of [-1, 1]) {
    const mirrored = (points) => points.map(([worldX, worldZ]) => [worldX * side, worldZ]);
    plate(mirrored([[1.4, -4.2], [9.9, 3.6], [10.2, 5.7], [3.2, 4.8], [1.7, 2.5]]), 0.05, 0.4, lightMaterial);
    plate(mirrored([[3.2, 3.3], [9.9, 4.6], [10.2, 5.7], [3.2, 4.8]]), 0.12, 0.43, bodyMaterial);
    plate(mirrored([[1.2, 5.7], [5.7, 8.3], [5.2, 10.6], [1.3, 9.1]]), 0.15, 0.43, bodyMaterial);
    plate(mirrored([[1.2, -7], [2.9, -3.5], [2.6, 2.2], [1.7, 1]]), -0.4, 0.38, bodyMaterial);
    const tailVertices = [[side * 1.8, 0.8, 4.2], [side * 3.9, 5.3, 6.7], [side * 4.0, 5.4, 9], [side * 2, 0.9, 9.5]];
    const fin = new THREE.Mesh(geometryFromFaces(tailVertices, [0, 1, 2, 0, 2, 3]), material('jet', { side: THREE.DoubleSide }));
    jet.add(fin);
    const cap = new THREE.Mesh(geometryFromFaces([[side * 3.7, 4.9, 6.4], tailVertices[1], tailVertices[2], [side * 3.8, 5, 9.1]], [0, 1, 2, 0, 2, 3]), material('jet-dark', { side: THREE.DoubleSide }));
    jet.add(cap);
    const intake = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.25, 0.25), glassMaterial);
    intake.position.set(side * 1.92, -0.06, -3.7);
    intake.rotation.y = side * -0.22;
    jet.add(intake);
    const roundelBase = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.05, 1.3), lightMaterial);
    roundelBase.position.set(side * 6.2, 0.455, 3.15);
    jet.add(roundelBase);
    const roundel = new THREE.Mesh(new THREE.BoxGeometry(0.86, 0.05, 0.86), material('torii'));
    roundel.position.set(side * 6.2, 0.465, 3.15);
    jet.add(roundel);
    const wingLight = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.8), new THREE.MeshBasicMaterial({ color: palette(side < 0 ? 'torii' : 'grass-light') }));
    wingLight.position.set(side * 9.9, 0.43, 4.1);
    jet.add(wingLight);
  }
  const nozzle = new THREE.Mesh(new THREE.BoxGeometry(2.1, 2.1, 1.9), darkMaterial);
  nozzle.position.set(0, 0.08, 9.9);
  jet.add(nozzle);
  const exhaustDisk = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.7, 0.08), new THREE.MeshBasicMaterial({ color: palette('exhaust') }));
  exhaustDisk.position.set(0, 0.08, 10.87);
  jet.add(exhaustDisk);
  const flame = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.5, 7), new THREE.MeshBasicMaterial({ color: palette('exhaust'), transparent: true, opacity: 0.38, depthWrite: false, blending: THREE.AdditiveBlending }));
  flame.position.set(0, 0.08, 13);
  jet.add(flame);
  const panelLines = new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-1, 1.69, -0.4), new THREE.Vector3(-1, 1.44, 4),
    new THREE.Vector3(1, 1.69, -0.4), new THREE.Vector3(1, 1.44, 4),
    new THREE.Vector3(-1, 1.44, 4), new THREE.Vector3(1, 1.44, 4),
  ]), new THREE.LineBasicMaterial({ color: palette('jet-dark'), transparent: true, opacity: 0.65 }));
  jet.add(panelLines);
  return { jet, flame, exhaustDisk };
}