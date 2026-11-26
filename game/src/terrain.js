// Procedural Meridian Ridge valley: heightfield, river, town, runways.
// The valley runs along +Z. |x| < 140 is flat valley floor; the ridges rise
// on both flanks. Everything is a pure function of (x, z) with a fixed
// seed, so the world never changes between loads.

import { valueNoise1, valueNoise2, clamp, smoothstep, lerp } from './rng.js';

export const WORLD = {
  seed: 20261126,
  valleyHalf: 140,      // flat valley floor half-width (metres)
  ridgeStart: 260,      // where the mountains begin to climb
  ridgeHeight: 320,     // ridge crest height above the floor
  worldLength: 8200,    // valley runs z = 0 .. 8200
  townZ: 3400,          // riverside town centre
  runwayZ: 6100,        // main runway centre (Kestrel Field)
  runwayLength: 700,
  runwayWidth: 46,
  stripZ: 7600,         // mountain cargo strip centre
  stripX: -300,
};

export function riverX(z) {
  return -46 + 34 * Math.sin(z * 0.0038) + 12 * valueNoise1(WORLD.seed + 7, z * 0.0012);
}

// Ground height in metres at world (x, z). Valley floor is ~0.
export function groundHeight(x, z) {
  const ax = Math.abs(x);
  const wall = smoothstep(WORLD.ridgeStart, 620, ax);
  const ridge = valueNoise2(WORLD.seed, x * 0.0016, z * 0.0016) * 0.55
    + valueNoise2(WORLD.seed + 31, x * 0.004, z * 0.004) * 0.28
    + valueNoise2(WORLD.seed + 77, x * 0.011, z * 0.011) * 0.17;
  let h = wall * WORLD.ridgeHeight * (0.55 + 0.45 * (ridge * 0.5 + 0.5));
  // Gentle rolling bumps on the valley floor.
  h += (1 - wall) * (valueNoise2(WORLD.seed + 5, x * 0.006, z * 0.006) * 6 + 3);
  // River carves a shallow channel.
  const rx = riverX(z);
  const dRiver = Math.abs(x - rx);
  if (dRiver < 26) h = lerp(-3, h, smoothstep(6, 26, dRiver));
  // Flatten the runway and the cargo strip pads.
  h = flattenPad(h, x, z, 0, WORLD.runwayZ, WORLD.runwayLength / 2 + 60, WORLD.runwayWidth / 2 + 40);
  h = flattenPad(h, x, z, WORLD.stripX, WORLD.stripZ, 260, 90);
  return h;
}

function flattenPad(h, x, z, cx, cz, halfLen, halfWid) {
  const dx = Math.abs(x - cx);
  const dz = Math.abs(z - cz);
  if (dx < halfWid && dz < halfLen) {
    const edge = smoothstep(0.55, 1, Math.max(dx / halfWid, dz / halfLen));
    return lerp(0, h, edge);
  }
  return h;
}

// What the ground looks like at (x, z): 'grass' | 'rock' | 'snow' | 'water' | 'runway' | 'town'.
export function groundKind(x, z) {
  const h = groundHeight(x, z);
  if (Math.abs(x - riverX(z)) < 14 && h < 1) return 'water';
  if (Math.abs(x) < WORLD.runwayWidth / 2 + 4 && Math.abs(z - WORLD.runwayZ) < WORLD.runwayLength / 2) return 'runway';
  if (Math.abs(x - WORLD.stripX) < 34 && Math.abs(z - WORLD.stripZ) < 200) return 'runway';
  if (h > 235) return 'snow';
  if (h > 90) return 'rock';
  if (Math.abs(x - 120) < 90 && Math.abs(z - WORLD.townZ) < 260) return 'town';
  return 'grass';
}

export function onRunway(x, z) {
  return Math.abs(x) < WORLD.runwayWidth / 2 && Math.abs(z - WORLD.runwayZ) < WORLD.runwayLength / 2;
}

export function onStrip(x, z) {
  return Math.abs(x - WORLD.stripX) < 30 && Math.abs(z - WORLD.stripZ) < 190;
}

// Ring course: eight rings weaving down the valley, each a target to fly through.
export function buildRings() {
  const zs = [900, 1600, 2300, 3000, 3800, 4600, 5400, 6600];
  const xs = [0, -70, 60, -40, 90, -80, 30, 0];
  const ys = [90, 130, 110, 160, 120, 150, 100, 80];
  return zs.map((z, i) => ({ x: xs[i], y: ys[i], z, r: 26, passed: false }));
}

// Time-trial gates: five checkpoints on a straight fast line.
export function buildGates() {
  const zs = [1200, 2600, 4000, 5400, 6800];
  return zs.map((z, i) => ({ x: (i % 2 === 0 ? -50 : 50), y: 110, z, r: 30, passed: false }));
}

// Scattered cloud puffs, fixed positions, for the sky band.
export function buildClouds() {
  const clouds = [];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + valueNoise1(WORLD.seed + 101, i) * 0.3;
    clouds.push({
      angle: a,
      height: 0.12 + valueNoise1(WORLD.seed + 103, i * 3) * 0.08 + 0.1,
      size: 34 + Math.abs(valueNoise1(WORLD.seed + 107, i * 7)) * 66,
      speed: 0.004 + Math.abs(valueNoise1(WORLD.seed + 109, i * 11)) * 0.008,
    });
  }
  return clouds;
}

// Town building footprints (x, z, width, depth, height) for the renderer.
export function buildTown() {
  const houses = [];
  for (let i = 0; i < 34; i++) {
    const gx = 60 + (i % 6) * 26 + valueNoise1(WORLD.seed + 201, i) * 10;
    const gz = WORLD.townZ - 240 + Math.floor(i / 6) * 86 + valueNoise1(WORLD.seed + 203, i * 2) * 22;
    houses.push({
      x: gx, z: gz,
      w: 14 + Math.abs(valueNoise1(WORLD.seed + 205, i * 3)) * 10,
      d: 12 + Math.abs(valueNoise1(WORLD.seed + 207, i * 5)) * 10,
      h: 10 + Math.abs(valueNoise1(WORLD.seed + 209, i * 7)) * 22,
      roof: i % 3,
    });
  }
  return houses;
}

export function clampToWorld(x, z) {
  return {
    x: clamp(x, -720, 720),
    z: clamp(z, 60, WORLD.worldLength - 60),
  };
}
