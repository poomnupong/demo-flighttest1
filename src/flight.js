import { Body, Sphere, Vec3, World } from 'cannon-es';
import { Quaternion, Vector3 } from 'three';
import { EXTENT, getScene, groundHeight, intersectsScenery, clamp, lerp } from './scenes.js';
export { CELL, EXTENT, FUJI, terrainHeight, groundHeight, lakeDistance, clamp, lerp } from './scenes.js';

export const ROUTE = getScene().route;
export const GATE_RADIUS = 165;
export const gateRotation = (normal) => new Quaternion().setFromUnitVectors(new Vector3(0, 0, 1), new Vector3(normal.x, normal.y, normal.z));
export function crossedGate(previous, current, gate, normal, halfSize = GATE_RADIUS - 15) {
  const previousSide = (previous.x - gate.x) * normal.x + (previous.y - gate.y) * normal.y + (previous.z - gate.z) * normal.z;
  const currentSide = (current.x - gate.x) * normal.x + (current.y - gate.y) * normal.y + (current.z - gate.z) * normal.z;
  if (previousSide * currentSide > 0 || Math.abs(previousSide - currentSide) < 0.00001) return false;
  const fraction = previousSide / (previousSide - currentSide);
  const offsetX = lerp(previous.x, current.x, fraction) - gate.x;
  const offsetY = lerp(previous.y, current.y, fraction) - gate.y;
  const offsetZ = lerp(previous.z, current.z, fraction) - gate.z;
  // Use the rendered square's local axes, retaining clearance from its frame.
  const local = new Vector3(offsetX, offsetY, offsetZ).applyQuaternion(gateRotation(normal).invert());
  return Math.abs(local.x) < halfSize && Math.abs(local.y) < halfSize;
}
export const routeNormals = (route, spawn) => route.map((gate, index) => {
  const previous = index === 0 ? spawn : route[index - 1];
  const normal = new Vec3(gate.x - previous.x, gate.y - previous.y, gate.z - previous.z);
  normal.normalize();
  return normal;
});
export const GATE_NORMALS = routeNormals(ROUTE, getScene().spawn);

export function autopilotInput(flight) {
  const target = flight.route[Math.min(flight.gateIndex, flight.route.length - 1)];
  const offsetX = target.x - flight.body.position.x;
  const offsetZ = target.z - flight.body.position.z;
  const distance = Math.hypot(offsetX, offsetZ);
  const desiredHeading = Math.atan2(-offsetX, -offsetZ);
  const difference = Math.atan2(Math.sin(desiredHeading - flight.heading), Math.cos(desiredHeading - flight.heading));
  const desiredBank = clamp(difference * 1.7, -0.9, 0.9);
  const desiredPitch = clamp(Math.atan2(target.y - flight.body.position.y, distance), -0.8, 0.8);
  return {
    roll: clamp((desiredBank - flight.bank) * 3, -1, 1),
    pitch: clamp((desiredPitch - flight.pitch) * 3.5, -1, 1),
    yaw: clamp(difference * 0.5, -0.4, 0.4),
  };
}

export class FlightModel {
  constructor(sceneId = 'fuji') {
    this.world = new World({ gravity: new Vec3(0, -9.81, 0) });
    this.body = new Body({ mass: 13000, shape: new Sphere(4), linearDamping: 0, angularDamping: 1 });
    this.world.addBody(this.body);
    this.forward = new Vec3();
    this.previous = new Vec3();
    this.setScene(sceneId);
  }
  setScene(sceneId) {
    const scene = getScene(sceneId);
    this.sceneId = scene.id;
    this.route = scene.route;
    this.gateNormals = routeNormals(this.route, scene.spawn);
    this.reset();
  }
  reset() {
    const spawn = getScene(this.sceneId).spawn;
    this.body.position.set(spawn.x, spawn.y, spawn.z);
    this.body.previousPosition.copy(this.body.position);
    this.body.interpolatedPosition.copy(this.body.position);
    this.body.velocity.set(0, 0, -195);
    this.body.force.set(0, 0, 0);
    this.body.angularVelocity.set(0, 0, 0);
    this.body.quaternion.set(0, 0, 0, 1);
    this.world.accumulator = 0;
    this.accumulator = 0;
    this.pitch = 0;
    this.bank = 0;
    this.heading = 0;
    this.throttle = 0.6;
    this.speed = 195;
    this.elapsed = 0;
    this.gateIndex = 0;
    this.score = 0;
    this.paused = false;
    this.crashed = false;
    this.completed = false;
    this.boosting = false;
    this.freeFlight = false;
    this.event = null;
    this.clearance = spawn.y - groundHeight(spawn.x, spawn.z, this.sceneId);
  }
  update(delta, input = {}) {
    this.event = null;
    if (this.paused || this.crashed || this.completed) return;
    this.accumulator += clamp(delta, 0, 0.05);
    const fixedStep = 1 / 60;
    while (this.accumulator >= fixedStep - 1e-10 && !this.crashed && !this.completed) {
      this.integrate(fixedStep, input);
      this.accumulator -= fixedStep;
    }
  }
  integrate(step, input) {
    this.elapsed += step;
    this.previous.copy(this.body.position);
    this.throttle = clamp(this.throttle + (input.throttle || 0) * step * 0.22, 0, 1);
    this.boosting = !!input.boost;
    this.bank = clamp(this.bank + (input.roll || 0) * step * 1.3, -1.22, 1.22);
    if (!input.roll) this.bank *= Math.exp(-step * 0.4);
    this.pitch = clamp(this.pitch + (input.pitch || 0) * step * 0.55, -0.98, 1.02);
    if (!input.pitch) this.pitch *= Math.exp(-step * 0.17);
    this.heading += (Math.sin(this.bank) * 0.48 + (input.yaw || 0) * 0.35) * step;
    this.body.quaternion.setFromEuler(this.pitch, this.heading, this.bank, 'YXZ');
    this.body.quaternion.vmult(new Vec3(0, 0, -1), this.forward);
    this.speed = this.body.velocity.length();
    const targetSpeed = 65 + this.throttle * 220 + (this.boosting ? 105 : 0);
    const acceleration = (targetSpeed - this.speed) * 0.42 - this.forward.y * 35;
    const lift = clamp(this.speed / 105, 0, 1);
    const mass = this.body.mass;
    this.body.force.set(
      ((this.forward.x * this.speed - this.body.velocity.x) * 3.8 + this.forward.x * acceleration) * mass,
      ((this.forward.y * this.speed - this.body.velocity.y) * 3.8 + this.forward.y * acceleration + 9.81 * lift) * mass,
      ((this.forward.z * this.speed - this.body.velocity.z) * 3.8 + this.forward.z * acceleration) * mass,
    );
    this.world.step(step);
    this.clearance = this.body.position.y - groundHeight(this.body.position.x, this.body.position.z, this.sceneId);
    if (this.clearance < 6 || intersectsScenery(this.previous, this.body.position, this.sceneId)) {
      this.crashed = true;
      this.event = 'crash';
    } else if (Math.abs(this.body.position.x) > EXTENT - 300 || Math.abs(this.body.position.z) > EXTENT - 300 || this.body.position.y > 11000) {
      this.crashed = true;
      this.event = 'boundary';
    } else if (!this.freeFlight && this.gateIndex < this.route.length && crossedGate(this.previous, this.body.position, this.route[this.gateIndex], this.gateNormals[this.gateIndex])) {
      this.gateIndex++;
      this.score += 1000 + Math.round(this.speed);
      this.event = 'gate';
      if (this.gateIndex === this.route.length) {
        this.completed = true;
        this.score += Math.max(0, Math.round(5000 - this.elapsed * 10));
        this.event = 'complete';
      }
    }
  }
}