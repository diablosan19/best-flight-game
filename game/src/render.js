// World renderer for Kestrel Run: sky, projected valley terrain, river,
// runway, town, rings, the Kestrel aircraft (chase and cockpit views) and
// smoke/dust particles. All drawing is Canvas 2D, no assets, no network.

import { valueNoise1, clamp, lerp } from './rng.js';
import { groundHeight, groundKind, riverX, WORLD, buildTown } from './terrain.js';

const TOWN = buildTown();
const PALETTE = {
  grass: [74, 124, 52], grassDark: [52, 96, 40],
  rock: [112, 104, 96], rockDark: [84, 78, 72],
  snow: [232, 238, 244], snowDark: [198, 208, 220],
  water: [52, 120, 168], waterDark: [36, 90, 138],
  runway: [74, 74, 80], town: [150, 128, 96],
};
const SKY_TOP = [38, 92, 168];
const SKY_HORIZON = [196, 222, 238];
const FOG = [196, 214, 228];

function mix(a, b, t) {
  return `rgb(${Math.round(lerp(a[0], b[0], t))},${Math.round(lerp(a[1], b[1], t))},${Math.round(lerp(a[2], b[2], t))})`;
}
function fogColor(base, dist, maxDist) {
  return mix(base, FOG, clamp(dist / maxDist, 0, 0.82));
}

// Project a world point into screen space. Returns null if behind the camera.
export function project(plane, focal, cx, horizonY, wx, wy, wz) {
  const dx = wx - plane.x;
  const dz = wz - plane.z;
  const sh = Math.sin(plane.heading);
  const ch = Math.cos(plane.heading);
  const forward = dx * sh + dz * ch;
  if (forward < 10) return null;
  const lateral = dx * ch - dz * sh;
  return {
    x: cx + (lateral * focal) / forward,
    y: horizonY + ((plane.y - wy) * focal) / forward,
    d: forward,
    s: focal / forward,
  };
}

export function newParticles() { return []; }

export function spawnSmoke(particles, plane, n) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x: plane.x + (Math.random() - 0.5) * 4,
      y: plane.y - 1 + (Math.random() - 0.5) * 2,
      z: plane.z - 6 - Math.random() * 8,
      vx: (Math.random() - 0.5) * 3, vy: 1 + Math.random() * 2, vz: -4,
      life: 0, max: 1.6 + Math.random(),
      size: 3 + Math.random() * 5, color: '120,120,118',
    });
  }
  if (particles.length > 220) particles.splice(0, particles.length - 220);
}

export function spawnDebris(particles, plane, n) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x: plane.x + (Math.random() - 0.5) * 6,
      y: plane.y + (Math.random() - 0.5) * 4,
      z: plane.z + (Math.random() - 0.5) * 6,
      vx: (Math.random() - 0.5) * 26, vy: 4 + Math.random() * 16, vz: (Math.random() - 0.5) * 26,
      life: 0, max: 1.2 + Math.random() * 0.8,
      size: 2 + Math.random() * 4, color: '232,120,40',
    });
  }
}

function drawSky(ctx, w, h, plane, focal, clouds) {
  const horizonY = h * 0.52 - plane.pitch * focal * 0.9;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, `rgb(${SKY_TOP[0]},${SKY_TOP[1]},${SKY_TOP[2]})`);
  grad.addColorStop(0.55, `rgb(${SKY_HORIZON[0]},${SKY_HORIZON[1]},${SKY_HORIZON[2]})`);
  grad.addColorStop(1, '#c8d8c0');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Sun: fixed in the west, so its screen position swings with heading.
  const sunAngle = Math.atan2(-0.8, 0.6); // west-northwest
  let rel = sunAngle - plane.heading;
  while (rel > Math.PI) rel -= Math.PI * 2;
  while (rel < -Math.PI) rel += Math.PI * 2;
  const sunX = w / 2 + rel * focal * 1.1;
  const sunY = horizonY - h * 0.16;
  if (sunX > -80 && sunX < w + 80) {
    const glow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 90);
    glow.addColorStop(0, 'rgba(255,244,200,0.95)');
    glow.addColorStop(0.25, 'rgba(255,226,150,0.55)');
    glow.addColorStop(1, 'rgba(255,226,150,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(sunX - 95, sunY - 95, 190, 190);
    ctx.fillStyle = '#fff6cf';
    ctx.beginPath(); ctx.arc(sunX, sunY, 20, 0, Math.PI * 2); ctx.fill();
  }

  // Clouds drift slowly with the wind.
  for (const c of clouds) {
    let a = c.angle - plane.heading;
    while (a > Math.PI) a -= Math.PI * 2;
    while (a < -Math.PI) a += Math.PI * 2;
    const cx = w / 2 + a * focal * 1.6;
    const cy = horizonY - c.height * h;
    if (cx < -220 || cx > w + 220) continue;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, c.size, c.size * 0.32, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - c.size * 0.5, cy + 4, c.size * 0.6, c.size * 0.22, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + c.size * 0.5, cy + 3, c.size * 0.55, c.size * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  return horizonY;
}

function drawFarRidge(ctx, w, horizonY, plane) {
  ctx.fillStyle = 'rgba(96,118,150,0.85)';
  ctx.beginPath();
  ctx.moveTo(0, horizonY + 4);
  for (let x = 0; x <= w; x += 14) {
    const worldAngle = (x - w / 2) / 900 + plane.heading;
    const n = valueNoise1(99, worldAngle * 3.1) * 0.5 + valueNoise1(55, worldAngle * 9.7) * 0.22;
    const ridgeY = horizonY - 30 - (n + 0.7) * 70;
    ctx.lineTo(x, ridgeY);
  }
  ctx.lineTo(w, horizonY + 4);
  ctx.closePath();
  ctx.fill();
  // Snow dusting on the far peaks.
  ctx.fillStyle = 'rgba(238,242,248,0.8)';
  ctx.beginPath();
  for (let x = 0; x <= w; x += 14) {
    const worldAngle = (x - w / 2) / 900 + plane.heading;
    const n = valueNoise1(99, worldAngle * 3.1) * 0.5 + valueNoise1(55, worldAngle * 9.7) * 0.22;
    const ridgeY = horizonY - 30 - (n + 0.7) * 70;
    if (n > 0.35) { ctx.moveTo(x, ridgeY); ctx.lineTo(x + 7, ridgeY - 8); ctx.lineTo(x + 14, ridgeY); ctx.closePath(); }
  }
  ctx.fill();
}

function drawTerrain(ctx, w, h, plane, focal, cx, horizonY) {
  const sh = Math.sin(plane.heading);
  const ch = Math.cos(plane.heading);
  const slices = 42;
  const maxD = 3400;
  const depths = [];
  for (let i = 0; i <= slices; i++) depths.push(50 * Math.pow(maxD / 50, i / slices));
  const lateralSteps = 26;
  const halfSpan = 780;
  // Precompute projected rows: rows[i][j] = {x, y}
  const rows = depths.map((d) => {
    const pts = [];
    const cz = plane.z + ch * d;
    const cxw = plane.x + sh * d;
    for (let j = 0; j <= lateralSteps; j++) {
      const lat = -halfSpan + (2 * halfSpan * j) / lateralSteps;
      const wx = cxw + ch * lat;
      const wz = cz - sh * lat;
      const gh = groundHeight(wx, wz);
      pts.push({
        x: cx + (lat * focal) / d,
        y: horizonY + ((plane.y - gh) * focal) / d,
        kind: groundKind(wx, wz),
        h: gh,
      });
    }
    return { d, pts };
  });
  // Paint far to near so near ribbons overlap far ones. Each ribbon is
  // split into lateral segments coloured by the ground under that segment,
  // so a narrow runway or river never paints the whole valley its colour.
  for (let i = rows.length - 1; i > 0; i--) {
    const far = rows[i];
    const near = rows[i - 1];
    for (let j = 0; j < lateralSteps; j++) {
      const n0 = near.pts[j];
      const n1 = near.pts[j + 1];
      const f0 = far.pts[j];
      const f1 = far.pts[j + 1];
      const base = PALETTE[n0.kind] || PALETTE.grass;
      ctx.fillStyle = fogColor(base, far.d, maxD);
      ctx.beginPath();
      ctx.moveTo(n0.x, n0.y);
      ctx.lineTo(n1.x, n1.y);
      ctx.lineTo(f1.x, f1.y);
      ctx.lineTo(f0.x, f0.y);
      ctx.closePath();
      ctx.fill();
    }
  }
}

function drawRiver(ctx, plane, focal, cx, horizonY) {
  ctx.strokeStyle = 'rgba(52,120,168,0.9)';
  ctx.lineCap = 'round';
  for (let d = 120; d < 3200; d += 110) {
    const z = plane.z + Math.cos(plane.heading) * d;
    const x = riverX(z);
    const p1 = project(plane, focal, cx, horizonY, x, groundHeight(x, z) + 1, z);
    const z2 = z + 110 * Math.cos(plane.heading);
    const p2 = project(plane, focal, cx, horizonY, riverX(z2), groundHeight(riverX(z2), z2) + 1, z2);
    if (!p1 || !p2) continue;
    ctx.lineWidth = Math.max(1, Math.min(20, 16 * p1.s * 0.09));
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
  }
}

function drawRunway(ctx, plane, focal, cx, horizonY) {
  // Keep the near end in front of the camera even when the plane is
  // already over the runway, so the strip stays visible on final.
  const z0 = Math.max(WORLD.runwayZ - WORLD.runwayLength / 2, plane.z + 25);
  const z1 = WORLD.runwayZ + WORLD.runwayLength / 2;
  const hw = WORLD.runwayWidth / 2;
  const c = [
    project(plane, focal, cx, horizonY, -hw, 1, z0),
    project(plane, focal, cx, horizonY, hw, 1, z0),
    project(plane, focal, cx, horizonY, hw, 1, z1),
    project(plane, focal, cx, horizonY, -hw, 1, z1),
  ];
  if (c.some((p) => !p)) return;
  ctx.fillStyle = 'rgba(64,64,70,0.95)';
  ctx.beginPath();
  ctx.moveTo(c[0].x, c[0].y); ctx.lineTo(c[1].x, c[1].y);
  ctx.lineTo(c[2].x, c[2].y); ctx.lineTo(c[3].x, c[3].y);
  ctx.closePath(); ctx.fill();
  // Centreline dashes.
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  for (let z = z0 + 30; z < z1 - 20; z += 90) {
    const a = project(plane, focal, cx, horizonY, 0, 1.5, z);
    const b = project(plane, focal, cx, horizonY, 0, 1.5, z + 45);
    if (!a || !b) continue;
    ctx.lineWidth = Math.max(1, 2.4 * a.s);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  }
  // Threshold numbers: "27" painted at the near end.
  const t = project(plane, focal, cx, horizonY, 0, 1.5, z0 + 60);
  if (t && t.d > 140 && t.d < 2400) {
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `bold ${Math.max(9, Math.min(46, 30 * t.s))}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('27', t.x, t.y);
  }
}

function drawTown(ctx, plane, focal, cx, horizonY) {
  for (const house of TOWN) {
    const p = project(plane, focal, cx, horizonY, house.x, groundHeight(house.x, house.z), house.z);
    if (!p || p.d > 3000) continue;
    const wpx = Math.max(2, house.w * p.s);
    const hpx = Math.max(2, house.h * p.s);
    ctx.fillStyle = house.roof === 0 ? '#b0603c' : house.roof === 1 ? '#7a5a3a' : '#5a6a7a';
    ctx.fillRect(p.x - wpx / 2, p.y - hpx, wpx, hpx);
    ctx.fillStyle = 'rgba(240,230,210,0.9)';
    ctx.fillRect(p.x - wpx / 2, p.y - hpx * 0.28, wpx, hpx * 0.28);
  }
}

function drawRing(ctx, plane, focal, cx, horizonY, ring, isGate, index, total) {
  const p = project(plane, focal, cx, horizonY, ring.x, ring.y, ring.z);
  if (!p || p.d > 4200) return;
  const r = ring.r * p.s;
  if (r < 2) return;
  const passed = ring.passed;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.lineWidth = Math.max(2, r * 0.14);
  ctx.strokeStyle = passed ? 'rgba(80,200,110,0.9)' : isGate ? '#f2a81d' : '#ff5a3c';
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  ctx.lineWidth = Math.max(1, r * 0.05);
  ctx.strokeStyle = 'rgba(255,255,255,0.9)';
  ctx.beginPath(); ctx.arc(0, 0, r * 0.82, 0, Math.PI * 2); ctx.stroke();
  if (r > 26) {
    ctx.fillStyle = passed ? '#50c86e' : '#ffffff';
    ctx.font = `bold ${Math.round(r * 0.42)}px system-ui, sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(index + 1), 0, 1);
  }
  ctx.restore();
}

function drawAircraftChase(ctx, w, h, plane) {
  const cx = w / 2;
  const cy = h * 0.66;
  const scale = Math.min(w, h) / 720;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-plane.roll * 0.85);
  ctx.scale(scale, scale);
  // Soft shadow blob beneath the plane on the ground is implied by a dark ellipse.
  ctx.fillStyle = 'rgba(20,30,40,0.18)';
  ctx.beginPath(); ctx.ellipse(0, 118, 90, 10, 0, 0, Math.PI * 2); ctx.fill();
  // Tailplane.
  ctx.fillStyle = '#c23b2e';
  ctx.beginPath();
  ctx.moveTo(-58, -58); ctx.lineTo(-96, -84); ctx.lineTo(-88, -62); ctx.lineTo(-52, -44);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(58, -58); ctx.lineTo(96, -84); ctx.lineTo(88, -62); ctx.lineTo(52, -44);
  ctx.closePath(); ctx.fill();
  // Main wings.
  ctx.fillStyle = '#e8e2d2';
  ctx.beginPath();
  ctx.moveTo(-14, -30); ctx.lineTo(-218, -72); ctx.lineTo(-226, -48); ctx.lineTo(-18, 6);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(14, -30); ctx.lineTo(218, -72); ctx.lineTo(226, -48); ctx.lineTo(18, 6);
  ctx.closePath(); ctx.fill();
  // Wing red/green tip lights.
  ctx.fillStyle = '#ff2e2e'; ctx.beginPath(); ctx.arc(-222, -60, 6, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#2eff5a'; ctx.beginPath(); ctx.arc(222, -60, 6, 0, Math.PI * 2); ctx.fill();
  // Fuselage (seen from behind, tapering away).
  const fus = ctx.createLinearGradient(-26, 0, 26, 0);
  fus.addColorStop(0, '#8f2f24');
  fus.addColorStop(0.5, '#d8442f');
  fus.addColorStop(1, '#8f2f24');
  ctx.fillStyle = fus;
  ctx.beginPath();
  ctx.moveTo(-30, 52); ctx.quadraticCurveTo(-34, -40, -16, -78);
  ctx.lineTo(16, -78); ctx.quadraticCurveTo(34, -40, 30, 52);
  ctx.quadraticCurveTo(0, 66, -30, 52);
  ctx.closePath(); ctx.fill();
  // Cabin windows.
  ctx.fillStyle = '#bfe3f2';
  ctx.beginPath(); ctx.ellipse(0, -52, 13, 9, 0, 0, Math.PI * 2); ctx.fill();
  // Tail fin.
  ctx.fillStyle = '#c23b2e';
  ctx.beginPath();
  ctx.moveTo(-8, -72); ctx.lineTo(-4, -118); ctx.lineTo(10, -112); ctx.lineTo(12, -72);
  ctx.closePath(); ctx.fill();
  // Kestrel stripe + registration.
  ctx.fillStyle = '#f2c14e';
  ctx.fillRect(-30, 18, 60, 7);
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('KESTREL', 0, 44);
  ctx.restore();
}

function drawCockpit(ctx, w, h, plane, mission) {
  const panelTop = h * 0.68;
  // Glareshield and panel.
  const grad = ctx.createLinearGradient(0, panelTop, 0, h);
  grad.addColorStop(0, '#1c2430');
  grad.addColorStop(0.12, '#2a3442');
  grad.addColorStop(1, '#12161d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, panelTop, w, h - panelTop);
  ctx.fillStyle = '#0d1117';
  ctx.fillRect(0, panelTop, w, 5);
  // Nose tip visible over the panel.
  ctx.fillStyle = '#d8442f';
  ctx.beginPath();
  ctx.moveTo(w / 2 - 46, panelTop + 2);
  ctx.lineTo(w / 2, panelTop - 26);
  ctx.lineTo(w / 2 + 46, panelTop + 2);
  ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#f2c14e';
  ctx.fillRect(w / 2 - 46, panelTop - 2, 92, 4);

  const gauge = (gx, gy, gr, label, drawNeedle) => {
    ctx.save();
    ctx.translate(gx, gy);
    ctx.fillStyle = '#0a0e13';
    ctx.beginPath(); ctx.arc(0, 0, gr, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#5a6a7c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.arc(0, 0, gr, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = '#e8e2d2'; ctx.lineWidth = 1;
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * gr * 0.82, Math.sin(a) * gr * 0.82);
      ctx.lineTo(Math.cos(a) * gr * 0.94, Math.sin(a) * gr * 0.94);
      ctx.stroke();
    }
    drawNeedle(gr);
    ctx.fillStyle = '#cfd8e2';
    ctx.font = `bold ${Math.max(10, gr * 0.24)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, 0, gr + 16);
    ctx.restore();
  };

  const gy = panelTop + (h - panelTop) * 0.44;
  const gr = Math.min(52, (h - panelTop) * 0.34);
  const gx1 = w * 0.22, gx2 = w * 0.5, gx3 = w * 0.78;

  // Airspeed.
  gauge(gx1, gy, gr, 'AIRSPEED', (r) => {
    const a = -Math.PI * 0.75 + (clamp(plane.speed, 0, 100) / 100) * Math.PI * 1.5;
    ctx.strokeStyle = '#ff5a3c'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8); ctx.stroke();
  });
  // Attitude indicator: horizon ball that rolls and pitches.
  gauge(gx2, gy, gr, 'ATTITUDE', (r) => {
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r * 0.92, 0, Math.PI * 2); ctx.clip();
    ctx.rotate(-plane.roll);
    const dy = clamp(plane.pitch, -0.5, 0.5) * r * 1.4;
    ctx.fillStyle = '#3a7bd5'; ctx.fillRect(-r, -r + dy, r * 2, r);
    ctx.fillStyle = '#8a6a3a'; ctx.fillRect(-r, dy, r * 2, r);
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(-r, dy); ctx.lineTo(r, dy); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#f2c14e';
    ctx.fillRect(-r * 0.5, -2, r, 4);
  });
  // Altimeter.
  gauge(gx3, gy, gr, 'ALTITUDE', (r) => {
    const a = -Math.PI * 0.75 + (clamp(plane.y, 0, 600) / 600) * Math.PI * 1.5;
    ctx.strokeStyle = '#7ee2a8'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * r * 0.8, Math.sin(a) * r * 0.8); ctx.stroke();
  });

  // Compass strip.
  const headings = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const deg = ((plane.heading * 180) / Math.PI % 360 + 360) % 360;
  ctx.fillStyle = '#0a0e13';
  ctx.fillRect(w * 0.36, panelTop + 8, w * 0.28, 22);
  ctx.strokeStyle = '#5a6a7c';
  ctx.strokeRect(w * 0.36, panelTop + 8, w * 0.28, 22);
  ctx.fillStyle = '#e8e2d2';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${headings[Math.round(deg / 45) % 8]}  ${Math.round(deg)}°`, w * 0.5, panelTop + 24);

  // Throttle + fuel bars on the right.
  const bx = w * 0.88, by = panelTop + 14, bh = h - panelTop - 30;
  ctx.fillStyle = '#0a0e13';
  ctx.fillRect(bx, by, 16, bh);
  ctx.fillStyle = '#f2a81d';
  ctx.fillRect(bx, by + bh * (1 - plane.throttle), 16, bh * plane.throttle);
  ctx.fillStyle = '#cfd8e2';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('THR', bx + 8, by - 4);
  const fx = w * 0.915;
  ctx.fillStyle = '#0a0e13';
  ctx.fillRect(fx, by, 16, bh);
  ctx.fillStyle = plane.fuel < 20 ? '#ff5a3c' : '#7ee2a8';
  ctx.fillRect(fx, by + bh * (1 - plane.fuel / 100), 16, bh * (plane.fuel / 100));
  ctx.fillText('FUEL', fx + 8, by - 4);
}

function drawParticles(ctx, particles, plane, focal, cx, horizonY, dt) {
  for (const p of particles) {
    p.life += dt;
    p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
    const s = project(plane, focal, cx, horizonY, p.x, p.y, p.z);
    if (!s) continue;
    const a = Math.max(0, 1 - p.life / p.max);
    ctx.fillStyle = `rgba(${p.color},${(a * 0.55).toFixed(2)})`;
    const r = Math.max(1.5, p.size * s.s * 0.12);
    ctx.beginPath(); ctx.arc(s.x, s.y, r, 0, Math.PI * 2); ctx.fill();
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    if (particles[i].life >= particles[i].max) particles.splice(i, 1);
  }
}

// Full world frame. `view` is 'chase' | 'cockpit'.
export function drawWorld(ctx, w, h, plane, mission, clouds, particles, view, dt, flash) {
  const focal = Math.min(w, h) * 0.85;
  const cx = w / 2;
  ctx.save();
  // Roll the world, not the HUD.
  ctx.translate(cx, h * 0.52);
  ctx.rotate(plane.roll * 0.45);
  ctx.translate(-cx, -h * 0.52);
  const horizonY = drawSky(ctx, w, h, plane, focal, clouds);
  drawFarRidge(ctx, w, horizonY, plane);
  drawTerrain(ctx, w, h, plane, focal, cx, horizonY);
  drawRiver(ctx, plane, focal, cx, horizonY);
  drawRunway(ctx, plane, focal, cx, horizonY);
  drawTown(ctx, plane, focal, cx, horizonY);
  const rings = mission.def.id === 'rings' ? mission.rings : mission.def.id === 'trial' ? mission.gates : [];
  rings.forEach((r, i) => drawRing(ctx, plane, focal, cx, horizonY, r, mission.def.id === 'trial', i, rings.length));
  // Cargo drop marker over the strip.
  if (mission.def.id === 'cargo' && !mission.dropped) {
    const p = project(plane, focal, cx, horizonY, WORLD.stripX, 60, WORLD.stripZ);
    if (p && p.d < 4200) {
      ctx.strokeStyle = '#f2c14e';
      ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(6, 26 * p.s), 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#f2c14e';
      ctx.font = `bold ${Math.max(11, 18 * p.s)}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('DROP ZONE', p.x, p.y - Math.max(10, 30 * p.s));
    }
  }
  drawParticles(ctx, particles, plane, focal, cx, horizonY, dt);
  ctx.restore();

  if (view === 'chase') drawAircraftChase(ctx, w, h, plane);
  else drawCockpit(ctx, w, h, plane, mission);

  if (flash > 0) {
    ctx.fillStyle = `rgba(255,90,40,${Math.min(0.5, flash).toFixed(2)})`;
    ctx.fillRect(0, 0, w, h);
  }
}
