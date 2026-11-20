import type { SoundPack } from './types';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = false;
let lastPlay: Record<string, number> = {};

export function setMuted(m: boolean) {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.5;
}

export function unlockAudio() {
  if (!ctx) {
    try {
      ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : 0.5;
      master.connect(ctx.destination);
    } catch {
      return;
    }
  }
  if (ctx.state === 'suspended') void ctx.resume();
}

function ok(key: string, gapMs: number) {
  if (muted || !ctx || !master) return false;
  const now = performance.now();
  if (now - (lastPlay[key] ?? 0) < gapMs) return false;
  lastPlay[key] = now;
  return true;
}

type Wave = OscillatorType;

function tone(freq: number, dur: number, type: Wave = 'sine', vol = 0.3, slideTo?: number, delay = 0) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(master);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol = 0.3, filter = 1200, type: BiquadFilterType = 'lowpass', delay = 0, sweepTo?: number) {
  if (!ctx || !master) return;
  const t = ctx.currentTime + delay;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(filter, t);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(master);
  src.start(t);
}

export function playKick(pack: SoundPack, power: number) {
  if (!ok('kick', 45)) return;
  const p = Math.min(1, power / 1000);
  switch (pack) {
    case 'laser':
      tone(1400 + p * 600, 0.09, 'sawtooth', 0.12, 300);
      break;
    case 'retro':
      tone(440 + p * 300, 0.06, 'square', 0.1, 220);
      break;
    case 'bass':
      tone(120 + p * 40, 0.14, 'sine', 0.45, 45);
      noise(0.04, 0.2, 800);
      break;
    case 'chime':
      tone(1200 + p * 400, 0.12, 'triangle', 0.18);
      break;
    case 'horn':
      tone(220, 0.08, 'sawtooth', 0.1, 180);
      noise(0.03, 0.15, 2000);
      break;
    default:
      noise(0.05, 0.35 + p * 0.2, 1800);
      tone(180, 0.05, 'sine', 0.25, 90);
  }
}

export function playHit() {
  if (!ok('hit', 60)) return;
  noise(0.03, 0.18, 2500, 'bandpass');
}

export function playWall() {
  if (!ok('wall', 60)) return;
  noise(0.04, 0.15, 600);
  tone(90, 0.05, 'sine', 0.12);
}

export function playGoal(pack: SoundPack) {
  if (!ok('goal', 300)) return;
  switch (pack) {
    case 'laser':
      [0, 0.08, 0.16].forEach((d, i) => tone(600 + i * 300, 0.25, 'sawtooth', 0.12, 2400, d));
      break;
    case 'retro':
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.12, 'square', 0.1, undefined, i * 0.08));
      break;
    case 'bass':
      tone(80, 0.6, 'sine', 0.6, 30);
      noise(0.5, 0.35, 400, 'lowpass');
      break;
    case 'chime':
      [880, 1109, 1319, 1760].forEach((f, i) => tone(f, 0.6, 'triangle', 0.15, undefined, i * 0.07));
      break;
    case 'horn':
      tone(233, 0.7, 'sawtooth', 0.15);
      tone(294, 0.7, 'sawtooth', 0.12);
      tone(349, 0.7, 'sawtooth', 0.1);
      break;
    default:
      noise(0.8, 0.25, 3000, 'bandpass', 0, 800);
      [392, 523, 659].forEach((f, i) => tone(f, 0.3, 'triangle', 0.18, undefined, i * 0.1));
  }
}

export function playPerk(perk: string) {
  if (!ok('perk-' + perk, 120)) return;
  switch (perk) {
    case 'fireball':
      noise(0.5, 0.35, 300, 'lowpass', 0, 3000);
      tone(200, 0.4, 'sawtooth', 0.1, 600);
      break;
    case 'burn':
      noise(0.2, 0.25, 1500, 'highpass');
      break;
    case 'thunder':
      noise(0.9, 0.6, 5000, 'lowpass', 0, 100);
      tone(60, 0.6, 'square', 0.2, 30);
      break;
    case 'freeze':
      [2000, 2600, 3200].forEach((f, i) => tone(f, 0.3, 'sine', 0.08, f * 1.5, i * 0.05));
      noise(0.3, 0.1, 6000, 'highpass');
      break;
    case 'clone':
      [500, 750, 1000].forEach((f, i) => tone(f, 0.18, 'triangle', 0.1, f * 0.5, i * 0.03));
      break;
    case 'phantom':
      tone(300, 0.5, 'sine', 0.15, 900);
      tone(305, 0.5, 'sine', 0.15, 880);
      break;
    case 'warp':
      tone(800, 0.7, 'sine', 0.2, 100);
      tone(400, 0.7, 'triangle', 0.1, 50);
      break;
    case 'shield':
      tone(400, 0.3, 'square', 0.12, 1200);
      noise(0.2, 0.15, 3000, 'bandpass');
      break;
    case 'hotstreak':
      [300, 450, 600, 900].forEach((f, i) => tone(f, 0.15, 'sawtooth', 0.08, undefined, i * 0.05));
      break;
  }
}

export function playShake() {
  if (!ok('shake', 300)) return;
  noise(0.25, 0.2, 200);
}

export function playWhistle(long = false) {
  if (!ok('whistle', 200)) return;
  tone(2200, long ? 0.6 : 0.25, 'sine', 0.15, 2100);
  tone(2250, long ? 0.6 : 0.25, 'sine', 0.1, 2150);
}

export function playOvertime() {
  if (!ok('ot', 500)) return;
  [440, 440, 660].forEach((f, i) => tone(f, 0.2, 'square', 0.1, undefined, i * 0.22));
}
