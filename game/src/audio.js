// Code-generated engine sound: no audio assets, just WebAudio oscillators.
// A low sawtooth hum whose pitch follows the throttle, a filtered noise
// wash for wind speed, and short beeps for rings and warnings.

export function newAudio() {
  return {
    ctx: null,
    master: null,
    engineOsc: null,
    engineOsc2: null,
    engineGain: null,
    windSrc: null,
    windGain: null,
    windFilter: null,
    enabled: false,
    muted: false,
  };
}

export function ensureAudio(audio) {
  if (audio.ctx || audio.enabled) return;
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 52;
    const osc2 = ctx.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 104;
    const eg = ctx.createGain();
    eg.gain.value = 0.0;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 420;
    osc.connect(lp); osc2.connect(lp);
    lp.connect(eg); eg.connect(master);
    osc.start(); osc2.start();

    // Wind: looped noise buffer through a bandpass filter.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass'; bp.frequency.value = 700; bp.Q.value = 0.6;
    const wg = ctx.createGain();
    wg.gain.value = 0.0;
    src.connect(bp); bp.connect(wg); wg.connect(master);
    src.start();

    audio.ctx = ctx; audio.master = master;
    audio.engineOsc = osc; audio.engineOsc2 = osc2; audio.engineGain = eg;
    audio.windSrc = src; audio.windGain = wg; audio.windFilter = bp;
    audio.enabled = true;
  } catch {
    audio.enabled = false;
  }
}

export function updateAudio(audio, plane, flying) {
  if (!audio.enabled || !audio.ctx) return;
  const t = audio.ctx.currentTime;
  const throttle = flying ? plane.throttle : 0;
  const speed = flying ? plane.speed : 0;
  audio.engineOsc.frequency.setTargetAtTime(46 + throttle * 66, t, 0.08);
  audio.engineOsc2.frequency.setTargetAtTime(92 + throttle * 132, t, 0.08);
  audio.engineGain.gain.setTargetAtTime(audio.muted ? 0 : 0.05 + throttle * 0.075, t, 0.1);
  audio.windGain.gain.setTargetAtTime(audio.muted ? 0 : Math.min(0.16, speed * 0.0016), t, 0.15);
  audio.windFilter.frequency.setTargetAtTime(500 + speed * 14, t, 0.15);
}

export function beep(audio, freq, dur, type, vol) {
  if (!audio.enabled || !audio.ctx || audio.muted) return;
  try {
    const ctx = audio.ctx;
    const osc = ctx.createOscillator();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol || 0.18, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
    osc.connect(g); g.connect(audio.master);
    osc.start();
    osc.stop(ctx.currentTime + dur + 0.02);
  } catch { /* sound is decoration; never break the game */ }
}

export function ringChime(audio) { beep(audio, 880, 0.22, 'sine', 0.22); beep(audio, 1318, 0.3, 'sine', 0.14); }
export function warnBeep(audio) { beep(audio, 220, 0.16, 'square', 0.1); }
export function thud(audio) { beep(audio, 70, 0.3, 'triangle', 0.3); }
