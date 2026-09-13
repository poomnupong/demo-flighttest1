import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { AIRCRAFT, createJet, disposeAircraft, quantize8bit } from '../src/aircraft.js';

const palette = (name) => ({
  jet: '#586872', 'jet-light': '#8799a3', 'jet-dark': '#263440',
  glass: '#365665', exhaust: '#ff943d',
})[name] || '#ffffff';

function bounds(mesh) {
  mesh.updateMatrixWorld(true);
  return new THREE.Box3().setFromObject(mesh);
}

function instances(mesh) {
  return Array.from({ length: mesh.count }, (_, index) => {
    const matrix = new THREE.Matrix4();
    mesh.getMatrixAt(index, matrix);
    return { position: new THREE.Vector3().setFromMatrixPosition(matrix),
      size: new THREE.Vector3().setFromMatrixScale(matrix) };
  });
}

test('catalog provides selectable aircraft, scaled cameras and afterburner capabilities', () => {
  assert.deepEqual(AIRCRAFT.map(({ id }) => id), ['f35', 'f22', 'b787']);
  assert.deepEqual(AIRCRAFT.map(({ supportsAfterburner }) => supportsAfterburner), [true, true, false]);
  for (const definition of AIRCRAFT) {
    assert.ok(definition.name.length > 0);
    assert.equal(definition.cockpitOffset.length, 3);
    assert.ok(definition.cockpitOffset.every(Number.isFinite));
  }
  assert.ok(AIRCRAFT[2].cameraDistance > AIRCRAFT[1].cameraDistance * 2);
  const fallback = createJet(palette, 'unknown');
  assert.equal(fallback.definition.id, 'f35');
  disposeAircraft(fallback);
});

test('quantize8bit clamps colors to a 256-color (3-3-2 bit) palette', () => {
  assert.equal(quantize8bit('#ffffff'), '#ffffff');
  assert.equal(quantize8bit('#000000'), '#000000');
  // Repeated quantization must be stable (idempotent) once a color is already on the palette.
  const once = quantize8bit('#8799a3');
  assert.equal(quantize8bit(once), once);
});

for (const [id, length, span] of [['f35', 15.7, 10.7], ['f22', 18.9, 13.6], ['b787', 56.7, 60.1]]) {
  test(`${id} is built at reference proportions then scaled 100% larger as a whole`, () => {
    const aircraft = createJet(palette, id);
    const { jet } = aircraft;
    assert.deepEqual(jet.scale.toArray(), [2, 2, 2]);
    assert.equal(jet.userData.dimensions.length, length * 2);
    assert.equal(jet.userData.dimensions.span, span * 2);
    jet.updateMatrixWorld(true);
    const bodySize = bounds(jet.getObjectByName('fuselage')).getSize(new THREE.Vector3());
    const wingSize = bounds(jet.getObjectByName('wings')).getSize(new THREE.Vector3());
    assert.ok(Math.abs(bodySize.z - length * 2) < 0.01);
    assert.ok(Math.abs(wingSize.x - span * 2) < 0.01);
    disposeAircraft(aircraft);
  });
}

for (const [id, length, span] of [['f35', 15.7, 10.7], ['f22', 18.9, 13.6], ['b787', 56.7, 60.1]]) {
  test(`${id} has reference proportions, stepped swept wings and shared box geometry only`, () => {
    const aircraft = createJet(palette, id);
    const { jet } = aircraft;
    const geometries = new Set();
    let instanceCount = 0;
    let drawCalls = 0;
    jet.traverse((object) => {
      if (!object.geometry) return;
      assert.equal(object.geometry.type, 'BoxGeometry', object.name);
      geometries.add(object.geometry);
      instanceCount += object.isInstancedMesh ? object.count : 1;
      drawCalls++;
    });
    assert.equal(geometries.size, 1);
    assert.ok(instanceCount > drawCalls * 5);
    const bodySize = bounds(jet.getObjectByName('fuselage')).getSize(new THREE.Vector3());
    const wingSize = bounds(jet.getObjectByName('wings')).getSize(new THREE.Vector3());
    assert.ok(Math.abs(bodySize.z - length) < 0.001);
    assert.ok(Math.abs(wingSize.x - span) < 0.001);
    assert.ok(Math.abs(wingSize.x / bodySize.z - span / length) < 0.001);
    const wing = instances(jet.getObjectByName('wings')).filter(({ position }) => position.x > 0);
    assert.ok(wing.length >= 10);
    assert.ok(wing.at(-1).position.z > wing[0].position.z);
    assert.ok(wing.at(-1).size.z < wing[0].size.z);
    disposeAircraft(aircraft);
  });
}

test('fighters have single/twin engines, twin tails and compatible anchored flame animation', () => {
  for (const [id, engines] of [['f35', 1], ['f22', 2]]) {
    const aircraft = createJet(palette, id);
    const { jet, flame, exhaustDisk } = aircraft;
    assert.equal(jet.userData.engineCount, engines);
    assert.equal(exhaustDisk.children.length, engines);
    assert.equal(flame.children.length, engines * 3);
    const tails = instances(jet.getObjectByName('vertical-tails'));
    assert.equal(tails.filter(({ position }) => position.x > 0).length, 8);
    assert.equal(tails.filter(({ position }) => position.x < 0).length, 8);
    flame.scale.set(1, 1, 1.9);
    flame.material.opacity = 0.72;
    exhaustDisk.material.color.set('#ffcc66');
    const expanded = bounds(flame);
    flame.scale.set(1, 1, 0.42);
    const contracted = bounds(flame);
    assert.ok(expanded.max.z > contracted.max.z);
    assert.ok(Math.abs(expanded.min.z - contracted.min.z) < 0.001);
    for (const child of flame.children) assert.equal(child.material.opacity, 0.72);
    for (const child of exhaustDisk.children) assert.equal(child.material.color.getHexString(), 'ffcc66');
    disposeAircraft(aircraft);
  }
});

test('787 has white fuselage, red tail, windows, two underslung nacelles and no flames', () => {
  const aircraft = createJet(palette, 'b787');
  const { jet, flame, exhaustDisk } = aircraft;
  const color = new THREE.Color();
  jet.getObjectByName('fuselage').getColorAt(0, color);
  assert.equal(color.getHexString(), quantize8bit('#f8f7f2').slice(1));
  jet.getObjectByName('vertical-tails').getColorAt(0, color);
  assert.equal(color.getHexString(), quantize8bit('#c8102e').slice(1));
  assert.equal(jet.userData.engineCount, 2);
  const nacelles = instances(jet.getObjectByName('engines'));
  assert.ok(nacelles.some(({ position }) => position.x < -8 && position.y < -3));
  assert.ok(nacelles.some(({ position }) => position.x > 8 && position.y < -3));
  assert.equal(jet.getObjectByName('windows').count, 76);
  assert.equal(flame.children.length, 0);
  assert.equal(exhaustDisk.children.length, 0);
  assert.equal(flame.visible, false);
  assert.equal(exhaustDisk.visible, false);
  flame.scale.set(1, 1, 1.9);
  flame.material.opacity = 0.72;
  exhaustDisk.material.color.set('#ffcc66');
  assert.equal(bounds(flame).isEmpty(), true);
  disposeAircraft(aircraft);
});

test('disposal releases each shared resource once and leaves another aircraft intact', () => {
  const first = createJet(palette);
  const second = createJet(palette, 'f22');
  const scene = new THREE.Scene();
  scene.add(first.jet, second.jet);
  const resources = new Set();
  first.jet.traverse((object) => {
    if (object.geometry) resources.add(object.geometry);
    if (object.material) resources.add(object.material);
    if (object.isInstancedMesh) resources.add(object);
  });
  const counts = new Map();
  for (const resource of resources) {
    resource.addEventListener('dispose', () => counts.set(resource, (counts.get(resource) || 0) + 1));
  }
  let otherDisposed = false;
  second.jet.getObjectByName('fuselage').geometry.addEventListener('dispose', () => { otherDisposed = true; });
  disposeAircraft(first);
  disposeAircraft(first);
  assert.equal(first.jet.parent, null);
  assert.equal(second.jet.parent, scene);
  assert.equal(otherDisposed, false);
  assert.equal(counts.size, resources.size);
  for (const count of counts.values()) assert.equal(count, 1);
  disposeAircraft(second);
});
