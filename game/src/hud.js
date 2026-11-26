// HUD and screens for Kestrel Run: flight instruments, mission panel,
// menu, pause, mission-complete and crash screens. All text is drawn on
// the same canvas as the world, so screenshots show the full game.

import { formatTime, missionProgress, MISSIONS } from './missions.js';
import { clamp } from './rng.js';

function panel(ctx, x, y, w, h, alpha) {
  ctx.fillStyle = `rgba(10,16,24,${alpha || 0.72})`;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 8);
  ctx.fill();
  ctx.strokeStyle = 'rgba(200,220,240,0.25)';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function bar(ctx, x, y, w, h, frac, color, bg) {
  ctx.fillStyle = bg || 'rgba(255,255,255,0.18)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w * clamp(frac, 0, 1), h);
}

function headingName(heading) {
  const deg = ((heading * 180) / Math.PI % 360 + 360) % 360;
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return `${names[Math.round(deg / 45) % 8]} ${Math.round(deg)}°`;
}

export function drawHud(ctx, w, h, plane, mission, view) {
  ctx.textBaseline = 'alphabetic';
  // Top-left: primary flight instruments.
  panel(ctx, 14, 12, 218, 96);
  ctx.fillStyle = '#eef4fa';
  ctx.font = 'bold 22px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`${Math.round(plane.speed * 3.6)} km/h`, 26, 40);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = '#b8c8d8';
  ctx.fillText(`ALT  ${Math.round(plane.y)} m`, 26, 62);
  ctx.fillText(`HDG  ${headingName(plane.heading)}`, 26, 82);
  ctx.fillText(`V/S  ${plane.verticalSpeed >= 0 ? '+' : ''}${plane.verticalSpeed.toFixed(1)} m/s`, 26, 100);

  // Top-right: throttle, fuel, damage.
  panel(ctx, w - 232, 12, 218, 96);
  ctx.fillStyle = '#eef4fa';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('THROTTLE', w - 220, 34);
  bar(ctx, w - 220, 40, 194, 9, plane.throttle, '#f2a81d');
  ctx.fillText('FUEL', w - 220, 64);
  bar(ctx, w - 220, 70, 194, 9, plane.fuel / 100, plane.fuel < 20 ? '#ff5a3c' : '#7ee2a8');
  ctx.fillText('DAMAGE', w - 220, 94);
  bar(ctx, w - 220, 100, 194, 9, plane.damage / 100, '#ff5a3c');

  // Mission panel, top centre.
  const missionW = 380;
  panel(ctx, w / 2 - missionW / 2, 12, missionW, 62);
  ctx.fillStyle = '#f2c14e';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`${mission.def.name} — ${mission.def.tag}`, w / 2, 34);
  ctx.fillStyle = '#eef4fa';
  ctx.font = '14px system-ui, sans-serif';
  const clock = mission.def.id === 'trial'
    ? `TIME LEFT ${formatTime(Math.max(0, mission.clock))}`
    : `TIME ${formatTime(mission.elapsed)}`;
  ctx.fillText(`${missionProgress(mission)}   •   ${clock}   •   SCORE ${mission.score}`, w / 2, 58);

  // Stall / low-fuel warnings.
  if (plane.speed < 26 && !plane.landed) {
    ctx.fillStyle = '#ff5a3c';
    ctx.font = 'bold 20px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚠ STALL — NOSE DOWN, ADD POWER', w / 2, h * 0.3);
  } else if (plane.fuel < 20 && !mission.done) {
    ctx.fillStyle = '#ffb03c';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('LOW FUEL — find a runway', w / 2, h * 0.3);
  }

  // Transient mission messages.
  ctx.font = 'bold 17px system-ui, sans-serif';
  ctx.textAlign = 'center';
  mission.messages.forEach((m, i) => {
    ctx.fillStyle = `rgba(238,244,250,${Math.max(0, 1 - m.t / 4).toFixed(2)})`;
    ctx.fillText(m.text, w / 2, h * 0.36 + i * 24);
  });

  // Bottom hint bar.
  ctx.fillStyle = 'rgba(10,16,24,0.6)';
  ctx.fillRect(0, h - 26, w, 26);
  ctx.fillStyle = '#b8c8d8';
  ctx.font = '13px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('W/S pitch  •  A/D bank  •  SHIFT/CTRL throttle  •  C camera (' + view + ')  •  SPACE drop crate / brake  •  M missions  •  R restart  •  P pause', w / 2, h - 8);
}

export function drawMenu(ctx, w, h, selected) {
  ctx.fillStyle = 'rgba(8,14,24,0.55)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f2c14e';
  ctx.font = 'bold 54px system-ui, sans-serif';
  ctx.fillText('KESTREL RUN', w / 2, h * 0.22);
  ctx.fillStyle = '#eef4fa';
  ctx.font = '20px system-ui, sans-serif';
  ctx.fillText('Meridian Ridge Courier — one plane, one valley, four sorties', w / 2, h * 0.22 + 34);
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillStyle = '#b8c8d8';
  ctx.fillText('Fly the mail plane through the rings, land her on Kestrel Field, drop the crate on the high strip.', w / 2, h * 0.22 + 62);
  ctx.fillText('Mind your fuel and your wings — the ridge does not forgive a stall.', w / 2, h * 0.22 + 86);

  const boxW = 560;
  const rowH = 62;
  const top = h * 0.42;
  MISSIONS.forEach((m, i) => {
    const y = top + i * (rowH + 10);
    const sel = i === selected;
    panel(ctx, w / 2 - boxW / 2, y, boxW, rowH, sel ? 0.92 : 0.6);
    if (sel) {
      ctx.strokeStyle = '#f2c14e';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(w / 2 - boxW / 2, y, boxW, rowH, 8);
      ctx.stroke();
    }
    ctx.fillStyle = sel ? '#f2c14e' : '#eef4fa';
    ctx.font = 'bold 18px system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`${i + 1}. ${m.name}`, w / 2 - boxW / 2 + 18, y + 26);
    ctx.fillStyle = '#b8c8d8';
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(m.brief, w / 2 - boxW / 2 + 18, y + 47);
  });

  ctx.fillStyle = '#eef4fa';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('↑ ↓ choose sortie  •  ENTER or CLICK to fly  •  mouse steers too', w / 2, top + 4 * (rowH + 10) + 8);
}

export function drawPause(ctx, w, h) {
  ctx.fillStyle = 'rgba(8,14,24,0.6)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = '#eef4fa';
  ctx.font = 'bold 40px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('PAUSED', w / 2, h / 2 - 8);
  ctx.font = '16px system-ui, sans-serif';
  ctx.fillText('P to resume  •  R to restart  •  M for missions', w / 2, h / 2 + 26);
}

export function drawEnd(ctx, w, h, plane, mission) {
  const ok = mission.result === 'complete';
  const crashed = plane.crashed;
  ctx.fillStyle = crashed ? 'rgba(40,8,4,0.72)' : 'rgba(8,18,12,0.72)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.fillStyle = ok ? '#7ee2a8' : crashed ? '#ff5a3c' : '#f2c14e';
  ctx.font = 'bold 46px system-ui, sans-serif';
  const title = crashed ? 'CRASHED' : ok ? 'SORTIE COMPLETE' : 'SORTIE FAILED';
  ctx.fillText(title, w / 2, h * 0.3);
  ctx.fillStyle = '#eef4fa';
  ctx.font = '19px system-ui, sans-serif';
  const sub = crashed
    ? 'The Kestrel is down in the valley. The courier walks home — the mail does not.'
    : ok ? `${mission.def.name} flown clean. The valley crew buys the coffee.` : `${mission.def.name} — the valley keeps its secrets this time.`;
  ctx.fillText(sub, w / 2, h * 0.3 + 34);

  const rows = [
    ['Score', String(mission.score)],
    ['Time', formatTime(mission.elapsed)],
    ['Top altitude', `${Math.round(plane.maxAltitude)} m`],
    ['Fuel left', `${Math.round(plane.fuel)}%`],
    ['Damage', `${Math.round(plane.damage)}%`],
  ];
  if (mission.breakdown) {
    rows.splice(1, 0, ['Time bonus', `+${mission.breakdown.timeBonus}`]);
    rows.splice(2, 0, ['Fuel bonus', `+${mission.breakdown.fuelBonus}`]);
    rows.splice(3, 0, ['Clean flying', `+${mission.breakdown.cleanBonus}`]);
  }
  ctx.font = '17px system-ui, sans-serif';
  rows.forEach((r, i) => {
    const y = h * 0.44 + i * 30;
    ctx.fillStyle = '#b8c8d8';
    ctx.textAlign = 'right';
    ctx.fillText(r[0], w / 2 - 10, y);
    ctx.fillStyle = '#eef4fa';
    ctx.textAlign = 'left';
    ctx.fillText(r[1], w / 2 + 10, y);
  });
  ctx.fillStyle = '#f2c14e';
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('R restart  •  M choose another sortie  •  ENTER fly again', w / 2, h * 0.44 + rows.length * 30 + 26);
}
