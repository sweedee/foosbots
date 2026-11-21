import { useSyncExternalStore } from 'react';
import type { Bot, BotRecord, MatchResult, MatchSettings } from './types';
import { DEFAULT_BOTS } from './defaults';
import { fixBots, fixHistory, fixRecords, isObj, num, oneOf } from './sanitize';

export type Speed = 1 | 2 | 4 | 8;

export interface Prefs {
  speed: Speed;
  instant: boolean;
  auto: boolean;
  muted: boolean;
  match: MatchSettings;
}

export interface State {
  bots: Bot[];
  records: Record<string, BotRecord>;
  history: MatchResult[];
  prefs: Prefs;
  currentBot: string;
}

const KEY = 'foosbots:v1';
const START_ELO = 1000;

function initial(): State {
  return {
    bots: DEFAULT_BOTS.map((b) => structuredClone(b)),
    records: {},
    history: [],
    prefs: { speed: 1, instant: false, auto: false, muted: false, match: { goalsToWin: 5, timeLimit: 120 } },
    currentBot: DEFAULT_BOTS[0].id,
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return repair(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  return initial();
}

/** Rebuilds a valid State from whatever was stored (older versions, other apps on the same origin, ...). */
function repair(raw: unknown): State {
  const init = initial();
  if (!isObj(raw)) return init;
  const bots = fixBots(raw.bots);
  const ids = new Set(bots.map((b) => b.id));
  const p = isObj(raw.prefs) ? raw.prefs : {};
  const m = isObj(p.match) ? p.match : {};
  let goalsToWin = Math.max(0, Math.min(99, Math.round(num(m.goalsToWin, init.prefs.match.goalsToWin))));
  const timeLimit = Math.max(0, Math.min(3600, Math.round(num(m.timeLimit, init.prefs.match.timeLimit))));
  if (goalsToWin === 0 && timeLimit === 0) goalsToWin = 5;
  return {
    bots,
    records: fixRecords(raw.records, ids),
    history: fixHistory(raw.history, ids),
    prefs: {
      speed: oneOf(p.speed, [1, 2, 4, 8] as Speed[], 1),
      instant: p.instant === true,
      auto: p.auto === true,
      muted: p.muted === true,
      match: { goalsToWin, timeLimit },
    },
    currentBot: typeof raw.currentBot === 'string' && ids.has(raw.currentBot) ? raw.currentBot : bots[0].id,
  };
}

let state: State = load();
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function save() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* ignore */
    }
  }, 300);
}

export function getState() {
  return state;
}

export function setState(fn: (s: State) => State) {
  state = fn(state);
  save();
  listeners.forEach((l) => l());
}

export function useStore<T>(sel: (s: State) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => sel(state),
  );
}

export function emptyRecord(): BotRecord {
  return { played: 0, wins: 0, losses: 0, gf: 0, ga: 0, elo: START_ELO };
}

export function recordOf(id: string): BotRecord {
  return state.records[id] ?? emptyRecord();
}

export function recordResult(r: MatchResult) {
  setState((s) => {
    const ra = { ...(s.records[r.a] ?? emptyRecord()) };
    const rb = { ...(s.records[r.b] ?? emptyRecord()) };
    const ea = 1 / (1 + Math.pow(10, (rb.elo - ra.elo) / 400));
    const sa = r.winner === 'a' ? 1 : 0;
    const K = 32;
    const d = K * (sa - ea);
    ra.elo = Math.round((ra.elo + d) * 10) / 10;
    rb.elo = Math.round((rb.elo - d) * 10) / 10;
    ra.played++;
    rb.played++;
    ra.gf += r.scoreA;
    ra.ga += r.scoreB;
    rb.gf += r.scoreB;
    rb.ga += r.scoreA;
    if (sa) {
      ra.wins++;
      rb.losses++;
    } else {
      rb.wins++;
      ra.losses++;
    }
    return {
      ...s,
      records: { ...s.records, [r.a]: ra, [r.b]: rb },
      history: [r, ...s.history].slice(0, 200),
    };
  });
}

export function resetRecords() {
  setState((s) => ({ ...s, records: {}, history: [] }));
}

export function setPrefs(p: Partial<Prefs>) {
  setState((s) => ({ ...s, prefs: { ...s.prefs, ...p } }));
}

export function saveBot(bot: Bot) {
  setState((s) => {
    const exists = s.bots.some((b) => b.id === bot.id);
    return { ...s, bots: exists ? s.bots.map((b) => (b.id === bot.id ? bot : b)) : [...s.bots, bot] };
  });
}

export function deleteBot(id: string) {
  setState((s) => {
    const bots = s.bots.filter((b) => b.id !== id);
    const records = { ...s.records };
    delete records[id];
    return { ...s, bots, records, currentBot: s.currentBot === id ? bots[0]?.id ?? '' : s.currentBot };
  });
}

export function setCurrentBot(id: string) {
  setState((s) => ({ ...s, currentBot: id }));
}

export function botById(id: string): Bot | undefined {
  return state.bots.find((b) => b.id === id);
}
