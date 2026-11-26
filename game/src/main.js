// Kestrel Run — entry point. Owns the game loop, the screen state machine
// (menu → flying → paused → ended) and the staged screenshot scenes the
// maker drives with ?shot=chase|cockpit|landing|menu.

import { newPlane, stepFlight, resetPlane } from './flight.js';
import { newMissionState, stepMission, MISSIONS } from './missions.js';
import { newInput, attachInput, readControls, endFrame, wasPressed } from './input.js';
import { newAudio, ensureAudio, updateAudio, ringChime, warnBeep, thud } from './audio.js';
import { drawWorld, newParticles, spawnSmoke, spawnDebris, } from './render.js';
import { drawHud, drawMenu, drawPause, drawEnd } from './hud.js';
import { buildClouds } from './terrain.js';
import { clamp, wrapAngle } from './rng.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');

const params = new URLSearchParams(location.search);
const shot = params.get('shot'); // chase | cockpit | landing | menu | null

const clouds = buildClouds();
const particles = newParticles();
const input = newInput();
const audio = newAudio();
attachInput(input, canvas);

let plane = newPlane();
let mission = newMissionState('rings');
let screen = 'menu';       // menu | flying | paused | ended
let menuSelected = 0;
let view = 'chase';        // chase | cockpit
let flash = 0;
let framesRendered = 0;
let lastStallBeep = 0;
let lastRingCount = 0;

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
}
window.addEventListener('resize', resize);
resize();

function startMission(index) {
  const def = MISSIONS[index];
  mission = newMissionState(def.id);
  plane = newPlane();
  resetPlane(plane, def.start);
  particles.length = 0;
  flash = 0;
  lastRingCount = 0;
  screen = 'flying';
  statusEl.textContent = `${def.name} started. ${def.brief}`;
  ensureAudio(audio);
}

// Staged scenes for screenshots: put the plane in a photogenic spot with
// the right mission and view, flying level on autopilot.
function applyShotScene() {
  if (shot === 'menu') { screen = 'menu'; return; }
  if (shot === 'cockpit') {
    startMission(1); // Valley Landing approach
    resetPlane(plane, { x: 18, y: 165, z: 5350, heading: 0.02, speed: 46, throttle: 0.5 });
    view = 'cockpit';
    return;
  }
  if (shot === 'landing') {
    startMission(1);
    resetPlane(plane, { x: 0, y: 34, z: 5780, heading: 0, speed: 40, throttle: 0.42 });
    view = 'chase';
    return;
  }
  // Default staged scene: Ring Run, mid-valley, rings ahead, chase view.
  startMission(0);
  resetPlane(plane, { x: 0, y: 95, z: 700, heading: 0, speed: 58, throttle: 0.66 });
  view = 'chase';
}

// Gentle autopilot used only for staged screenshots: holds altitude and
// wings level so the scene stays framed, and steers toward the next ring
// or gate so the course reads in the shot.
function autopilotControls(dt) {
  const targets = mission.def.id === 'rings' ? mission.rings : mission.def.id === 'trial' ? mission.gates : [];
  const next = targets.find((t) => !t.passed && t.z > plane.z - 10);
  let targetAlt = shot === 'landing' ? 30 : shot === 'cockpit' ? 150 : 125;
  let headingTarget = plane.heading;
  if (next) {
    targetAlt = next.y;
    headingTarget = Math.atan2(next.x - plane.x, next.z - plane.z);
  }
  const headingErr = wrapAngle(headingTarget - plane.heading);
  const altErr = clamp((targetAlt - plane.y) / 60, -0.5, 0.5);
  return {
    pitch: clamp(altErr * 0.6 - plane.verticalSpeed * 0.04, -0.5, 0.5),
    roll: clamp(headingErr * 1.6 - plane.roll * 1.2, -0.5, 0.5),
    throttle: shot === 'landing' ? 0.42 : 0.62,
    brake: false,
  };
}

function handleMenuKeys() {
  if (wasPressed(input, 'ArrowUp', 'w')) menuSelected = (menuSelected + MISSIONS.length - 1) % MISSIONS.length;
  if (wasPressed(input, 'ArrowDown', 's')) menuSelected = (menuSelected + 1) % MISSIONS.length;
  if (wasPressed(input, 'Enter') || input.clicked) {
    ensureAudio(audio);
    startMission(menuSelected);
  }
  // Number keys jump straight to a sortie.
  for (let i = 0; i < MISSIONS.length; i++) {
    if (wasPressed(input, String(i + 1))) { ensureAudio(audio); startMission(i); }
  }
}

function handleFlyingKeys(dt) {
  if (wasPressed(input, 'p', 'P', 'Escape')) { screen = 'paused'; return; }
  if (wasPressed(input, 'm', 'M')) { screen = 'menu'; return; }
  if (wasPressed(input, 'r', 'R')) { startMission(MISSIONS.indexOf(mission.def)); return; }
  if (wasPressed(input, 'c', 'C')) view = view === 'chase' ? 'cockpit' : 'chase';
}

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, Math.max(0.001, (now - last) / 1000));
  last = now;
  const w = canvas.width;
  const h = canvas.height;

  if (screen === 'menu') {
    handleMenuKeys();
  } else if (screen === 'paused') {
    if (wasPressed(input, 'p', 'P', 'Escape')) screen = 'flying';
    if (wasPressed(input, 'r', 'R')) startMission(MISSIONS.indexOf(mission.def));
    if (wasPressed(input, 'm', 'M')) screen = 'menu';
  } else if (screen === 'ended') {
    if (wasPressed(input, 'r', 'R') || wasPressed(input, 'Enter')) startMission(MISSIONS.indexOf(mission.def));
    if (wasPressed(input, 'm', 'M')) screen = 'menu';
  } else if (screen === 'flying') {
    handleFlyingKeys(dt);
    if (screen === 'flying') {
      const ctl = shot ? autopilotControls(dt) : readControls(input, plane, dt);
      const event = stepFlight(plane, ctl, dt);
      const dropPressed = input.dropQueued && !shot;
      const result = stepMission(mission, plane, dropPressed, dt);
      if (mission.rings.length + mission.gates.length > 0) {
        const done = (mission.rings.filter((r) => r.passed).length)
          + (mission.gates.filter((g) => g.passed).length);
        if (done > lastRingCount) { ringChime(audio); lastRingCount = done; }
      }
      if (event === 'terrain') {
        spawnDebris(particles, plane, 60);
        flash = 0.55;
        thud(audio);
        screen = 'ended';
      } else if (event === 'bounce') {
        thud(audio);
        flash = Math.max(flash, 0.2);
      } else if (event === 'stall' && now - lastStallBeep > 900) {
        warnBeep(audio);
        lastStallBeep = now;
      } else if (event === 'landed-runway' || event === 'landed-strip' || event === 'landed-field') {
        thud(audio);
      }
      if (plane.damage > 35 && Math.random() < dt * 6) spawnSmoke(particles, plane, 1);
      if (result) screen = 'ended';
      updateAudio(audio, plane, screen === 'flying');
    }
  }

  // --- draw ---
  ctx.clearRect(0, 0, w, h);
  if (screen === 'menu') {
    // Menu over a slow scenic flyover of the valley.
    const demo = { ...plane, z: 2000 + (now * 0.008) % 4000, y: 190, heading: 0, pitch: 0, roll: 0 };
    drawWorld(ctx, w, h, demo, mission, clouds, particles, 'chase', dt, 0);
    drawMenu(ctx, w, h, menuSelected);
  } else {
    drawWorld(ctx, w, h, plane, mission, clouds, particles, view, dt, flash);
    if (screen === 'flying' || screen === 'paused') drawHud(ctx, w, h, plane, mission, view);
    if (screen === 'paused') drawPause(ctx, w, h);
    if (screen === 'ended') drawEnd(ctx, w, h, plane, mission);
  }
  flash = Math.max(0, flash - dt * 1.4);

  framesRendered++;
  if (framesRendered === 4) window.__shotReady = true;
  endFrame(input, dt);
  requestAnimationFrame(frame);
}

if (shot) {
  applyShotScene();
} else {
  screen = 'menu';
}
requestAnimationFrame(frame);
