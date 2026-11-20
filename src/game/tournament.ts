export interface BracketMatch {
  a: string | null; // null = bye / tbd
  b: string | null;
  winner: string | null;
  score?: [number, number];
  ot?: boolean;
}

export type Bracket = BracketMatch[][];

export function shuffle<T>(arr: T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function makeBracket(ids: string[]): Bracket {
  const players = shuffle(ids);
  let size = 1;
  while (size < players.length) size *= 2;
  const rounds: Bracket = [];
  // spread byes: pair top half with bottom half
  const slots: (string | null)[] = [...players, ...Array(size - players.length).fill(null)];
  const first: BracketMatch[] = [];
  for (let i = 0; i < size / 2; i++) first.push({ a: slots[i], b: slots[size - 1 - i], winner: null });
  rounds.push(first);
  let n = size / 4;
  while (n >= 1) {
    rounds.push(Array.from({ length: n }, () => ({ a: null, b: null, winner: null })));
    n /= 2;
  }
  resolveByes(rounds);
  return rounds;
}

function resolveByes(rounds: Bracket) {
  rounds[0].forEach((m, i) => {
    if (m.a && !m.b) advance(rounds, 0, i, m.a);
    else if (!m.a && m.b) advance(rounds, 0, i, m.b);
  });
}

export function advance(rounds: Bracket, r: number, i: number, winner: string) {
  rounds[r][i].winner = winner;
  if (r + 1 < rounds.length) {
    const nm = rounds[r + 1][Math.floor(i / 2)];
    if (i % 2 === 0) nm.a = winner;
    else nm.b = winner;
  }
}

export function nextMatch(rounds: Bracket): { r: number; i: number } | null {
  for (let r = 0; r < rounds.length; r++) {
    for (let i = 0; i < rounds[r].length; i++) {
      const m = rounds[r][i];
      if (!m.winner && m.a && m.b) return { r, i };
    }
  }
  return null;
}

export function champion(rounds: Bracket): string | null {
  return rounds[rounds.length - 1][0].winner;
}

export function roundName(r: number, total: number) {
  const left = total - r;
  if (left === 1) return 'Final';
  if (left === 2) return 'Semis';
  if (left === 3) return 'Quarters';
  return `Round ${r + 1}`;
}

export function countPlayable(rounds: Bracket): { done: number; total: number } {
  let done = 0;
  let total = 0;
  rounds.forEach((rd, r) =>
    rd.forEach((m) => {
      const isBye = r === 0 && (!m.a || !m.b);
      if (isBye) return;
      total++;
      if (m.winner) done++;
    }),
  );
  return { done, total };
}
