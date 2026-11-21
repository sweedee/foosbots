/* Repairs anything loaded from localStorage. The storage origin (e.g. user.github.io) is shared
   with other sites/older versions, so saved data can't be trusted to match the current schema. */
import { DEFAULT_BOTS, uid } from './defaults';
import { PERK_MAP, perkReqMet } from './perks';
import {
  PERK_POINTS,
  STAT_CAP,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
  type Appearance,
  type Bot,
  type BotRecord,
  type GoalFx,
  type MatchResult,
  type Shape,
  type SoundPack,
  type Stats,
  type Trail,
} from './types';

const SHAPES: Shape[] = ['round', 'square', 'triangle', 'hex', 'star', 'diamond'];
const TRAILS: Trail[] = ['none', 'line', 'sparkle', 'fire', 'rainbow', 'smoke', 'pixel', 'bubbles'];
const GOALFX: GoalFx[] = ['confetti', 'explosion', 'fireworks', 'lightning', 'shockwave', 'hearts', 'pixels'];
const SOUNDS: SoundPack[] = ['classic', 'laser', 'retro', 'bass', 'chime', 'horn'];

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d: number) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const oneOf = <T>(v: unknown, list: T[], d: T): T => (list.includes(v as T) ? (v as T) : d);
const color = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : d);

function fixStats(v: unknown): Stats {
  const src = isObj(v) ? v : {};
  const s = {} as Stats;
  for (const k of STAT_KEYS) s[k] = Math.round(Math.min(STAT_MAX, Math.max(STAT_MIN, num(src[k], 5))));
  // enforce the total cap by trimming the highest stats
  let total = STAT_KEYS.reduce((a, k) => a + s[k], 0);
  while (total > STAT_CAP) {
    const k = STAT_KEYS.reduce((a, b) => (s[b] > s[a] ? b : a));
    s[k]--;
    total--;
  }
  return s;
}

function fixLook(v: unknown, i: number): Appearance {
  const src = isObj(v) ? v : {};
  const fallback = DEFAULT_BOTS[i % DEFAULT_BOTS.length].look;
  return {
    shape: oneOf(src.shape, SHAPES, fallback.shape),
    color: color(src.color, fallback.color),
    accent: color(src.accent, fallback.accent),
    trail: oneOf(src.trail, TRAILS, fallback.trail),
    goalFx: oneOf(src.goalFx, GOALFX, fallback.goalFx),
    sound: oneOf(src.sound, SOUNDS, fallback.sound),
  };
}

export function fixBot(v: unknown, i: number, taken: Set<string>): Bot | null {
  if (!isObj(v)) return null;
  let id = typeof v.id === 'string' && v.id ? v.id : uid();
  if (taken.has(id)) id = uid();
  taken.add(id);
  const name = typeof v.name === 'string' && v.name.trim() ? v.name.trim().slice(0, 18) : `Bot ${i + 1}`;
  const stats = fixStats(v.stats);
  const perks: string[] = [];
  let spent = 0;
  if (Array.isArray(v.perks)) {
    for (const p of v.perks) {
      const def = typeof p === 'string' ? PERK_MAP[p] : undefined;
      if (!def || perks.includes(def.id) || !perkReqMet(def, stats) || spent + def.cost > PERK_POINTS) continue;
      perks.push(def.id);
      spent += def.cost;
    }
  }
  return { id, name, stats, perks, look: fixLook(v.look, i) };
}

export function fixBots(v: unknown): Bot[] {
  const taken = new Set<string>();
  const bots = (Array.isArray(v) ? v : []).map((b, i) => fixBot(b, i, taken)).filter((b): b is Bot => !!b);
  if (bots.length >= 2) return bots;
  // not enough usable bots: top up with the starters
  for (const d of DEFAULT_BOTS) {
    if (bots.length >= DEFAULT_BOTS.length) break;
    if (!taken.has(d.id)) bots.push(structuredClone(d));
  }
  return bots;
}

export function fixRecords(v: unknown, ids: Set<string>): Record<string, BotRecord> {
  const out: Record<string, BotRecord> = {};
  if (!isObj(v)) return out;
  for (const [id, r] of Object.entries(v)) {
    if (!ids.has(id) || !isObj(r)) continue;
    const wins = Math.max(0, Math.round(num(r.wins, 0)));
    const losses = Math.max(0, Math.round(num(r.losses, 0)));
    out[id] = {
      played: wins + losses,
      wins,
      losses,
      gf: Math.max(0, Math.round(num(r.gf, 0))),
      ga: Math.max(0, Math.round(num(r.ga, 0))),
      elo: num(r.elo, 1000),
    };
  }
  return out;
}

export function fixHistory(v: unknown, ids: Set<string>): MatchResult[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((h): h is Obj => isObj(h) && ids.has(h.a as string) && ids.has(h.b as string) && (h.winner === 'a' || h.winner === 'b'))
    .slice(0, 200)
    .map((h) => ({
      a: h.a as string,
      b: h.b as string,
      scoreA: Math.max(0, Math.round(num(h.scoreA, 0))),
      scoreB: Math.max(0, Math.round(num(h.scoreB, 0))),
      winner: h.winner as 'a' | 'b',
      overtime: h.overtime === true,
      duration: num(h.duration, 0),
    }));
}

export { isObj, num, oneOf };
