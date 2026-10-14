// Tiny synthesized sound kit (Web Audio, no files). Soft, short, and easy to turn off.
const KEY = 'mindmap.sound';
let ctx = null;

export const soundOn = () => localStorage.getItem(KEY) !== 'off';
export const setSoundOn = (on) => localStorage.setItem(KEY, on ? 'on' : 'off');

function audio() {
  if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

// Browsers only allow audio after a user gesture; call once at startup.
export function unlockSoundOnFirstTap() {
  const unlock = () => { try { audio(); } catch { /* no audio */ } };
  window.addEventListener('pointerdown', unlock, { once: true });
}

function tone(c, { freq, at = 0, dur = 0.18, type = 'sine', vol = 0.18, slide = 0 }) {
  const t = c.currentTime + at;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slide) osc.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(vol, t + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.02);
}

function noise(c, { at = 0, dur = 0.22, vol = 0.08, from = 1800, to = 400 }) {
  const t = c.currentTime + at;
  const buf = c.createBuffer(1, Math.floor(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  const filter = c.createBiquadFilter();
  const gain = c.createGain();
  src.buffer = buf;
  filter.type = 'bandpass';
  filter.frequency.setValueAtTime(from, t);
  filter.frequency.exponentialRampToValueAtTime(to, t + dur);
  gain.gain.setValueAtTime(vol, t);
  src.connect(filter).connect(gain).connect(c.destination);
  src.start(t);
}

// Notes of a major pentatonic scale, so any combination sounds pleasant.
const SCALE = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.66, 1318.5];

const SOUNDS = {
  // Task done. `step` raises the pitch for each task done in a row.
  complete: (c, step = 0) => {
    const base = SCALE[Math.min(step, SCALE.length - 2)];
    tone(c, { freq: base, dur: 0.12, vol: 0.16 });
    tone(c, { freq: base * 1.5, at: 0.07, dur: 0.22, vol: 0.14 });
  },
  uncheck: (c) => tone(c, { freq: 420, dur: 0.1, vol: 0.08, slide: 0.8 }),
  tap: (c) => tone(c, { freq: 880, dur: 0.05, vol: 0.06, type: 'triangle' }),
  grow: (c) => [0, 2, 4].forEach((n, i) => tone(c, { freq: SCALE[n], at: i * 0.07, dur: 0.2, vol: 0.12, type: 'triangle' })),
  levelup: (c) => [0, 2, 4, 5].forEach((n, i) => tone(c, { freq: SCALE[n], at: i * 0.08, dur: 0.26, vol: 0.13, type: 'triangle' })),
  bloom: (c) => {
    [0, 2, 4, 7].forEach((n, i) => tone(c, { freq: SCALE[n], at: i * 0.1, dur: 0.35, vol: 0.13, type: 'triangle' }));
    tone(c, { freq: SCALE[5], at: 0.45, dur: 0.6, vol: 0.1 });
  },
  sparkle: (c) => [7, 5, 7].forEach((n, i) => tone(c, { freq: SCALE[n] * 1.5, at: i * 0.06, dur: 0.14, vol: 0.07 })),
  whoosh: (c) => noise(c, { dur: 0.24, vol: 0.09 }),
  undo: (c) => noise(c, { dur: 0.2, vol: 0.07, from: 400, to: 1600 }),
  error: (c) => tone(c, { freq: 180, dur: 0.18, vol: 0.12, type: 'triangle', slide: 0.7 }),
};

export function play(name, arg) {
  if (!soundOn() || !SOUNDS[name]) return;
  try {
    SOUNDS[name](audio(), arg);
  } catch {
    /* audio unavailable */
  }
}

// A light tap on phones that support it.
export function buzz(ms = 12) {
  if (soundOn() && navigator.vibrate) navigator.vibrate(ms);
}
