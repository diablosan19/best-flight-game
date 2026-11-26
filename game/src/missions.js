// Missions for Kestrel Run: four sorties with different goals, scored on
// completion time, fuel left and how cleanly the plane was flown.

import { buildRings, buildGates, WORLD } from './terrain.js';
import { clamp } from './rng.js';

export const MISSIONS = [
  {
    id: 'rings',
    name: 'RING RUN',
    tag: 'Kestrel Ridge Course',
    brief: 'Thread all 8 rings down the valley. Fast and smooth wins — a missed ring costs 15 seconds.',
    start: { x: 0, y: 110, z: 420, heading: 0, speed: 55, throttle: 0.7 },
    par: 150,
  },
  {
    id: 'landing',
    name: 'VALLEY LANDING',
    tag: 'Kestrel Field Approach',
    brief: 'Bring her down on the Kestrel Field runway (z 6100). Gentle descent, slow and level, or she bounces.',
    start: { x: 40, y: 220, z: 4700, heading: 0, speed: 48, throttle: 0.45 },
    par: 120,
  },
  {
    id: 'cargo',
    name: 'CARGO DROP',
    tag: 'High Strip Supply Run',
    brief: 'Carry the crate to the mountain strip (z 7600). Press SPACE low over the strip, under 45 m/s, to drop it on target.',
    start: { x: -120, y: 150, z: 5900, heading: 0, speed: 55, throttle: 0.65 },
    par: 150,
  },
  {
    id: 'trial',
    name: 'TIME TRIAL',
    tag: 'Meridian Dash',
    brief: 'Five gates, one clock. Every gate adds a 4-second bonus to your remaining time. Finish under par.',
    start: { x: 0, y: 110, z: 500, heading: 0, speed: 60, throttle: 0.85 },
    par: 135,
  },
];

export function newMissionState(missionId) {
  const def = MISSIONS.find((m) => m.id === missionId) || MISSIONS[0];
  return {
    def,
    rings: def.id === 'rings' ? buildRings() : [],
    gates: def.id === 'trial' ? buildGates() : [],
    ringIndex: 0,
    gateIndex: 0,
    elapsed: 0,
    clock: def.id === 'trial' ? def.par + 40 : 0, // trial counts down
    dropped: false,
    dropResult: null, // 'hit' | 'miss' | null
    done: false,
    result: null,     // 'complete' | 'failed'
    score: 0,
    misses: 0,
    messages: [],
  };
}

function addMessage(state, text) {
  state.messages.push({ text, t: 0 });
  if (state.messages.length > 3) state.messages.shift();
}

// Advance mission logic one tick. `plane` is the live flight state.
// `dropPressed` is true on the frame SPACE was pressed.
// Returns 'complete' | 'failed' | null.
export function stepMission(state, plane, dropPressed, dt) {
  if (state.done) return state.result;
  state.elapsed += dt;
  if (state.def.id === 'trial') state.clock -= dt;
  for (const m of state.messages) m.t += dt;
  state.messages = state.messages.filter((m) => m.t < 4);

  const def = state.def;

  if (def.id === 'rings') {
    const ring = state.rings[state.ringIndex];
    if (ring) {
      const dz = plane.z - ring.z;
      if (dz > -8 && dz < 30) {
        const dx = plane.x - ring.x;
        const dy = plane.y - ring.y;
        const dist = Math.hypot(dx, dy);
        if (dist < ring.r) {
          ring.passed = true;
          state.ringIndex++;
          addMessage(state, `RING ${state.ringIndex} / 8 — clean!`);
          state.score += 100;
          if (state.ringIndex >= state.rings.length) return finish(state, plane, 'complete');
        }
      } else if (dz >= 30) {
        state.misses++;
        state.ringIndex++;
        addMessage(state, `Ring missed — +15s penalty`);
        state.elapsed += 15;
        if (state.ringIndex >= state.rings.length) return finish(state, plane, 'complete');
      }
    }
  }

  if (def.id === 'landing') {
    if (plane.landedAt === 'runway') {
      addMessage(state, 'Down on the runway — textbook!');
      return finish(state, plane, 'complete');
    }
    if (plane.landedAt === 'strip') return finish(state, plane, 'complete');
    if (plane.landedAt === 'field') {
      addMessage(state, 'Down in a field — the plane is fine, the runway was the goal.');
      return finish(state, plane, 'failed');
    }
  }

  if (def.id === 'cargo') {
    if (dropPressed && !state.dropped) {
      state.dropped = true;
      const onTarget = Math.abs(plane.x - WORLD.stripX) < 42
        && Math.abs(plane.z - WORLD.stripZ) < 210
        && plane.y < 90 && plane.speed < 48;
      state.dropResult = onTarget ? 'hit' : 'miss';
      if (onTarget) {
        addMessage(state, 'Crate on the strip — delivery complete!');
        return finish(state, plane, 'complete');
      }
      addMessage(state, 'Crate dropped wide — the strip crew shakes their heads.');
      return finish(state, plane, 'failed');
    }
    if (plane.landedAt === 'strip') {
      addMessage(state, 'Landed at the strip with the crate — delivered by hand!');
      return finish(state, plane, 'complete');
    }
  }

  if (def.id === 'trial') {
    const gate = state.gates[state.gateIndex];
    if (gate) {
      const dz = plane.z - gate.z;
      if (dz > -8 && dz < 30) {
        const dist = Math.hypot(plane.x - gate.x, plane.y - gate.y);
        if (dist < gate.r) {
          gate.passed = true;
          state.gateIndex++;
          state.clock += 4;
          state.score += 100;
          addMessage(state, `GATE ${state.gateIndex} / 5 — +4s`);
          if (state.gateIndex >= state.gates.length) return finish(state, plane, 'complete');
        }
      } else if (dz >= 30) {
        state.gateIndex++;
        addMessage(state, 'Gate missed — no bonus');
        if (state.gateIndex >= state.gates.length) return finish(state, plane, 'complete');
      }
    }
    if (state.clock <= 0) {
      addMessage(state, 'Clock ran out over the valley.');
      return finish(state, plane, 'failed');
    }
  }

  if (plane.fuel <= 0 && plane.y < 30 && !plane.landed) {
    addMessage(state, 'Fuel starved — dead-stick landing.');
  }
  return null;
}

function finish(state, plane, result) {
  state.done = true;
  state.result = result;
  const timeBonus = result === 'complete'
    ? Math.max(0, Math.round((state.def.par - state.elapsed) * 4))
    : 0;
  const fuelBonus = result === 'complete' ? Math.round(plane.fuel * 2) : 0;
  const cleanBonus = result === 'complete' ? Math.max(0, Math.round(100 - plane.damage)) : 0;
  state.score += timeBonus + fuelBonus + cleanBonus;
  state.breakdown = { timeBonus, fuelBonus, cleanBonus };
  return result;
}

export function missionProgress(state) {
  if (state.def.id === 'rings') return `${state.ringIndex} / ${state.rings.length} rings`;
  if (state.def.id === 'trial') return `${state.gateIndex} / ${state.gates.length} gates`;
  if (state.def.id === 'cargo') return state.dropped ? 'crate dropped' : 'carry the crate to the strip';
  return 'land on Kestrel Field runway';
}

export function formatTime(s) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec < 10 ? '0' : ''}${sec}`;
}
