import type { Bot, MatchSettings, StatKey } from './types';

export const W = 340;
export const H = 560;
export const BASE_GOAL_W = 116;
export const BALL_R = 7;
export const TICK = 1 / 240;

export type RodKind = 'goalie' | 'def' | 'mid' | 'att';

export interface Rod {
  team: 0 | 1;
  kind: RodKind;
  y: number;
  n: number;
  base: number[];
  offset: number;
  minOff: number;
  maxOff: number;
  vel: number;
  kickCd: number;
  frozen: number;
  stunned: number;
  kickAnim: number; // >0 while showing kick swing
  kickFig: number;
  jitter: number;
  hold: { fig: number; t: number } | null;
}

export interface Decoy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  t: number;
}

export type BallFx = 'none' | 'fire' | 'thunder' | 'ice' | 'split';

export interface Ball {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lastTeam: 0 | 1 | -1;
  fx: BallFx;
  fireThrough: number;
  curve: number;
  curveT: number;
}

export type MatchEvent =
  | { type: 'kick'; team: 0 | 1; x: number; y: number; power: number }
  | { type: 'hit'; x: number; y: number }
  | { type: 'wall'; x: number; y: number }
  | { type: 'goal'; team: 0 | 1; x: number; y: number }
  | { type: 'perk'; perk: string; team: 0 | 1; x: number; y: number }
  | { type: 'shake'; x: number; y: number }
  | { type: 'overtime' }
  | { type: 'end'; winner: 0 | 1 };

interface TeamState {
  bot: Bot;
  perks: Set<string>;
  cd: Record<string, number>;
  hot: number;
  blind: number;
  blindSnap: Snap | null;
  decoyTrack: number;
  shots: number;
}

interface Snap {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ROD_LAYOUT: { team: 0 | 1; kind: RodKind; n: number }[] = [
  { team: 1, kind: 'goalie', n: 1 },
  { team: 1, kind: 'def', n: 2 },
  { team: 0, kind: 'att', n: 3 },
  { team: 1, kind: 'mid', n: 5 },
  { team: 0, kind: 'mid', n: 5 },
  { team: 1, kind: 'att', n: 3 },
  { team: 0, kind: 'def', n: 2 },
  { team: 0, kind: 'goalie', n: 1 },
];

const SPECIAL_CD: Record<string, number> = {
  thunder: 14,
  clone: 12,
  freeze: 10,
  fireball: 8,
  phantom: 6,
  warp: 12,
  shield: 25,
};

export class Match {
  rods: Rod[] = [];
  ball: Ball;
  decoys: Decoy[] = [];
  teams: [TeamState, TeamState];
  score: [number, number] = [0, 0];
  time = 0;
  overtime = false;
  otTime = 0;
  done = false;
  winner: 0 | 1 = 0;
  celebrate = 0;
  lastGoalTeam: 0 | 1 | -1 = -1;
  warpT = 0;
  events: MatchEvent[] = [];
  recordEvents = true;
  settings: MatchSettings;
  rng: () => number;
  private hist: Snap[] = [];
  private histI = 0;
  private slowT = 0;

  constructor(a: Bot, b: Bot, settings: MatchSettings, seed = Math.floor(Math.random() * 1e9)) {
    this.settings = settings;
    this.rng = mulberry32(seed);
    const mk = (bot: Bot): TeamState => ({
      bot,
      perks: new Set(bot.perks),
      cd: { shield: 0 },
      hot: 0,
      blind: 0,
      blindSnap: null,
      decoyTrack: -1,
      shots: 0,
    });
    this.teams = [mk(a), mk(b)];
    ROD_LAYOUT.forEach((l, i) => {
      const y = (H * (i + 0.5)) / 8;
      const fw = this.figHalfW(l.team, l.kind);
      let base: number[];
      let minOff: number;
      let maxOff: number;
      if (l.kind === 'goalie') {
        base = [W / 2];
        maxOff = BASE_GOAL_W / 2 + 4;
        minOff = -maxOff;
      } else {
        const sp = W / l.n;
        base = Array.from({ length: l.n }, (_, k) => W / 2 + (k - (l.n - 1) / 2) * sp);
        minOff = Math.max(-sp / 2, fw - base[0]);
        maxOff = Math.min(sp / 2, W - fw - base[l.n - 1]);
      }
      this.rods.push({
        team: l.team,
        kind: l.kind,
        y,
        n: l.n,
        base,
        offset: 0,
        minOff,
        maxOff,
        vel: 0,
        kickCd: 0,
        frozen: 0,
        stunned: 0,
        kickAnim: 0,
        kickFig: 0,
        jitter: 0,
        hold: null,
      });
    });
    this.ball = { x: W / 2, y: H / 2, vx: 0, vy: 0, lastTeam: -1, fx: 'none', fireThrough: 0, curve: 0, curveT: 0 };
    for (let i = 0; i < 120; i++) this.hist.push({ x: W / 2, y: H / 2, vx: 0, vy: 0 });
    this.kickoff(this.rng() < 0.5 ? 0 : 1);
  }

  // ---------- helpers ----------
  stat(team: 0 | 1, k: StatKey): number {
    const t = this.teams[team];
    let v = t.bot.stats[k];
    if (t.perks.has('comeback') && this.score[team] < this.score[1 - team]) v += 2;
    if (k === 'power' && t.hot > 0) v += 4;
    return v;
  }

  figHalfW(team: 0 | 1, kind: RodKind): number {
    const p = this.teams[team].perks;
    let w = 9;
    if (p.has('giant')) w *= 1.35;
    if (kind === 'goalie' && p.has('wall')) w *= 1.6;
    return w;
  }

  figHalfH(team: 0 | 1): number {
    return this.teams[team].perks.has('giant') ? 7.5 : 6;
  }

  goalW(): number {
    return BASE_GOAL_W + (this.overtime ? Math.min(90, this.otTime * 1.5) : 0);
  }

  figX(rod: Rod, i: number) {
    return rod.base[i] + rod.offset;
  }

  private emit(e: MatchEvent) {
    if (this.recordEvents) this.events.push(e);
  }

  private kickoff(toward: 0 | 1) {
    const b = this.ball;
    b.x = W / 2 + (this.rng() - 0.5) * 60;
    b.y = H / 2;
    b.vx = (this.rng() - 0.5) * 160;
    // serve to the midfield of team `toward`
    b.vy = toward === 0 ? 170 : -170;
    b.lastTeam = -1;
    b.fx = 'none';
    b.curve = 0;
    b.curveT = 0;
    this.decoys = [];
    this.rods.forEach((r) => (r.hold = null));
  }

  // ---------- main loop ----------
  runFor(seconds: number) {
    const steps = Math.round(seconds / TICK);
    for (let i = 0; i < steps && !this.done; i++) this.step();
  }

  simulateToEnd() {
    const rec = this.recordEvents;
    this.recordEvents = false;
    let guard = 0;
    while (!this.done && guard++ < 240 * 60 * 30) this.step();
    if (!this.done) this.finish(this.score[0] >= this.score[1] ? 0 : 1);
    this.recordEvents = rec;
  }

  step() {
    if (this.done) return;
    const dt = TICK;
    if (this.celebrate > 0) {
      this.celebrate -= dt;
      this.rods.forEach((r) => (r.kickAnim = Math.max(0, r.kickAnim - dt)));
      if (this.celebrate <= 0) this.kickoff(this.lastGoalTeam === 0 ? 1 : 0);
      return;
    }
    this.time += dt;
    if (this.overtime) this.otTime += dt;

    for (const t of this.teams) {
      for (const k in t.cd) t.cd[k] = Math.max(0, t.cd[k] - dt);
      t.hot = Math.max(0, t.hot - dt);
      t.blind = Math.max(0, t.blind - dt);
      if (t.blind <= 0) t.blindSnap = null;
    }
    this.warpT = Math.max(0, this.warpT - dt);

    // history for perception delay
    const b = this.ball;
    const h = this.hist[this.histI];
    h.x = b.x;
    h.y = b.y;
    h.vx = b.vx;
    h.vy = b.vy;
    this.histI = (this.histI + 1) % this.hist.length;

    this.updateRods(dt);
    this.updateBall(dt);
    this.updateDecoys(dt);
    this.checkClock();
  }

  private perceived(team: 0 | 1): Snap {
    const t = this.teams[team];
    if (t.blindSnap) return t.blindSnap;
    if (t.decoyTrack >= 0 && this.decoys[t.decoyTrack]) return this.decoys[t.decoyTrack];
    const delay = Math.round((0.13 - this.stat(team, 'reflex') * 0.007) * 240);
    const idx = (this.histI - 1 - Math.max(1, delay) + this.hist.length * 4) % this.hist.length;
    return this.hist[idx];
  }

  private updateRods(dt: number) {
    const b = this.ball;
    for (const rod of this.rods) {
      rod.kickCd = Math.max(0, rod.kickCd - dt);
      rod.kickAnim = Math.max(0, rod.kickAnim - dt);
      rod.frozen = Math.max(0, rod.frozen - dt);
      rod.stunned = Math.max(0, rod.stunned - dt);
      const team = rod.team;
      const ts = this.teams[team];
      const dir = team === 0 ? -1 : 1;

      if (rod.frozen > 0 || rod.stunned > 0) {
        rod.vel = 0;
        rod.hold = null;
        continue;
      }

      // --- holding the ball (pin & aim) ---
      if (rod.hold) {
        rod.hold.t -= dt;
        const fx = this.figX(rod, rod.hold.fig);
        b.x = fx;
        b.y = rod.y + dir * (this.figHalfH(team) + BALL_R + 1);
        b.vx = 0;
        b.vy = 0;
        // drift the rod a bit to find an open lane
        const opp = this.rods.find((r) => r.team !== team && r.kind === 'goalie')!;
        const gkX = this.figX(opp, 0);
        const want = gkX > W / 2 ? -1 : 1;
        const spd = (120 + this.stat(team, 'speed') * 40) * 0.35;
        const prev = rod.offset;
        rod.offset = clamp(rod.offset + want * spd * dt, rod.minOff, rod.maxOff);
        rod.vel = (rod.offset - prev) / dt;
        if (rod.hold.t <= 0) {
          const fig = rod.hold.fig;
          rod.hold = null;
          this.kick(rod, fig, true);
        }
        continue;
      }

      // --- tracking ---
      const p = this.perceived(team);
      let target = p.x;
      if (p.vy !== 0 && Math.sign(rod.y - p.y) === Math.sign(p.vy)) {
        const t = (rod.y - p.y) / p.vy;
        if (t < 1.0) target = reflectX(p.x + p.vx * t);
      }
      const refl = this.stat(team, 'reflex');
      rod.jitter += ((this.rng() - 0.5) * 2 * (11 - refl) * 4 - rod.jitter) * dt * 3;
      target += rod.jitter;

      let best = 0;
      let bestErr = Infinity;
      let bestOff = rod.offset;
      for (let i = 0; i < rod.n; i++) {
        const off = clamp(target - rod.base[i], rod.minOff, rod.maxOff);
        const err = Math.abs(rod.base[i] + off - target) * 4 + Math.abs(off - rod.offset);
        if (err < bestErr) {
          bestErr = err;
          best = i;
          bestOff = off;
        }
      }
      void best;
      let maxSpd = 120 + this.stat(team, 'speed') * 40;
      if (ts.perks.has('turbo') && (team === 0 ? b.y > H / 2 : b.y < H / 2)) maxSpd *= 1.25;
      const prev = rod.offset;
      const delta = clamp(bestOff - rod.offset, -maxSpd * dt, maxSpd * dt);
      rod.offset = clamp(rod.offset + delta, rod.minOff, rod.maxOff);
      rod.vel = (rod.offset - prev) / dt;

      // --- magnet ---
      if (ts.perks.has('magnet')) {
        const sp = Math.hypot(b.vx, b.vy);
        if (sp < 420) {
          for (let i = 0; i < rod.n; i++) {
            const fx = this.figX(rod, i);
            const ty = rod.y + dir * 14;
            const dx = fx - b.x;
            const dy = ty - b.y;
            const d = Math.hypot(dx, dy);
            if (d < 34 && d > 1) {
              b.vx += (dx / d) * 520 * dt;
              b.vy += (dy / d) * 520 * dt;
            }
          }
        }
      }

      // --- kicking ---
      if (rod.kickCd > 0) continue;
      const fw = this.figHalfW(team, rod.kind);
      const fh = this.figHalfH(team);
      for (let i = 0; i < rod.n; i++) {
        const fx = this.figX(rod, i);
        if (Math.abs(b.x - fx) < fw + BALL_R && Math.abs(b.y - rod.y) < fh + BALL_R + 7) {
          const ctl = this.stat(team, 'control');
          const pKick = 0.12 + refl * 0.006 + ctl * 0.012;
          if (this.rng() > pKick) break;
          const sp = Math.hypot(b.vx, b.vy);
          // trap & aim?
          if (rod.kind !== 'goalie' && this.rng() < ctl * 0.045 && sp < 300 + ctl * 50) {
            rod.hold = { fig: i, t: 0.06 + this.rng() * 0.16 };
            this.emit({ type: 'hit', x: b.x, y: b.y });
          } else {
            this.kick(rod, i, false);
          }
          break;
        }
      }
    }
  }

  private kick(rod: Rod, fig: number, aimed: boolean) {
    const b = this.ball;
    const team = rod.team;
    const ts = this.teams[team];
    const opp = (1 - team) as 0 | 1;
    const dir = team === 0 ? -1 : 1;
    const fx = this.figX(rod, fig);
    const gy = team === 0 ? 0 : H;
    const gw = this.goalW();

    // target selection
    const gkRod = this.rods.find((r) => r.team === opp && r.kind === 'goalie')!;
    const gkX = this.figX(gkRod, 0);
    const lo = W / 2 - gw / 2 + BALL_R + 4;
    const hi = W / 2 + gw / 2 - BALL_R - 4;
    const acc = this.stat(team, 'accuracy');
    const sniper = ts.perks.has('sniper');
    // sample candidate targets; better accuracy = more candidates = finds open lanes
    const tries = 1 + Math.floor(acc / 2) + (aimed ? 2 : 0) + (sniper ? 4 : 0);
    const bank = ts.perks.has('bank') && this.rng() < 0.35;
    let tx = W / 2;
    let bestClear = -Infinity;
    for (let k = 0; k < tries; k++) {
      let cx = k === 0 && sniper ? (Math.abs(gkX - lo) > Math.abs(gkX - hi) ? lo : hi) : lo + this.rng() * (hi - lo);
      if (bank) cx = gkX > W / 2 ? -cx : 2 * W - cx;
      const c = this.laneClearance(b.x, b.y, cx, gy, opp);
      if (c > bestClear) {
        bestClear = c;
        tx = cx;
      }
    }
    const tY = gy;
    let speed = 280 + this.stat(team, 'power') * 55;
    speed *= 0.9 + this.rng() * 0.2;
    if (aimed) speed *= 1.1 + this.stat(team, 'control') * 0.02;
    if (this.overtime) speed *= 1 + Math.min(0.6, this.otTime * 0.01);

    // pick special
    let special: string | null = null;
    for (const s of ['thunder', 'clone', 'freeze', 'fireball']) {
      if (ts.perks.has(s) && !(ts.cd[s] > 0) && rod.kind !== 'goalie') {
        special = s;
        break;
      }
    }
    b.fx = 'none';
    b.fireThrough = 0;
    if (special) {
      ts.cd[special] = SPECIAL_CD[special];
      this.emit({ type: 'perk', perk: special, team, x: b.x, y: b.y });
      if (special === 'thunder') {
        speed *= 2;
        b.fx = 'thunder';
        this.rods.forEach((r) => r.team === opp && (r.stunned = 0.6));
        this.emit({ type: 'shake', x: b.x, y: b.y });
      } else if (special === 'fireball') {
        speed *= 1.5;
        b.fx = 'fire';
        b.fireThrough = 1;
      } else if (special === 'freeze') {
        speed *= 1.15;
        b.fx = 'ice';
        this.rods.forEach((r) => r.team === opp && (r.frozen = 1));
      } else if (special === 'clone') {
        speed *= 1.1;
        b.fx = 'split';
      }
    }
    speed = Math.min(speed, 2000);

    const dist = Math.hypot(tx - b.x, tY - b.y);
    // curve
    b.curve = 0;
    b.curveT = 0;
    if (ts.perks.has('curve') && this.rng() < 0.6) {
      const t = dist / speed;
      const a = (this.rng() < 0.5 ? -1 : 1) * (200 + this.rng() * 250);
      b.curve = a;
      b.curveT = t;
      tx -= 0.5 * a * t * t * (dir < 0 ? 1 : -1); // pre-compensate the bend
    }

    let ang = Math.atan2(tY - b.y, tx - b.x);
    let sigma = 0.01 + (10 - acc) * 0.026;
    if (aimed) sigma *= 0.5;
    if (ts.perks.has('sniper')) sigma *= 0.5;
    ang += gauss(this.rng) * sigma;
    // never kick backwards
    const vy0 = Math.sin(ang) * speed;
    if (Math.sign(vy0) !== dir) ang = dir < 0 ? -Math.PI / 2 : Math.PI / 2;
    b.vx = Math.cos(ang) * speed + rod.vel * 0.15;
    b.vy = Math.sin(ang) * speed;
    b.y = rod.y + dir * (this.figHalfH(team) + BALL_R + 1);
    b.lastTeam = team;
    rod.kickCd = 0.28;
    rod.kickAnim = 0.18;
    rod.kickFig = fig;
    ts.shots++;
    this.emit({ type: 'kick', team, x: b.x, y: b.y, power: speed });

    if (special === 'clone') {
      this.decoys = [-0.35, 0.35].map((da) => ({
        x: b.x,
        y: b.y,
        vx: Math.cos(ang + da) * speed,
        vy: Math.sin(ang + da) * speed,
        t: 0.9,
      }));
      this.teams[opp].decoyTrack = this.rng() < 0.5 ? 0 : 1;
    }
    if (ts.perks.has('phantom') && !(ts.cd.phantom > 0) && rod.kind !== 'goalie') {
      ts.cd.phantom = SPECIAL_CD.phantom;
      const o = this.teams[opp];
      o.blind = 0.55;
      o.blindSnap = { x: b.x, y: b.y, vx: 0, vy: 0 };
      this.emit({ type: 'perk', perk: 'phantom', team, x: b.x, y: b.y });
    }
  }

  /** smallest gap between the shot line and any opponent figure (unfolding wall bounces) */
  private laneClearance(x0: number, y0: number, x1: number, y1: number, opp: 0 | 1): number {
    let min = Infinity;
    for (const r of this.rods) {
      if (r.team !== opp) continue;
      const t = (r.y - y0) / (y1 - y0);
      if (t <= 0 || t >= 1) continue;
      const lx = reflectX(x0 + (x1 - x0) * t);
      const fw = this.figHalfW(opp, r.kind);
      for (let i = 0; i < r.n; i++) {
        const g = Math.abs(lx - this.figX(r, i)) - fw;
        if (g < min) min = g;
      }
    }
    return min;
  }

  private updateDecoys(dt: number) {
    if (!this.decoys.length) return;
    for (const d of this.decoys) {
      d.t -= dt;
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      if (d.x < BALL_R || d.x > W - BALL_R) d.vx *= -1;
    }
    this.decoys = this.decoys.filter((d) => d.t > 0 && d.y > -20 && d.y < H + 20);
    if (!this.decoys.length) this.teams.forEach((t) => (t.decoyTrack = -1));
  }

  private updateBall(dt: number) {
    const b = this.ball;
    if (this.rods.some((r) => r.hold)) return;
    const sp = Math.hypot(b.vx, b.vy);

    // time warp check
    for (const team of [0, 1] as const) {
      const ts = this.teams[team];
      if (!ts.perks.has('warp') || ts.cd.warp > 0) continue;
      const towardOwn = team === 0 ? b.vy > 0 && b.y > H - 170 : b.vy < 0 && b.y < 170;
      if (towardOwn && sp > 520 && b.lastTeam !== team) {
        ts.cd.warp = SPECIAL_CD.warp;
        b.vx *= 0.4;
        b.vy *= 0.4;
        this.warpT = 0.9;
        this.emit({ type: 'perk', perk: 'warp', team, x: b.x, y: b.y });
      }
    }

    const sub = Math.max(1, Math.ceil((sp * dt) / 3));
    const sdt = dt / sub;
    for (let s = 0; s < sub; s++) {
      if (b.curveT > 0) {
        const n = Math.hypot(b.vx, b.vy) || 1;
        // lateral accel perpendicular to velocity
        const px = -b.vy / n;
        const py = b.vx / n;
        b.vx += px * b.curve * sdt;
        b.vy += py * b.curve * sdt;
        b.curveT -= sdt;
      }
      b.x += b.vx * sdt;
      b.y += b.vy * sdt;
      this.collideWalls();
      if (this.celebrate > 0 || this.done) return;
      this.collideFigures();
    }
    // friction
    const f = 1 - 0.28 * dt;
    b.vx *= f;
    b.vy *= f;
    const nsp = Math.hypot(b.vx, b.vy);
    if (nsp < 200 && b.fx !== 'none') b.fx = 'none';

    // anti-stall: table shake
    if (nsp < 40) this.slowT += dt;
    else this.slowT = 0;
    if (this.slowT > 1.2) {
      this.slowT = 0;
      const a = this.rng() * Math.PI * 2;
      b.vx = Math.cos(a) * 220;
      b.vy = Math.sin(a) * 220;
      this.emit({ type: 'shake', x: b.x, y: b.y });
    }
  }

  private collideWalls() {
    const b = this.ball;
    const gw = this.goalW();
    const inMouth = b.x > W / 2 - gw / 2 + 2 && b.x < W / 2 + gw / 2 - 2;
    if (b.x < BALL_R) {
      b.x = BALL_R;
      b.vx = Math.abs(b.vx);
      this.wallBounce();
    } else if (b.x > W - BALL_R) {
      b.x = W - BALL_R;
      b.vx = -Math.abs(b.vx);
      this.wallBounce();
    }
    if (b.y < BALL_R && !inMouth) {
      b.y = BALL_R;
      b.vy = Math.abs(b.vy);
      this.wallBounce();
    } else if (b.y > H - BALL_R && !inMouth) {
      b.y = H - BALL_R;
      b.vy = -Math.abs(b.vy);
      this.wallBounce();
    }
    if (inMouth && (b.y < -BALL_R || b.y > H + BALL_R)) {
      const scorer: 0 | 1 = b.y < 0 ? 0 : 1;
      const defender = (1 - scorer) as 0 | 1;
      const dts = this.teams[defender];
      if (dts.perks.has('shield') && !(dts.cd.shield > 0)) {
        dts.cd.shield = SPECIAL_CD.shield;
        b.y = scorer === 0 ? BALL_R + 2 : H - BALL_R - 2;
        b.vy = -b.vy * 0.6;
        b.fx = 'none';
        this.emit({ type: 'perk', perk: 'shield', team: defender, x: b.x, y: b.y });
        return;
      }
      this.goal(scorer);
    }
  }

  private wallBounce() {
    const b = this.ball;
    b.vx *= 0.92;
    b.vy *= 0.92;
    if (b.lastTeam >= 0 && this.teams[b.lastTeam as 0 | 1].perks.has('bouncy')) {
      const s = Math.hypot(b.vx, b.vy);
      const k = Math.min(1.25, 1500 / Math.max(1, s));
      b.vx *= k;
      b.vy *= k;
    }
    if (Math.hypot(b.vx, b.vy) > 120) this.emit({ type: 'wall', x: b.x, y: b.y });
  }

  private collideFigures() {
    const b = this.ball;
    for (const rod of this.rods) {
      if (Math.abs(b.y - rod.y) > 20) continue;
      const fw = this.figHalfW(rod.team, rod.kind);
      const fh = this.figHalfH(rod.team);
      for (let i = 0; i < rod.n; i++) {
        const fx = this.figX(rod, i);
        const cx = clamp(b.x, fx - fw, fx + fw);
        const cy = clamp(b.y, rod.y - fh, rod.y + fh);
        const dx = b.x - cx;
        const dy = b.y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 >= BALL_R * BALL_R) continue;
        if (b.fx === 'fire' && b.fireThrough > 0 && b.lastTeam !== rod.team) {
          b.fireThrough--;
          this.emit({ type: 'perk', perk: 'burn', team: b.lastTeam as 0 | 1, x: fx, y: rod.y });
          // skip collisions with this figure by teleporting past it
          b.y += Math.sign(b.vy) * (fh * 2 + BALL_R * 2);
          return;
        }
        let nx: number, ny: number;
        const d = Math.sqrt(d2);
        if (d > 0.0001) {
          nx = dx / d;
          ny = dy / d;
        } else {
          nx = 0;
          ny = b.vy > 0 ? -1 : 1;
        }
        b.x = cx + nx * (BALL_R + 0.5);
        b.y = cy + ny * (BALL_R + 0.5);
        const vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= 1.7 * vn * nx;
          b.vy -= 1.7 * vn * ny;
          b.vx += rod.vel * 0.4 + (this.rng() - 0.5) * 60;
          if (Math.abs(vn) > 150) this.emit({ type: 'hit', x: b.x, y: b.y });
        }
        if (b.fx === 'thunder' || b.fx === 'fire') b.fx = 'none';
        return;
      }
    }
  }

  private goal(team: 0 | 1) {
    const b = this.ball;
    this.score[team]++;
    this.lastGoalTeam = team;
    this.emit({ type: 'goal', team, x: clamp(b.x, 0, W), y: team === 0 ? 0 : H });
    const ts = this.teams[team];
    if (ts.perks.has('hotstreak')) {
      ts.hot = 10;
      this.emit({ type: 'perk', perk: 'hotstreak', team, x: W / 2, y: H / 2 });
    }
    b.vx = 0;
    b.vy = 0;
    b.y = team === 0 ? -30 : H + 30;
    this.decoys = [];
    const gtw = this.settings.goalsToWin;
    if (this.overtime || (gtw > 0 && this.score[team] >= gtw)) {
      this.finish(team);
      return;
    }
    this.celebrate = 1.3;
  }

  private checkClock() {
    const tl = this.settings.timeLimit;
    if (tl <= 0 || this.done) return;
    if (!this.overtime && this.time >= tl) {
      if (this.score[0] === this.score[1]) {
        this.overtime = true;
        this.otTime = 0;
        this.emit({ type: 'overtime' });
      } else {
        this.finish(this.score[0] > this.score[1] ? 0 : 1);
      }
    }
    if (this.overtime && this.otTime > 240) {
      const s = this.teams[0].shots - this.teams[1].shots;
      this.finish(s === 0 ? (this.rng() < 0.5 ? 0 : 1) : s > 0 ? 0 : 1);
    }
  }

  private finish(w: 0 | 1) {
    this.done = true;
    this.winner = w;
    this.emit({ type: 'end', winner: w });
  }

  timeLeft(): number {
    if (this.settings.timeLimit <= 0) return -1;
    return Math.max(0, this.settings.timeLimit - this.time);
  }
}

function clamp(v: number, a: number, b: number) {
  return v < a ? a : v > b ? b : v;
}

function reflectX(x: number) {
  const lo = BALL_R;
  const hi = W - BALL_R;
  const span = hi - lo;
  let t = (x - lo) % (2 * span);
  if (t < 0) t += 2 * span;
  return t <= span ? lo + t : hi - (t - span);
}

function gauss(rng: () => number) {
  const u = Math.max(1e-9, rng());
  const v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
