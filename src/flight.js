import { Body, Sphere, Vec3, World } from 'cannon-es';

export const CELL = 100;
export const EXTENT = 12000;
export const FUJI = { x: -500, z: -5500 };
export const ROUTE = [
  { x: 0, y: 1120, z: -200, name: 'Lake approach' },
  { x: -950, y: 1390, z: -2300, name: 'Lakeside climb' },
  { x: -3100, y: 2110, z: -4300, name: 'Western ridge' },
  { x: -2200, y: 3130, z: -6200, name: 'Snow line' },
  { x: -450, y: 3680, z: -5600, name: 'Summit pass' },
  { x: 2150, y: 2540, z: -5400, name: 'Eastern descent' },
  { x: 2600, y: 1540, z: -2800, name: 'Forest run' },
  { x: 700, y: 1130, z: 800, name: 'Homeward' },
];
export const GATE_RADIUS = 165;
export const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
export const lerp = (start, end, amount) => start + (end - start) * amount;
export function lakeDistance(worldX, worldZ) {
  const shape = Math.hypot((worldX - 150) / 2520, (worldZ - 50) / 2100);
  return shape + Math.sin(worldX * 0.0017 + worldZ * 0.002) * 0.035 + Math.sin(worldZ * 0.0032) * 0.025;
}
export function terrainHeight(worldX, worldZ) {
  const radial = Math.hypot((worldX - FUJI.x) * 0.98, worldZ - FUJI.z);
  const angle = Math.atan2(worldZ - FUJI.z, worldX - FUJI.x);
  const ridge = 1 + Math.sin(angle * 9 + radial * 0.0008) * 0.035 + Math.cos(angle * 15) * 0.016;
  const volcano = 3480 * Math.pow(Math.max(0, 1 - radial / (3800 * ridge)), 1.28)
    - 280 * Math.exp(-Math.pow(radial / 175, 2));
  const rolling = 130 + 105 * Math.sin(worldX * 0.00073 + worldZ * 0.00024)
    + 90 * Math.cos(worldZ * 0.00082 - worldX * 0.0002)
    + 42 * Math.sin(worldX * 0.0019) * Math.cos(worldZ * 0.0018);
  const highlands = Math.pow(clamp((Math.abs(worldX) - 2600) / 4200, 0, 1), 0.8) * 650;
  const lakeshore = lakeDistance(worldX, worldZ);
  const land = lakeshore < 0.98 ? -45 : lakeshore < 1.04 ? 52
    : lerp(52, Math.max(76, rolling + highlands), clamp((lakeshore - 1.04) / 0.32, 0, 1));
  return Math.round(Math.max(land, volcano > 140 ? volcano : -100) / 26) * 26;
}
export function groundHeight(worldX, worldZ) {
  const sampleX = Math.floor(worldX / CELL) * CELL + CELL / 2;
  const sampleZ = Math.floor(worldZ / CELL) * CELL + CELL / 2;
  return Math.max(38, terrainHeight(sampleX, sampleZ));
}
export function crossedGate(previous, current, gate, normal, radius = GATE_RADIUS - 15) {
  const previousSide = (previous.x - gate.x) * normal.x + (previous.y - gate.y) * normal.y + (previous.z - gate.z) * normal.z;
  const currentSide = (current.x - gate.x) * normal.x + (current.y - gate.y) * normal.y + (current.z - gate.z) * normal.z;
  if (previousSide * currentSide > 0 || Math.abs(previousSide - currentSide) < 0.00001) return false;
  const fraction = previousSide / (previousSide - currentSide);
  const offsetX = lerp(previous.x, current.x, fraction) - gate.x;
  const offsetY = lerp(previous.y, current.y, fraction) - gate.y;
  const offsetZ = lerp(previous.z, current.z, fraction) - gate.z;
  return Math.hypot(offsetX, offsetY, offsetZ) < radius;
}
export const GATE_NORMALS = ROUTE.map((gate, index) => {
  const previous = index === 0 ? { x: 0, y: 1100, z: 1800 } : ROUTE[index - 1];
  const normal = new Vec3(gate.x - previous.x, gate.y - previous.y, gate.z - previous.z);
  normal.normalize();
  return normal;
});

export function autopilotInput(flight) {
  const target = ROUTE[Math.min(flight.gateIndex, ROUTE.length - 1)];
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
  constructor() {
    this.world = new World({ gravity: new Vec3(0, -9.81, 0) });
    this.body = new Body({ mass: 13000, shape: new Sphere(4), linearDamping: 0, angularDamping: 1 });
    this.world.addBody(this.body);
    this.forward = new Vec3();
    this.previous = new Vec3();
    this.reset();
  }
  reset() {
    this.body.position.set(0, 1100, 1800);
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
    this.clearance = 1062;
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
    this.clearance = this.body.position.y - groundHeight(this.body.position.x, this.body.position.z);
    if (this.clearance < 6) {
      this.crashed = true;
      this.event = 'crash';
    } else if (Math.abs(this.body.position.x) > EXTENT - 300 || Math.abs(this.body.position.z) > EXTENT - 300 || this.body.position.y > 11000) {
      this.crashed = true;
      this.event = 'boundary';
    } else if (!this.freeFlight && this.gateIndex < ROUTE.length && crossedGate(this.previous, this.body.position, ROUTE[this.gateIndex], GATE_NORMALS[this.gateIndex])) {
      this.gateIndex++;
      this.score += 1000 + Math.round(this.speed);
      this.event = 'gate';
      if (this.gateIndex === ROUTE.length) {
        this.completed = true;
        this.score += Math.max(0, Math.round(5000 - this.elapsed * 10));
        this.event = 'complete';
      }
    }
  }
}