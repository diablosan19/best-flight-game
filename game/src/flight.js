// Flight model for the Kestrel courier plane.
// Position is world metres: x east, y altitude, z north along the valley.
// Heading 0 = north (+Z). Speed in m/s, throttle 0..1. The model rewards
// smooth flying: hard banks bleed speed, stalls bite below flying speed,
// and a steep descent into the ground is a crash, not a landing.

import { clamp, wrapAngle } from './rng.js';
import { groundHeight, onRunway, onStrip } from './terrain.js';

export const FLIGHT = {
  maxSpeed: 92,        // m/s at full throttle, level
  cruiseSpeed: 58,
  stallSpeed: 24,      // below this the wing stops flying
  maxThrottle: 1,
  gravity: 9.8,
  fuelCapacity: 100,
  fuelBurn: 0.55,      // fuel units per second at full throttle
  damagePerHardHit: 34,
};

export function newPlane() {
  return {
    x: 0, y: 120, z: 300,          // start airborne over the valley mouth
    heading: 0, pitch: 0, roll: 0,
    speed: 52,
    throttle: 0.62,
    fuel: 100,
    damage: 0,
    verticalSpeed: 0,
    gearDown: true,
    crashed: false,
    landed: false,
    landedAt: null,               // 'runway' | 'strip' | 'field'
    airTime: 0,
    maxAltitude: 120,
  };
}

// One physics step. `ctl` is {pitch, roll, throttle, brake} in -1..1 ranges
// (throttle is an absolute target 0..1). Returns an event string or null:
// 'stall' | 'terrain' | 'landed-runway' | 'landed-strip' | 'landed-field'.
export function stepFlight(plane, ctl, dt) {
  if (plane.crashed) return null;

  // --- throttle and thrust ---
  plane.throttle = clamp(ctl.throttle, 0, 1);
  const thrust = plane.throttle * 34;
  const drag = 0.0042 * plane.speed * plane.speed + 0.9;
  const bankDrag = Math.abs(plane.roll) * 2.2;
  let accel = thrust - drag - bankDrag;
  // Pitch trades speed for altitude and back.
  accel -= Math.sin(plane.pitch) * 22;
  plane.speed = clamp(plane.speed + accel * dt, 0, FLIGHT.maxSpeed + 12);

  // --- attitude: roll steers, pitch climbs and dives ---
  const rollRate = 1.9;
  const pitchRate = 1.15;
  const targetRoll = clamp(ctl.roll, -1, 1) * 0.85;
  const targetPitch = clamp(ctl.pitch, -1, 1) * 0.42;
  plane.roll += (targetRoll - plane.roll) * Math.min(1, rollRate * dt);
  plane.pitch += (targetPitch - plane.pitch) * Math.min(1, pitchRate * dt);

  // Turn rate follows bank; steeper bank turns harder and loses lift.
  const turnRate = -Math.sin(plane.roll) * 0.62 * clamp(plane.speed / 55, 0.2, 1.15);
  plane.heading = wrapAngle(plane.heading + turnRate * dt);

  // --- lift, stall, vertical speed ---
  const stalled = plane.speed < FLIGHT.stallSpeed;
  const liftFactor = stalled ? 0.35 : 1;
  const climb = Math.sin(plane.pitch) * plane.speed * liftFactor
    - (stalled ? 6.5 : 0)                       // stalled wing sinks fast
    - (1 - Math.cos(plane.roll)) * 4.5;         // banked turn sinks
  plane.verticalSpeed = climb;
  plane.y += climb * dt;

  // --- forward motion ---
  const fx = Math.sin(plane.heading);
  const fz = Math.cos(plane.heading);
  plane.x += fx * plane.speed * dt;
  plane.z += fz * plane.speed * dt;
  // Soft valley walls: the ridge pushes the plane back toward the valley.
  if (Math.abs(plane.x) > 700) {
    plane.x = Math.sign(plane.x) * 700;
    plane.heading = wrapAngle(plane.heading + (plane.x > 0 ? -0.02 : 0.02));
  }
  if (plane.z < 40) { plane.z = 40; plane.heading = wrapAngle(Math.PI - plane.heading); }
  if (plane.z > 8160) { plane.z = 8160; plane.heading = wrapAngle(Math.PI - plane.heading); }

  // --- fuel and air time ---
  plane.fuel = Math.max(0, plane.fuel - plane.throttle * FLIGHT.fuelBurn * dt);
  if (plane.fuel <= 0 && plane.throttle > 0.15) plane.throttle = 0.15; // sputtering reserve
  plane.airTime += dt;
  if (plane.y > plane.maxAltitude) plane.maxAltitude = plane.y;

  // --- ground contact ---
  const ground = groundHeight(plane.x, plane.z);
  if (plane.y <= ground + 2.2) {
    const descent = -plane.verticalSpeed;
    const gentle = descent < 3.2 && plane.speed < 46 && Math.abs(plane.roll) < 0.25 && Math.abs(plane.pitch) < 0.2;
    plane.y = ground + 2.2;
    if (gentle) {
      plane.landed = true;
      plane.speed = Math.max(0, plane.speed - 26 * dt);
      if (plane.speed < 2) {
        if (onRunway(plane.x, plane.z)) { plane.landedAt = 'runway'; return 'landed-runway'; }
        if (onStrip(plane.x, plane.z)) { plane.landedAt = 'strip'; return 'landed-strip'; }
        plane.landedAt = 'field';
        return 'landed-field';
      }
      return 'rolling';
    }
    // Hard contact: damage scales with impact energy.
    const impact = descent * 3 + Math.max(0, plane.speed - 40);
    plane.damage += Math.min(100, impact * 2.2 + 12);
    plane.y = ground + 2.2;
    plane.speed *= 0.55;
    if (plane.damage >= 100 || descent > 14) {
      plane.crashed = true;
      return 'terrain';
    }
    return 'bounce';
  }
  plane.landed = false;
  if (stalled && plane.y > ground + 30) return 'stall';
  return null;
}

export function resetPlane(plane, spot) {
  const fresh = newPlane();
  Object.assign(plane, fresh, spot || {});
}
