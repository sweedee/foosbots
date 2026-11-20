import type { StatKey, Stats } from './types';

export interface PerkDef {
  id: string;
  name: string;
  icon: string;
  cost: number;
  desc: string;
  req?: Partial<Record<StatKey, number>>;
}

export const PERKS: PerkDef[] = [
  { id: 'turbo', name: 'Turbo Rods', icon: '💨', cost: 1, desc: '+25% rod speed in own half' },
  { id: 'bouncy', name: 'Bouncy Walls', icon: '🏓', cost: 1, desc: 'Wall bounces speed the ball up' },
  { id: 'curve', name: 'Curveball', icon: '🌀', cost: 2, desc: 'Shots bend around defenders', req: { control: 5 } },
  { id: 'magnet', name: 'Magnet Feet', icon: '🧲', cost: 2, desc: 'Pulls nearby balls in', req: { control: 4 } },
  { id: 'hotstreak', name: 'Hot Streak', icon: '🔥', cost: 2, desc: 'Power +4 for 10s after scoring' },
  { id: 'comeback', name: 'Comeback', icon: '💪', cost: 2, desc: 'All stats +2 while trailing' },
  { id: 'bank', name: 'Bank Shot', icon: '📐', cost: 2, desc: 'Aims shots off the walls', req: { control: 6 } },
  { id: 'fireball', name: 'Fireball', icon: '☄️', cost: 3, desc: 'Every 8s: blazing shot that burns through a defender', req: { power: 6 } },
  { id: 'wall', name: 'Iron Keeper', icon: '🧱', cost: 3, desc: 'Goalie is 60% wider', req: { reflex: 5 } },
  { id: 'phantom', name: 'Phantom Ball', icon: '👻', cost: 3, desc: 'Ball vanishes for the foe after shots' },
  { id: 'shield', name: 'Energy Shield', icon: '🛡️', cost: 3, desc: 'Blocks a goal, recharges in 25s' },
  { id: 'sniper', name: 'Sniper', icon: '🎯', cost: 3, desc: 'Picks the perfect corner', req: { accuracy: 8 } },
  { id: 'freeze', name: 'Freeze Ray', icon: '❄️', cost: 4, desc: 'Every 10s: shot freezes foe rods 1s', req: { accuracy: 6 } },
  { id: 'warp', name: 'Time Warp', icon: '⏳', cost: 4, desc: 'Slows dangerous shots at your goal', req: { reflex: 7 } },
  { id: 'giant', name: 'Giants', icon: '🦍', cost: 4, desc: 'All figures 35% bigger', req: { power: 5 } },
  { id: 'thunder', name: 'Thunder Strike', icon: '⚡', cost: 5, desc: 'Every 14s: lightning shot stuns foe', req: { power: 8 } },
  { id: 'clone', name: 'Split Shot', icon: '🔱', cost: 5, desc: 'Every 12s: shot splits into decoys', req: { control: 7 } },
];

export const PERK_MAP: Record<string, PerkDef> = Object.fromEntries(PERKS.map((p) => [p.id, p]));

export function perkReqMet(p: PerkDef, stats: Stats): boolean {
  if (!p.req) return true;
  return Object.entries(p.req).every(([k, v]) => stats[k as StatKey] >= (v as number));
}

export function reqText(p: PerkDef): string {
  if (!p.req) return '';
  return Object.entries(p.req)
    .map(([k, v]) => `${k.slice(0, 3).toUpperCase()} ${v}+`)
    .join(', ');
}

export function perkCost(ids: string[]): number {
  return ids.reduce((s, id) => s + (PERK_MAP[id]?.cost ?? 0), 0);
}
