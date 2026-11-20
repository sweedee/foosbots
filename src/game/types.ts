export type StatKey = 'speed' | 'power' | 'reflex' | 'control' | 'accuracy';

export const STAT_KEYS: StatKey[] = ['speed', 'power', 'reflex', 'control', 'accuracy'];

export const STAT_INFO: Record<StatKey, { label: string; short: string; hint: string }> = {
  speed: { label: 'Speed', short: 'SPD', hint: 'Rod movement' },
  power: { label: 'Power', short: 'POW', hint: 'Shot strength' },
  reflex: { label: 'Reflex', short: 'REF', hint: 'Reaction time' },
  control: { label: 'Control', short: 'CTL', hint: 'Traps & passes' },
  accuracy: { label: 'Accuracy', short: 'ACC', hint: 'Aim precision' },
};

export const STAT_CAP = 30;
export const STAT_MIN = 1;
export const STAT_MAX = 10;
export const PERK_POINTS = 8;

export type Stats = Record<StatKey, number>;

export type Shape = 'round' | 'square' | 'triangle' | 'hex' | 'star' | 'diamond';
export type Trail = 'none' | 'line' | 'sparkle' | 'fire' | 'rainbow' | 'smoke' | 'pixel' | 'bubbles';
export type GoalFx = 'confetti' | 'explosion' | 'fireworks' | 'lightning' | 'shockwave' | 'hearts' | 'pixels';
export type SoundPack = 'classic' | 'laser' | 'retro' | 'bass' | 'chime' | 'horn';

export interface Appearance {
  shape: Shape;
  color: string;
  accent: string;
  trail: Trail;
  goalFx: GoalFx;
  sound: SoundPack;
}

export interface Bot {
  id: string;
  name: string;
  stats: Stats;
  perks: string[];
  look: Appearance;
}

export interface BotRecord {
  played: number;
  wins: number;
  losses: number;
  gf: number;
  ga: number;
  elo: number;
}

export interface MatchSettings {
  goalsToWin: number; // 0 = unlimited (time only)
  timeLimit: number; // seconds, 0 = none
}

export interface MatchResult {
  a: string;
  b: string;
  scoreA: number;
  scoreB: number;
  winner: 'a' | 'b';
  overtime: boolean;
  duration: number;
}
