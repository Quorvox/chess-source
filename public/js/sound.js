// Звуки: файлы Lichess sfx, а если не загрузились, синтез в браузере (WebAudio). Громкость и выключатель в настройках.
import { getPrefs } from './skins.js';

let ctx = null, master = null, noiseBuf = null;

// Звуки Lichess (набор sfx, Enigmahack, AGPLv3+). Если файл не загрузился, играет запасной синтезированный звук
const FILES = ['Move', 'Capture', 'Check', 'Victory', 'Defeat', 'Draw', 'GenericNotify', 'LowTime', 'NewChallenge'];
const buffers = {};
let loading = false;

function preload(c) {
  if (loading) return;
  loading = true;
  for (const n of FILES) {
    fetch(`/sounds/lichess-sfx/${n}.mp3`).then((r) => (r.ok ? r.arrayBuffer() : Promise.reject())).then((b) => c.decodeAudioData(b)).then((buf) => { buffers[n] = buf; }).catch(() => { /* останется синтез */ });
  }
}

function sample(c, name, gain = 1) {
  if (getPrefs().sfxSet !== 'lichess') return false; // другие наборы синтезируются
  const buf = buffers[name];
  if (!buf) return false;
  const src = c.createBufferSource(), g = c.createGain();
  src.buffer = buf;
  g.gain.value = gain;
  src.connect(g).connect(master);
  src.start();
  return true;
}

function ac() {
  const p = getPrefs();
  if (!p.sound) return null;
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
    master = ctx.createGain();
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.3, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  master.gain.value = Math.max(0, Math.min(1, p.vol));
  preload(ctx);
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(c, f, t, dur, { type = 'sine', gain = 0.25, to = 0 } = {}) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function knock(c, t, { power = 1, freq = 900 } = {}) {
  const n = c.createBufferSource();
  n.buffer = noiseBuf;
  const f = c.createBiquadFilter(), g = c.createGain();
  f.type = 'bandpass';
  f.frequency.value = freq;
  f.Q.value = 1.1;
  g.gain.setValueAtTime(0.5 * power, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  n.connect(f).connect(g).connect(master);
  n.start(t);
  n.stop(t + 0.1);
  tone(c, 170 - power * 20, t, 0.1, { gain: 0.35 * power, to: 60 });
}

const seq = (c, notes, step, opts) => notes.forEach((f, i) => tone(c, f, c.currentTime + i * step, step * 2.2, opts));

// наборы без файлов: ноты синтезируются. lichess играет mp3, wood — стук дерева (запасной синтез выше)
const SETS = {
  soft: { type: 'sine', gain: 0.2, step: 0.07, move: [440], capture: [330, 440], check: [880, 1175], castle: [440, 523], promote: [523, 784, 1047], win: [523, 659, 784, 1047], lose: [392, 330, 262, 196], draw: [440, 440], found: [659, 880, 1175], challenge: [659, 880, 1175], lowTime: [1000, 1000] },
  retro: { type: 'square', gain: 0.07, step: 0.055, move: [330], capture: [220, 165], check: [660, 880, 660], castle: [330, 392], promote: [392, 523, 659, 784], win: [392, 523, 659, 784, 1047], lose: [330, 262, 196, 147], draw: [330, 330, 330], found: [523, 659, 784], challenge: [523, 659, 784], lowTime: [880, 880] },
};
// true, если набор сыграл сам
function setPlay(c, name) {
  const s = SETS[getPrefs().sfxSet];
  if (!s || !s[name]) return false;
  seq(c, s[name], s.step, { type: s.type, gain: s.gain });
  return true;
}
const play = (name, fallback) => { const c = ac(); if (c && !setPlay(c, name)) fallback(c); };

export const sfx = {
  unlock() { ac(); },
  move() { play('move', (c) => { if (!sample(c, 'Move')) knock(c, c.currentTime); }); },
  capture() { play('capture', (c) => { if (sample(c, 'Capture')) return; knock(c, c.currentTime, { power: 1.4, freq: 700 }); knock(c, c.currentTime + 0.05, { power: 0.8, freq: 1300 }); }); },
  castle() { play('castle', (c) => { if (buffers.Move && getPrefs().sfxSet === 'lichess') { sample(c, 'Move'); setTimeout(() => sample(c, 'Move'), 130); return; } knock(c, c.currentTime); knock(c, c.currentTime + 0.12, { power: 0.9 }); }); },
  check() { play('check', (c) => { if (sample(c, 'Check')) return; knock(c, c.currentTime); tone(c, 880, c.currentTime + 0.08, 0.14, { type: 'triangle', gain: 0.18 }); tone(c, 1175, c.currentTime + 0.18, 0.2, { type: 'triangle', gain: 0.18 }); }); },
  promote() { play('promote', (c) => { if (!sample(c, 'Capture')) seq(c, [523, 659, 784, 1047], 0.07, { gain: 0.16 }); }); },
  win() { play('win', (c) => { if (!sample(c, 'Victory')) seq(c, [523, 659, 784, 1047], 0.11, { type: 'triangle', gain: 0.2 }); }); },
  lose() { play('lose', (c) => { if (!sample(c, 'Defeat')) seq(c, [392, 330, 262, 196], 0.14, { type: 'triangle', gain: 0.2 }); }); },
  draw() { play('draw', (c) => { if (!sample(c, 'Draw')) seq(c, [440, 440], 0.16, { type: 'triangle', gain: 0.18 }); }); },
  found() { play('found', (c) => { if (!sample(c, 'GenericNotify')) seq(c, [659, 880, 1175], 0.13, { gain: 0.22 }); }); },
  lowTime() { play('lowTime', (c) => { sample(c, 'LowTime'); }); },
  challenge() { play('challenge', (c) => { if (!sample(c, 'NewChallenge')) seq(c, [659, 880, 1175], 0.13, { gain: 0.22 }); }); },
  tick() { const c = ac(); if (c) tone(c, 1300, c.currentTime, 0.03, { gain: 0.05 }); },
  error() { const c = ac(); if (c) tone(c, 140, c.currentTime, 0.18, { type: 'sawtooth', gain: 0.12 }); },
};

/** Звук по последнему ходу в записи SAN */
export function moveSound(san) {
  if (/#/.test(san)) return sfx.check();
  if (/\+/.test(san)) return sfx.check();
  if (/^O-O/.test(san)) return sfx.castle();
  if (/=/.test(san)) return sfx.promote();
  if (/x/.test(san)) return sfx.capture();
  return sfx.move();
}
