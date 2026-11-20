import { BALL_R, H, Match, MatchEvent, Rod, W } from './engine';
import type { Bot, GoalFx, Shape, Trail } from './types';
import * as sfx from './audio';

const M = 16; // wall margin

type PKind = 'dot' | 'square' | 'heart' | 'spark' | 'ring' | 'text' | 'bolt' | 'flake' | 'bubble' | 'star';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  kind: PKind;
  g?: number;
  drag?: number;
  text?: string;
  pts?: { x: number; y: number }[];
  rot?: number;
}

interface TrailPt {
  x: number;
  y: number;
  t: number;
}

const RAINBOW = ['#ff004d', '#ff8c00', '#ffe600', '#00e676', '#00b0ff', '#7c4dff'];

export function hexA(hex: string, a: number) {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

export function shapePath(ctx: CanvasRenderingContext2D, shape: Shape, x: number, y: number, hw: number, hh: number) {
  ctx.beginPath();
  switch (shape) {
    case 'round':
      ctx.ellipse(x, y, hw, hh, 0, 0, Math.PI * 2);
      break;
    case 'square':
      ctx.rect(x - hw, y - hh, hw * 2, hh * 2);
      break;
    case 'triangle':
      ctx.moveTo(x, y - hh * 1.2);
      ctx.lineTo(x + hw, y + hh);
      ctx.lineTo(x - hw, y + hh);
      ctx.closePath();
      break;
    case 'diamond':
      ctx.moveTo(x, y - hh * 1.3);
      ctx.lineTo(x + hw, y);
      ctx.lineTo(x, y + hh * 1.3);
      ctx.lineTo(x - hw, y);
      ctx.closePath();
      break;
    case 'hex':
      for (let i = 0; i < 6; i++) {
        const a = (Math.PI / 3) * i;
        const px = x + Math.cos(a) * hw;
        const py = y + Math.sin(a) * hh * 1.1;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
      break;
    case 'star':
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (Math.PI / 5) * i;
        const r = i % 2 ? 0.5 : 1.25;
        const px = x + Math.cos(a) * hw * r;
        const py = y + Math.sin(a) * hh * r * 1.1;
        if (i) ctx.lineTo(px, py);
        else ctx.moveTo(px, py);
      }
      ctx.closePath();
      break;
  }
}

export class Renderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  match: Match | null = null;
  particles: Particle[] = [];
  trail: TrailPt[] = [];
  shake = 0;
  flash = 0;
  flashColor = '#fff';
  banner: { text: string; color: string; t: number } | null = null;
  bolts: { pts: { x: number; y: number }[]; t: number }[] = [];
  shieldFx: { team: 0 | 1; x: number; t: number }[] = [];
  sound = true;
  time = 0;
  scale = 1;
  ox = 0;
  oy = 0;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
  }

  setMatch(m: Match | null) {
    this.match = m;
    this.particles = [];
    this.trail = [];
    this.bolts = [];
    this.shieldFx = [];
    this.banner = null;
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(r.width * this.dpr));
    const h = Math.max(1, Math.round(r.height * this.dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    const tw = W + M * 2;
    const th = H + M * 2;
    this.scale = Math.min(w / tw, h / th);
    this.ox = (w - tw * this.scale) / 2 + M * this.scale;
    this.oy = (h - th * this.scale) / 2 + M * this.scale;
  }

  bot(team: 0 | 1 | -1): Bot | null {
    if (!this.match || team < 0) return null;
    return this.match.teams[team as 0 | 1].bot;
  }

  // ---------- events ----------
  handle(events: MatchEvent[], lowFx = false) {
    const m = this.match;
    if (!m) return;
    for (const e of events) {
      switch (e.type) {
        case 'kick': {
          const b = m.teams[e.team].bot;
          if (this.sound) sfx.playKick(b.look.sound, e.power);
          if (!lowFx) this.burst(e.x, e.y, 5, b.look.accent, 80, 'spark', 0.25);
          break;
        }
        case 'hit':
          if (this.sound) sfx.playHit();
          break;
        case 'wall':
          if (this.sound) sfx.playWall();
          if (!lowFx) this.burst(e.x, e.y, 3, '#ffffff', 50, 'dot', 0.2);
          break;
        case 'shake':
          this.shake = Math.max(this.shake, 6);
          if (this.sound) sfx.playShake();
          break;
        case 'goal': {
          const b = m.teams[e.team].bot;
          if (this.sound) sfx.playGoal(b.look.sound);
          this.goalFx(b, e.x, e.y, e.team);
          this.banner = { text: 'GOAL!', color: b.look.color, t: 1.3 };
          this.trail = [];
          break;
        }
        case 'perk':
          this.perkFx(e.perk, e.team, e.x, e.y);
          break;
        case 'overtime':
          if (this.sound) sfx.playOvertime();
          this.banner = { text: 'SUDDEN DEATH', color: '#ff3b3b', t: 1.8 };
          this.flash = 0.4;
          this.flashColor = '#ff2020';
          break;
        case 'end':
          if (this.sound) sfx.playWhistle(true);
          break;
      }
    }
  }

  burst(x: number, y: number, n: number, color: string | string[], speed: number, kind: PKind, life: number, size = 2.5, g = 0) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s,
        life,
        max: life,
        color: Array.isArray(color) ? color[i % color.length] : color,
        size: size * (0.6 + Math.random() * 0.8),
        kind,
        g,
        drag: 1.5,
        rot: Math.random() * 6,
      });
    }
  }

  goalFx(bot: Bot, x: number, y: number, team: 0 | 1) {
    const c = bot.look.color;
    const a = bot.look.accent;
    const dirIn = team === 0 ? 1 : -1; // particles fly into the field
    const fx: GoalFx = bot.look.goalFx;
    this.flash = 0.25;
    this.flashColor = c;
    switch (fx) {
      case 'confetti':
        for (let i = 0; i < 90; i++) {
          this.particles.push({
            x: x + (Math.random() - 0.5) * 80,
            y,
            vx: (Math.random() - 0.5) * 300,
            vy: dirIn * (150 + Math.random() * 350),
            life: 1.8,
            max: 1.8,
            color: [c, a, '#ffffff', ...RAINBOW][i % 9],
            size: 3 + Math.random() * 2,
            kind: 'square',
            g: 0,
            drag: 1.4,
            rot: Math.random() * 6,
          });
        }
        break;
      case 'explosion':
        this.shake = 12;
        this.burst(x, y, 70, ['#ffef5a', '#ff8a00', '#ff3d00', c], 420, 'dot', 1, 4);
        this.burst(x, y, 30, ['#555', '#333'], 160, 'bubble', 1.4, 7);
        this.particles.push({ x, y, vx: 0, vy: 0, life: 0.6, max: 0.6, color: '#ffcf40', size: 160, kind: 'ring' });
        break;
      case 'fireworks':
        for (let k = 0; k < 5; k++) {
          const fx2 = 50 + Math.random() * (W - 100);
          const fy = team === 0 ? 60 + Math.random() * 160 : H - 60 - Math.random() * 160;
          setTimeout(() => {
            this.burst(fx2, fy, 40, [c, a, '#ffffff', RAINBOW[k]], 220, 'spark', 1.2, 3, 60);
            if (this.sound) sfx.playHit();
          }, k * 160);
        }
        break;
      case 'lightning':
        this.shake = 8;
        for (let k = 0; k < 4; k++) this.bolts.push({ pts: boltPts(x + (Math.random() - 0.5) * 120, team === 0 ? H * 0.6 : H * 0.4, x, y), t: 0.5 + k * 0.08 });
        this.burst(x, y, 40, ['#ffffff', a, c], 300, 'spark', 0.8, 3);
        this.flashColor = '#ffffff';
        this.flash = 0.45;
        break;
      case 'shockwave':
        for (let k = 0; k < 3; k++) {
          this.particles.push({ x, y, vx: 0, vy: 0, life: 0.8 + k * 0.25, max: 0.8 + k * 0.25, color: k % 2 ? a : c, size: 260 + k * 60, kind: 'ring' });
        }
        this.shake = 7;
        break;
      case 'hearts':
        for (let i = 0; i < 30; i++) {
          this.particles.push({
            x: x + (Math.random() - 0.5) * 100,
            y,
            vx: (Math.random() - 0.5) * 80,
            vy: dirIn * (60 + Math.random() * 200),
            life: 2,
            max: 2,
            color: i % 3 ? c : '#ff4d8d',
            size: 7 + Math.random() * 6,
            kind: 'heart',
            drag: 0.8,
          });
        }
        break;
      case 'pixels':
        for (let i = 0; i < 80; i++) {
          const px = x + Math.round(((Math.random() - 0.5) * 140) / 8) * 8;
          this.particles.push({
            x: px,
            y,
            vx: 0,
            vy: dirIn * (100 + Math.random() * 300),
            life: 1.5,
            max: 1.5,
            color: [c, a, '#ffffff'][i % 3],
            size: 6,
            kind: 'square',
            drag: 2,
          });
        }
        break;
    }
    this.particles.push({ x: W / 2, y: H / 2, vx: 0, vy: 0, life: 1.3, max: 1.3, color: c, size: 1, kind: 'text', text: bot.name.toUpperCase() });
  }

  perkFx(perk: string, team: 0 | 1, x: number, y: number) {
    const m = this.match!;
    const bot = m.teams[team].bot;
    if (this.sound) sfx.playPerk(perk);
    const label = (t: string, c: string) =>
      this.particles.push({ x, y: y + (team === 0 ? -24 : 24), vx: 0, vy: team === 0 ? -30 : 30, life: 1, max: 1, color: c, size: 0.6, kind: 'text', text: t });
    switch (perk) {
      case 'fireball':
        this.burst(x, y, 30, ['#ffd23f', '#ff7b00', '#ff2e00'], 220, 'dot', 0.6, 4);
        label('FIREBALL', '#ff8a00');
        break;
      case 'burn':
        this.burst(x, y, 20, ['#ff7b00', '#ffd23f', '#555'], 150, 'dot', 0.5, 3);
        break;
      case 'thunder': {
        this.shake = 10;
        this.flash = 0.35;
        this.flashColor = '#e6f0ff';
        const ty = team === 0 ? 0 : H;
        this.bolts.push({ pts: boltPts(x, y, x + (Math.random() - 0.5) * 80, ty), t: 0.45 });
        this.bolts.push({ pts: boltPts(Math.random() * W, team === 0 ? -10 : H + 10, x, y), t: 0.35 });
        this.burst(x, y, 30, ['#fff', '#7dd3fc', '#facc15'], 300, 'spark', 0.6, 3);
        label('THUNDER', '#facc15');
        break;
      }
      case 'freeze':
        for (const r of m.rods) {
          if (r.team === team) continue;
          for (let i = 0; i < r.n; i++) this.burst(m.figX(r, i), r.y, 4, ['#e0f2fe', '#7dd3fc'], 60, 'flake', 0.9, 4);
        }
        this.flash = 0.25;
        this.flashColor = '#7dd3fc';
        label('FREEZE', '#7dd3fc');
        break;
      case 'clone':
        this.burst(x, y, 20, [bot.look.color, '#c084fc'], 160, 'ring', 0.4, 6);
        label('SPLIT', '#c084fc');
        break;
      case 'phantom':
        this.burst(x, y, 16, ['#e9d5ff', '#a78bfa'], 90, 'bubble', 0.8, 5);
        label('BOO!', '#c4b5fd');
        break;
      case 'warp':
        this.particles.push({ x, y, vx: 0, vy: 0, life: 0.9, max: 0.9, color: '#a855f7', size: 200, kind: 'ring' });
        label('TIME WARP', '#c084fc');
        break;
      case 'shield':
        this.shieldFx.push({ team, x, t: 0.8 });
        this.burst(x, y, 24, ['#93c5fd', '#ffffff'], 200, 'spark', 0.6, 3);
        label('BLOCKED', '#93c5fd');
        break;
      case 'hotstreak':
        this.particles.push({ x: W / 2, y: H / 2 + 64, vx: 0, vy: 0, life: 1.2, max: 1.2, color: '#ff7b00', size: 0.55, kind: 'text', text: 'HOT STREAK' });
        break;
    }
  }

  // ---------- update/draw ----------
  update(dt: number) {
    this.time += dt;
    const m = this.match;
    this.shake = Math.max(0, this.shake - dt * 30);
    this.flash = Math.max(0, this.flash - dt);
    if (this.banner) {
      this.banner.t -= dt;
      if (this.banner.t <= 0) this.banner = null;
    }
    this.bolts.forEach((b) => (b.t -= dt));
    this.bolts = this.bolts.filter((b) => b.t > 0);
    this.shieldFx.forEach((s) => (s.t -= dt));
    this.shieldFx = this.shieldFx.filter((s) => s.t > 0);

    for (const p of this.particles) {
      p.life -= dt;
      p.vy += (p.g ?? 0) * dt;
      const d = Math.max(0, 1 - (p.drag ?? 0) * dt);
      p.vx *= d;
      p.vy *= d;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.rot !== undefined) p.rot += dt * 6;
    }
    this.particles = this.particles.filter((p) => p.life > 0);
    if (this.particles.length > 900) this.particles.splice(0, this.particles.length - 900);

    if (!m) return;
    const b = m.ball;
    const now = this.time;
    if (m.celebrate <= 0 && !m.done) {
      this.trail.push({ x: b.x, y: b.y, t: now });
      this.emitTrail(dt);
    }
    this.trail = this.trail.filter((p) => now - p.t < 0.35);
  }

  private emitTrail(dt: number) {
    const m = this.match!;
    const b = m.ball;
    const sp = Math.hypot(b.vx, b.vy);
    if (b.fx === 'fire') this.burst(b.x, b.y, 2, ['#ffd23f', '#ff7b00', '#ff2e00'], 40, 'dot', 0.35, 4);
    if (b.fx === 'ice') this.burst(b.x, b.y, 1, '#bae6fd', 20, 'flake', 0.5, 3);
    if (b.fx === 'thunder' && Math.random() < 0.5) this.burst(b.x, b.y, 1, '#fde047', 120, 'spark', 0.2, 2);
    const bot = this.bot(b.lastTeam);
    if (!bot || sp < 60) return;
    const t: Trail = bot.look.trail;
    const rate = dt * 60;
    switch (t) {
      case 'sparkle':
        if (Math.random() < 0.8 * rate) this.burst(b.x, b.y, 1, [bot.look.accent, '#ffffff'], 30, 'star', 0.5, 3);
        break;
      case 'fire':
        this.burst(b.x, b.y, Math.ceil(rate), ['#ffd23f', '#ff7b00', '#ff3d00'], 25, 'dot', 0.35, 3.5);
        break;
      case 'smoke':
        if (Math.random() < 0.7 * rate) this.burst(b.x, b.y, 1, ['#9ca3af', '#6b7280'], 12, 'bubble', 0.7, 5);
        break;
      case 'pixel':
        if (Math.random() < 0.9 * rate)
          this.particles.push({ x: Math.round(b.x / 5) * 5, y: Math.round(b.y / 5) * 5, vx: 0, vy: 0, life: 0.4, max: 0.4, color: Math.random() < 0.5 ? bot.look.color : bot.look.accent, size: 5, kind: 'square' });
        break;
      case 'bubbles':
        if (Math.random() < 0.5 * rate) this.burst(b.x, b.y, 1, [bot.look.accent, bot.look.color], 20, 'bubble', 0.8, 4);
        break;
    }
  }

  draw() {
    this.resize();
    const ctx = this.ctx;
    const m = this.match;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cw, ch);
    const sx = (Math.random() - 0.5) * this.shake;
    const sy = (Math.random() - 0.5) * this.shake;
    ctx.setTransform(this.scale, 0, 0, this.scale, this.ox + sx * this.scale, this.oy + sy * this.scale);

    this.drawTable(m);
    if (m) {
      this.drawShields(m);
      this.drawTrail(m);
      this.drawDecoys(m);
      this.drawRods(m);
      this.drawBall(m);
    }
    this.drawParticles();
    this.drawBolts();

    // overlays
    if (m && m.warpT > 0) {
      const g = ctx.createRadialGradient(W / 2, H / 2, 80, W / 2, H / 2, H * 0.7);
      g.addColorStop(0, 'rgba(168,85,247,0)');
      g.addColorStop(1, `rgba(168,85,247,${0.45 * Math.min(1, m.warpT * 2)})`);
      ctx.fillStyle = g;
      ctx.fillRect(-M, -M, W + 2 * M, H + 2 * M);
    }
    if (this.flash > 0) {
      ctx.fillStyle = hexA(this.flashColor.startsWith('#') ? this.flashColor : '#ffffff', Math.min(0.5, this.flash));
      ctx.fillRect(-M, -M, W + 2 * M, H + 2 * M);
    }
    if (this.banner) {
      const t = this.banner.t;
      const s = 1 + Math.max(0, t - 1) * 1.5;
      ctx.save();
      ctx.translate(W / 2, H / 2 - 30);
      ctx.scale(s, s);
      ctx.font = '900 46px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = Math.min(1, t * 2);
      ctx.lineWidth = 6;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(this.banner.text, 0, 0);
      ctx.fillStyle = this.banner.color;
      ctx.fillText(this.banner.text, 0, 0);
      ctx.restore();
    }
  }

  private drawTable(m: Match | null) {
    const ctx = this.ctx;
    // wood frame
    ctx.fillStyle = '#3b2414';
    roundRect(ctx, -M, -M, W + 2 * M, H + 2 * M, 14);
    ctx.fill();
    ctx.fillStyle = '#5a3720';
    roundRect(ctx, -M + 4, -M + 4, W + 2 * M - 8, H + 2 * M - 8, 10);
    ctx.fill();
    // felt
    const stripes = 10;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 ? '#1f7a3e' : '#22863f';
      ctx.fillRect(0, (H / stripes) * i, W, H / stripes + 1);
    }
    const ot = m?.overtime;
    ctx.strokeStyle = 'rgba(255,255,255,0.55)';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);
    ctx.beginPath();
    ctx.moveTo(0, H / 2);
    ctx.lineTo(W, H / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 40, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.beginPath();
    ctx.arc(W / 2, H / 2, 3, 0, Math.PI * 2);
    ctx.fill();
    const gw = m ? m.goalW() : 116;
    // penalty boxes
    ctx.strokeRect(W / 2 - gw / 2 - 20, 1, gw + 40, 50);
    ctx.strokeRect(W / 2 - gw / 2 - 20, H - 51, gw + 40, 50);
    // goals
    for (const top of [true, false]) {
      const y = top ? -M + 2 : H;
      const team = top ? 1 : 0;
      const col = m ? m.teams[team].bot.look.color : '#888';
      ctx.fillStyle = '#0b0b0b';
      ctx.fillRect(W / 2 - gw / 2, y, gw, M - 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1;
      for (let gx = W / 2 - gw / 2 + 6; gx < W / 2 + gw / 2; gx += 8) {
        ctx.beginPath();
        ctx.moveTo(gx, y);
        ctx.lineTo(gx, y + M - 2);
        ctx.stroke();
      }
      ctx.fillStyle = col;
      ctx.fillRect(W / 2 - gw / 2 - 4, top ? -3 : H - 1, 6, 4);
      ctx.fillRect(W / 2 + gw / 2 - 2, top ? -3 : H - 1, 6, 4);
    }
    if (ot) {
      const pulse = 0.5 + 0.5 * Math.sin(this.time * 8);
      ctx.strokeStyle = `rgba(255,50,50,${0.4 + pulse * 0.5})`;
      ctx.lineWidth = 5;
      ctx.strokeRect(-2, -2, W + 4, H + 4);
    }
  }

  private drawShields(m: Match) {
    const ctx = this.ctx;
    for (const team of [0, 1] as const) {
      const ts = m.teams[team];
      if (!ts.perks.has('shield')) continue;
      const ready = !(ts.cd.shield > 0);
      const y = team === 0 ? H : 0;
      const gw = m.goalW();
      if (ready) {
        ctx.strokeStyle = `rgba(147,197,253,${0.35 + 0.2 * Math.sin(this.time * 4)})`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(W / 2, y, gw / 2 + 6, 16, 0, team === 0 ? Math.PI : 0, team === 0 ? Math.PI * 2 : Math.PI);
        ctx.stroke();
      }
    }
    for (const s of this.shieldFx) {
      const y = s.team === 0 ? H : 0;
      const k = s.t / 0.8;
      ctx.fillStyle = `rgba(147,197,253,${0.5 * k})`;
      ctx.beginPath();
      ctx.ellipse(W / 2, y, m.goalW() / 2 + 20 * (1 - k) + 6, 30 * (1.5 - k), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawTrail(m: Match) {
    const bot = this.bot(m.ball.lastTeam);
    if (!bot || this.trail.length < 2) return;
    const t = bot.look.trail;
    if (t === 'none' || t === 'pixel' || t === 'smoke' || t === 'bubbles') return;
    const ctx = this.ctx;
    ctx.lineCap = 'round';
    const n = this.trail.length;
    for (let i = 1; i < n; i++) {
      const a = this.trail[i - 1];
      const b = this.trail[i];
      if (Math.hypot(b.x - a.x, b.y - a.y) > 120) continue;
      const k = i / n;
      ctx.lineWidth = BALL_R * 1.6 * k;
      if (t === 'rainbow') ctx.strokeStyle = hexA(RAINBOW[Math.floor((i + this.time * 20) % RAINBOW.length)], k * 0.9);
      else if (t === 'fire') ctx.strokeStyle = `rgba(255,${Math.floor(120 + 100 * k)},0,${k * 0.6})`;
      else if (t === 'sparkle') ctx.strokeStyle = hexA(bot.look.accent, k * 0.4);
      else ctx.strokeStyle = hexA(bot.look.color, k * 0.8);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
  }

  private drawDecoys(m: Match) {
    const ctx = this.ctx;
    for (const d of m.decoys) {
      ctx.globalAlpha = 0.55 * Math.min(1, d.t * 2);
      ctx.fillStyle = '#e9d5ff';
      ctx.beginPath();
      ctx.arc(d.x, d.y, BALL_R, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  private drawRods(m: Match) {
    const ctx = this.ctx;
    for (const rod of m.rods) {
      // rod bar
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-M, rod.y + 2);
      ctx.lineTo(W + M, rod.y + 2);
      ctx.stroke();
      const grad = ctx.createLinearGradient(0, rod.y - 2, 0, rod.y + 2);
      grad.addColorStop(0, '#f1f5f9');
      grad.addColorStop(1, '#64748b');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-M, rod.y);
      ctx.lineTo(W + M, rod.y);
      ctx.stroke();
      // handle stub
      ctx.fillStyle = m.teams[rod.team].bot.look.color;
      const hx = rod.team === 0 ? W + M - 6 : -M;
      ctx.fillRect(hx + (rod.offset / 40) * 2, rod.y - 4, 6, 8);
      this.drawFigures(m, rod);
    }
  }

  private drawFigures(m: Match, rod: Rod) {
    const ctx = this.ctx;
    const ts = m.teams[rod.team];
    const look = ts.bot.look;
    const fw = m.figHalfW(rod.team, rod.kind);
    const fh = m.figHalfH(rod.team);
    const dir = rod.team === 0 ? -1 : 1;
    const hot = ts.hot > 0;
    for (let i = 0; i < rod.n; i++) {
      const x = m.figX(rod, i);
      let y = rod.y;
      let sh = fh;
      if (rod.kickAnim > 0) {
        const k = Math.sin((1 - rod.kickAnim / 0.18) * Math.PI);
        y += dir * k * 6;
        sh = fh * (1 + k * 0.4);
      }
      if (hot) {
        ctx.fillStyle = `rgba(255,${100 + Math.floor(Math.random() * 100)},0,0.5)`;
        ctx.beginPath();
        ctx.ellipse(x, y - dir * 3, fw * 1.2, fh * 1.8 + Math.random() * 3, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // shadow
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      shapePath(ctx, look.shape, x + 2, y + 3, fw, sh);
      ctx.fill();
      ctx.fillStyle = look.color;
      shapePath(ctx, look.shape, x, y, fw, sh);
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = look.accent;
      ctx.stroke();
      // eye/visor facing attack direction
      ctx.fillStyle = look.accent;
      ctx.fillRect(x - fw * 0.5, y + dir * sh * 0.35 - 1, fw, 2);
      if (rod.frozen > 0) {
        ctx.fillStyle = 'rgba(186,230,253,0.75)';
        ctx.fillRect(x - fw - 3, y - fh - 3, fw * 2 + 6, fh * 2 + 6);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(x - fw - 3, y - fh - 3, fw * 2 + 6, fh * 2 + 6);
      }
      if (rod.stunned > 0 && Math.random() < 0.3) {
        this.particles.push({ x: x + (Math.random() - 0.5) * fw * 2, y, vx: 0, vy: -20, life: 0.15, max: 0.15, color: '#fde047', size: 2, kind: 'spark' });
      }
    }
  }

  private drawBall(m: Match) {
    const ctx = this.ctx;
    const b = m.ball;
    if (m.celebrate > 0 && (b.y < 0 || b.y > H)) return;
    // phantom flicker when either team is blinded
    const blind = m.teams[0].blind > 0 || m.teams[1].blind > 0;
    ctx.globalAlpha = blind ? 0.25 + 0.25 * Math.sin(this.time * 40) : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(b.x + 2, b.y + 3, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    if (b.fx !== 'none') {
      const glow = b.fx === 'fire' ? '#ff7b00' : b.fx === 'thunder' ? '#fde047' : b.fx === 'ice' ? '#7dd3fc' : '#c084fc';
      const g = ctx.createRadialGradient(b.x, b.y, 2, b.x, b.y, BALL_R * 3);
      g.addColorStop(0, hexA(glow, 0.9));
      g.addColorStop(1, hexA(glow, 0));
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x, b.y, BALL_R * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    const g = ctx.createRadialGradient(b.x - 2, b.y - 2, 1, b.x, b.y, BALL_R);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, b.fx === 'fire' ? '#ffb347' : b.fx === 'ice' ? '#bae6fd' : '#d4d4d4');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private drawParticles() {
    const ctx = this.ctx;
    for (const p of this.particles) {
      const k = p.life / p.max;
      ctx.globalAlpha = Math.min(1, k * 1.5);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = p.color;
      switch (p.kind) {
        case 'dot':
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (0.4 + k * 0.6), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'square':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot ?? 0);
          ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.7);
          ctx.restore();
          break;
        case 'spark':
          ctx.lineWidth = p.size * 0.6;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x - p.vx * 0.03, p.y - p.vy * 0.03);
          ctx.stroke();
          break;
        case 'star':
        case 'flake':
          ctx.save();
          ctx.translate(p.x, p.y);
          ctx.rotate(p.rot ?? 0);
          ctx.lineWidth = 1.2;
          for (let i = 0; i < (p.kind === 'flake' ? 3 : 2); i++) {
            ctx.rotate(Math.PI / (p.kind === 'flake' ? 3 : 2));
            ctx.beginPath();
            ctx.moveTo(-p.size, 0);
            ctx.lineTo(p.size, 0);
            ctx.stroke();
          }
          ctx.restore();
          break;
        case 'bubble':
          ctx.globalAlpha *= 0.6;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size * (1.5 - k * 0.5), 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'ring':
          ctx.lineWidth = 4 * k + 1;
          ctx.beginPath();
          ctx.arc(p.x, p.y, Math.max(1, p.size * (1 - k)), 0, Math.PI * 2);
          ctx.stroke();
          break;
        case 'heart':
          drawHeart(ctx, p.x, p.y, p.size);
          break;
        case 'text': {
          const s = p.size === 1 ? 26 : 22 * p.size + 8;
          ctx.font = `900 ${s}px system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.lineWidth = 4;
          ctx.strokeStyle = 'rgba(0,0,0,0.7)';
          const ty = p.size === 1 ? p.y + 14 : p.y;
          ctx.strokeText(p.text ?? '', p.x, ty);
          ctx.fillText(p.text ?? '', p.x, ty);
          break;
        }
      }
    }
    ctx.globalAlpha = 1;
  }

  private drawBolts() {
    const ctx = this.ctx;
    for (const b of this.bolts) {
      ctx.globalAlpha = Math.min(1, b.t * 4) * (Math.random() < 0.2 ? 0.3 : 1);
      for (const [w, c] of [
        [7, 'rgba(125,211,252,0.5)'],
        [2.5, '#ffffff'],
      ] as const) {
        ctx.lineWidth = w;
        ctx.strokeStyle = c;
        ctx.beginPath();
        b.pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }
}

function boltPts(x0: number, y0: number, x1: number, y1: number) {
  const pts = [{ x: x0, y: y0 }];
  const n = 10;
  for (let i = 1; i < n; i++) {
    const t = i / n;
    pts.push({ x: x0 + (x1 - x0) * t + (Math.random() - 0.5) * 30, y: y0 + (y1 - y0) * t + (Math.random() - 0.5) * 10 });
  }
  pts.push({ x: x1, y: y1 });
  return pts;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawHeart(ctx: CanvasRenderingContext2D, x: number, y: number, s: number) {
  ctx.beginPath();
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y, x - s / 2, y, x - s / 2, y + s * 0.3);
  ctx.bezierCurveTo(x - s / 2, y + s * 0.6, x, y + s * 0.8, x, y + s);
  ctx.bezierCurveTo(x, y + s * 0.8, x + s / 2, y + s * 0.6, x + s / 2, y + s * 0.3);
  ctx.bezierCurveTo(x + s / 2, y, x, y, x, y + s * 0.3);
  ctx.fill();
}
