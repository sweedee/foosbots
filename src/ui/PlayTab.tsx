import { useEffect, useMemo, useRef, useState } from 'react';
import { Button } from '@dynatrace/strato-components/buttons';
import { Select, Switch, ToggleButtonGroup, Checkbox } from '@dynatrace/strato-components/forms';
import { Flex, Surface } from '@dynatrace/strato-components/layouts';
import { Heading, Text, Strong } from '@dynatrace/strato-components/typography';
import { ProgressBar } from '@dynatrace/strato-components/content';
import { Arena } from './Arena';
import { BotBadge, pct } from './common';
import { botById, recordResult, setPrefs, useStore, type Speed } from '../game/store';
import type { Bot, MatchResult } from '../game/types';
import { advance, champion, countPlayable, makeBracket, nextMatch, roundName, type Bracket } from '../game/tournament';
import { unlockAudio } from '../game/audio';

type Mode = '1v1' | 'tourney' | 'bench';

interface BenchRow {
  opp: string;
  w: number;
  l: number;
  gf: number;
  ga: number;
}

interface Session {
  kind: Mode;
  a: string;
  b: string;
  runId: number;
  finished: boolean;
  // 1v1
  randomOpp?: boolean;
  // tourney
  bracket?: Bracket;
  cur?: { r: number; i: number };
  // bench
  benchQueue?: string[];
  bench?: BenchRow[];
  benchGames?: number;
  over?: boolean;
}

const GOAL_OPTS = [1, 3, 5, 7, 10, 0];
const TIME_OPTS = [60, 120, 180, 300, 0];

let runCounter = 1;

function pickRandom(bots: Bot[], not: string) {
  const pool = bots.filter((b) => b.id !== not);
  return pool[Math.floor(Math.random() * pool.length)]?.id ?? not;
}

export function PlayTab() {
  const bots = useStore((s) => s.bots);
  const prefs = useStore((s) => s.prefs);
  const currentBot = useStore((s) => s.currentBot);
  const [mode, setMode] = useState<Mode>('1v1');
  const [pickA, setPickA] = useState<string>(currentBot);
  const [pickB, setPickB] = useState<string>('random');
  const [entrants, setEntrants] = useState<string[] | null>(null);
  const [benchGames, setBenchGames] = useState(1);
  const [session, setSession] = useState<Session | null>(null);
  const [paused, setPaused] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);

  const ids = bots.map((b) => b.id);
  const tEntrants = (entrants ?? ids).filter((id) => ids.includes(id));
  const validA = ids.includes(pickA) ? pickA : ids[0];

  useEffect(() => setPickA(currentBot), [currentBot]);

  const hasNext = useMemo(() => {
    if (!session || !session.finished) return false;
    if (session.kind === '1v1') return true;
    return !session.over;
  }, [session]);

  // ---- auto mode countdown ----
  const sessionRef = useRef(session);
  sessionRef.current = session;
  useEffect(() => {
    if (!session?.finished || !prefs.auto || !hasNext) {
      setCountdown(null);
      return;
    }
    const total = prefs.instant ? 1.2 : 3;
    const start = performance.now();
    setCountdown(Math.ceil(total));
    const iv = setInterval(() => {
      const left = total - (performance.now() - start) / 1000;
      if (left <= 0) {
        clearInterval(iv);
        setCountdown(null);
        goNext();
      } else setCountdown(Math.ceil(left));
    }, 100);
    return () => clearInterval(iv);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.finished, session?.runId, prefs.auto, hasNext]);

  function start() {
    unlockAudio();
    setPaused(false);
    if (mode === '1v1') {
      const random = pickB === 'random';
      const b = random ? pickRandom(bots, validA) : pickB;
      setSession({ kind: '1v1', a: validA, b, runId: runCounter++, finished: false, randomOpp: random });
    } else if (mode === 'tourney') {
      const bracket = makeBracket(tEntrants);
      const cur = nextMatch(bracket)!;
      const m = bracket[cur.r][cur.i];
      setSession({ kind: 'tourney', a: m.a!, b: m.b!, runId: runCounter++, finished: false, bracket, cur });
    } else {
      const queue: string[] = [];
      ids.filter((id) => id !== validA).forEach((id) => {
        for (let k = 0; k < benchGames; k++) queue.push(id);
      });
      const [first, ...rest] = queue;
      setSession({ kind: 'bench', a: validA, b: first, runId: runCounter++, finished: false, benchQueue: rest, bench: [], benchGames });
    }
  }

  function onDone(r: MatchResult) {
    recordResult(r);
    setSession((s) => {
      if (!s) return s;
      const ns: Session = { ...s, finished: true };
      if (s.kind === 'tourney' && s.bracket && s.cur) {
        const br = s.bracket.map((rd) => rd.map((m) => ({ ...m })));
        br[s.cur.r][s.cur.i].score = [r.scoreA, r.scoreB];
        br[s.cur.r][s.cur.i].ot = r.overtime;
        advance(br, s.cur.r, s.cur.i, r.winner === 'a' ? r.a : r.b);
        ns.bracket = br;
        ns.over = !nextMatch(br);
      }
      if (s.kind === 'bench') {
        const rows = (s.bench ?? []).map((x) => ({ ...x }));
        let row = rows.find((x) => x.opp === r.b);
        if (!row) {
          row = { opp: r.b, w: 0, l: 0, gf: 0, ga: 0 };
          rows.push(row);
        }
        if (r.winner === 'a') row.w++;
        else row.l++;
        row.gf += r.scoreA;
        row.ga += r.scoreB;
        ns.bench = rows;
        ns.over = !s.benchQueue?.length;
      }
      return ns;
    });
  }

  function goNext() {
    const s = sessionRef.current;
    if (!s) return;
    setPaused(false);
    if (s.kind === '1v1') {
      const b = s.randomOpp ? pickRandom(bots, s.a) : s.b;
      setSession({ ...s, b, runId: runCounter++, finished: false });
    } else if (s.kind === 'tourney' && s.bracket) {
      const cur = nextMatch(s.bracket);
      if (!cur) return;
      const m = s.bracket[cur.r][cur.i];
      setSession({ ...s, a: m.a!, b: m.b!, cur, runId: runCounter++, finished: false });
    } else if (s.kind === 'bench' && s.benchQueue?.length) {
      const [b, ...rest] = s.benchQueue;
      setSession({ ...s, b, benchQueue: rest, runId: runCounter++, finished: false });
    }
  }

  const botA = session ? botById(session.a) : undefined;
  const botB = session ? botById(session.b) : undefined;

  if (bots.length < 2) {
    return (
      <Surface>
        <Text>Create at least 2 bots to play.</Text>
      </Surface>
    );
  }

  return (
    <div className="play-layout">
      {/* -------- left / top: setup or arena -------- */}
      <div className="play-main">
        {session && botA && botB ? (
          <>
            <Arena
              key={session.runId}
              a={botA}
              b={botB}
              settings={prefs.match}
              runId={session.runId}
              speed={prefs.speed}
              instant={prefs.instant}
              paused={paused}
              onDone={onDone}
            />
            <Controls
              paused={paused}
              setPaused={setPaused}
              finished={session.finished}
              hasNext={hasNext}
              countdown={countdown}
              onNext={goNext}
              onStop={() => setSession(null)}
              nextLabel={session.kind === '1v1' ? (session.randomOpp ? 'New match' : 'Rematch') : 'Next'}
            />
          </>
        ) : (
          <Setup
            mode={mode}
            setMode={setMode}
            bots={bots}
            pickA={validA}
            setPickA={setPickA}
            pickB={pickB}
            setPickB={setPickB}
            entrants={tEntrants}
            setEntrants={setEntrants}
            benchGames={benchGames}
            setBenchGames={setBenchGames}
            onStart={start}
          />
        )}
      </div>

      {/* -------- side panel -------- */}
      <div className="play-side">
        {session?.kind === 'tourney' && session.bracket && <BracketView bracket={session.bracket} cur={session.finished ? undefined : session.cur} />}
        {session?.kind === 'bench' && <BenchView session={session} />}
        {!session && <RulesPanel />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------

function Setup(p: {
  mode: Mode;
  setMode: (m: Mode) => void;
  bots: Bot[];
  pickA: string;
  setPickA: (s: string) => void;
  pickB: string;
  setPickB: (s: string) => void;
  entrants: string[];
  setEntrants: (s: string[]) => void;
  benchGames: number;
  setBenchGames: (n: number) => void;
  onStart: () => void;
}) {
  const canStart = p.mode === 'tourney' ? p.entrants.length >= 2 : true;
  return (
    <Surface className="setup">
      <Flex flexDirection="column" gap={16}>
        <ToggleButtonGroup value={p.mode} onChange={(v) => p.setMode(v as Mode)} width="full">
          <ToggleButtonGroup.Item value="1v1">1v1</ToggleButtonGroup.Item>
          <ToggleButtonGroup.Item value="tourney">Tournament</ToggleButtonGroup.Item>
          <ToggleButtonGroup.Item value="bench">Benchmark</ToggleButtonGroup.Item>
        </ToggleButtonGroup>

        {p.mode === '1v1' && (
          <Flex flexDirection="column" gap={12}>
            <Field label="Your bot">
              <BotSelect bots={p.bots} value={p.pickA} onChange={p.setPickA} />
            </Field>
            <Field label="Opponent">
              <BotSelect bots={p.bots.filter((b) => b.id !== p.pickA)} value={p.pickB} onChange={p.setPickB} allowRandom />
            </Field>
          </Flex>
        )}

        {p.mode === 'tourney' && (
          <Flex flexDirection="column" gap={8}>
            <Flex justifyContent="space-between" alignItems="center">
              <Text>
                <Strong>{p.entrants.length}</Strong> entrants · knockout
              </Text>
              <Flex gap={4}>
                <Button size="condensed" onClick={() => p.setEntrants(p.bots.map((b) => b.id))}>
                  All
                </Button>
                <Button size="condensed" onClick={() => p.setEntrants([])}>
                  None
                </Button>
              </Flex>
            </Flex>
            <div className="entrant-grid">
              {p.bots.map((b) => (
                <Checkbox
                  key={b.id}
                  value={p.entrants.includes(b.id)}
                  onChange={(v) => p.setEntrants(v ? [...p.entrants, b.id] : p.entrants.filter((x) => x !== b.id))}
                >
                  <BotBadge bot={b} size={16} />
                </Checkbox>
              ))}
            </div>
          </Flex>
        )}

        {p.mode === 'bench' && (
          <Flex flexDirection="column" gap={12}>
            <Field label="Bot to test">
              <BotSelect bots={p.bots} value={p.pickA} onChange={p.setPickA} />
            </Field>
            <Field label="Games per opponent">
              <ToggleButtonGroup value={String(p.benchGames)} onChange={(v) => p.setBenchGames(Number(v))}>
                {[1, 3, 5].map((n) => (
                  <ToggleButtonGroup.Item key={n} value={String(n)}>
                    {n}
                  </ToggleButtonGroup.Item>
                ))}
              </ToggleButtonGroup>
            </Field>
            <Text className="muted small">Plays every other bot ({p.bots.length - 1} opponents).</Text>
          </Flex>
        )}

        <MatchRules />

        <Button variant="emphasized" color="primary" width="full" onClick={p.onStart} disabled={!canStart}>
          ▶ Start
        </Button>
      </Flex>
    </Surface>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="field-row">
      <span className="field-label">{label}</span>
      <div className="field-ctl">{children}</div>
    </div>
  );
}

function BotSelect({ bots, value, onChange, allowRandom }: { bots: Bot[]; value: string; onChange: (v: string) => void; allowRandom?: boolean }) {
  return (
    <Select value={value} onChange={(v) => v && onChange(v as string)}>
      <Select.Content>
        {allowRandom && <Select.Option value="random">🎲 Random</Select.Option>}
        {bots.map((b) => (
          <Select.Option key={b.id} value={b.id}>
            {b.name}
          </Select.Option>
        ))}
      </Select.Content>
    </Select>
  );
}

function MatchRules() {
  const m = useStore((s) => s.prefs.match);
  return (
    <div className="rules-row">
      <Field label="Goals to win">
        <Select
          value={String(m.goalsToWin)}
          onChange={(v) => {
            const g = Number(v);
            setPrefs({ match: { ...m, goalsToWin: g, timeLimit: g === 0 && m.timeLimit === 0 ? 120 : m.timeLimit } });
          }}
        >
          <Select.Content>
            {GOAL_OPTS.map((g) => (
              <Select.Option key={g} value={String(g)}>
                {g === 0 ? 'No limit' : String(g)}
              </Select.Option>
            ))}
          </Select.Content>
        </Select>
      </Field>
      <Field label="Time">
        <Select
          value={String(m.timeLimit)}
          onChange={(v) => {
            const t = Number(v);
            setPrefs({ match: { ...m, timeLimit: t, goalsToWin: t === 0 && m.goalsToWin === 0 ? 5 : m.goalsToWin } });
          }}
        >
          <Select.Content>
            {TIME_OPTS.map((t) => (
              <Select.Option key={t} value={String(t)}>
                {t === 0 ? 'No limit' : `${t / 60} min`}
              </Select.Option>
            ))}
          </Select.Content>
        </Select>
      </Field>
    </div>
  );
}

function RulesPanel() {
  return (
    <Surface>
      <Flex flexDirection="column" gap={6}>
        <Heading level={6}>How it works</Heading>
        <Text className="small">⚽ Bots play on their own — you build them.</Text>
        <Text className="small">⏱ Tied at full time? Sudden death: next goal wins, goals grow wider.</Text>
        <Text className="small">🏆 Every match counts toward Elo in Ranks.</Text>
      </Flex>
    </Surface>
  );
}

function Controls(p: {
  paused: boolean;
  setPaused: (b: boolean) => void;
  finished: boolean;
  hasNext: boolean;
  countdown: number | null;
  onNext: () => void;
  onStop: () => void;
  nextLabel: string;
}) {
  const prefs = useStore((s) => s.prefs);
  return (
    <Flex flexDirection="column" gap={8} className="controls">
      <Flex gap={8} alignItems="center" flexWrap="wrap">
        {!p.finished && (
          <Button onClick={() => p.setPaused(!p.paused)} aria-label={p.paused ? 'Resume' : 'Pause'}>
            {p.paused ? '▶' : '❚❚'}
          </Button>
        )}
        {p.finished && p.hasNext && (
          <Button variant="emphasized" color="primary" onClick={p.onNext}>
            {p.countdown !== null ? `${p.nextLabel} (${p.countdown})` : p.nextLabel}
          </Button>
        )}
        {p.finished && !p.hasNext && <Text className="muted">All done!</Text>}
        <ToggleButtonGroup value={String(prefs.speed)} onChange={(v) => setPrefs({ speed: Number(v) as Speed })}>
          {[1, 2, 4, 8].map((n) => (
            <ToggleButtonGroup.Item key={n} value={String(n)}>
              {n}x
            </ToggleButtonGroup.Item>
          ))}
        </ToggleButtonGroup>
        <span style={{ flex: 1 }} />
        <Button onClick={p.onStop} color="critical">
          ■ Stop
        </Button>
      </Flex>
      <Flex gap={16} flexWrap="wrap" alignItems="center">
        <Switch value={prefs.instant} onChange={(v: boolean) => setPrefs({ instant: v })}>
          ⚡ Instant
        </Switch>
        <Switch value={prefs.auto} onChange={(v: boolean) => setPrefs({ auto: v })}>
          🔁 Auto next
        </Switch>
      </Flex>
    </Flex>
  );
}

function BracketView({ bracket, cur }: { bracket: Bracket; cur?: { r: number; i: number } }) {
  const { done, total } = countPlayable(bracket);
  const champ = champion(bracket);
  const champBot = champ ? botById(champ) : undefined;
  return (
    <Surface>
      <Flex flexDirection="column" gap={12}>
        <Flex justifyContent="space-between" alignItems="center">
          <Heading level={6}>Bracket</Heading>
          <Text className="small muted">
            {done}/{total}
          </Text>
        </Flex>
        <ProgressBar value={(done / Math.max(1, total)) * 100} />
        {champBot && (
          <div className="champion" style={{ borderColor: champBot.look.color }}>
            🏆 <BotBadge bot={champBot} bold /> champion!
          </div>
        )}
        <div className="bracket">
          {bracket.map((rd, r) => (
            <div key={r} className="bracket-round">
              <div className="bracket-round-title">{roundName(r, bracket.length)}</div>
              <div className="bracket-round-body">
              {rd.map((m, i) => {
                if (r === 0 && (!m.a || !m.b)) return null;
                const live = cur && cur.r === r && cur.i === i;
                return (
                  <div key={i} className={`bracket-match ${live ? 'live' : ''}`}>
                    <BracketSlot id={m.a} win={!!m.winner && m.winner === m.a} score={m.score?.[0]} />
                    <BracketSlot id={m.b} win={!!m.winner && m.winner === m.b} score={m.score?.[1]} />
                  </div>
                );
              })}
              </div>
            </div>
          ))}
        </div>
      </Flex>
    </Surface>
  );
}

function BracketSlot({ id, win, score }: { id: string | null; win: boolean; score?: number }) {
  const bot = id ? botById(id) : undefined;
  return (
    <div className={`bracket-slot ${win ? 'win' : ''}`}>
      {bot ? <BotBadge bot={bot} size={14} /> : <span className="muted">TBD</span>}
      <span className="bracket-score">{score ?? ''}</span>
    </div>
  );
}

function BenchView({ session }: { session: Session }) {
  const bot = botById(session.a);
  const rows = session.bench ?? [];
  const totalGames = rows.reduce((s, r) => s + r.w + r.l, 0) + (session.benchQueue?.length ?? 0) + (session.finished ? 0 : 1);
  const played = rows.reduce((s, r) => s + r.w + r.l, 0);
  const w = rows.reduce((s, r) => s + r.w, 0);
  const sorted = [...rows].sort((x, y) => y.w - y.l - (x.w - x.l));
  return (
    <Surface>
      <Flex flexDirection="column" gap={12}>
        <Flex justifyContent="space-between" alignItems="center">
          <Heading level={6}>Benchmark</Heading>
          <Text className="small muted">
            {played}/{totalGames}
          </Text>
        </Flex>
        <ProgressBar value={(played / Math.max(1, totalGames)) * 100} />
        {bot && (
          <div className="bench-summary">
            <BotBadge bot={bot} bold />
            <span className="bench-rate" style={{ color: bot.look.color }}>
              {pct(w, played)}%
            </span>
            <span className="muted small">
              {w}W {played - w}L
            </span>
          </div>
        )}
        <div className="bench-list">
          {sorted.map((r) => {
            const o = botById(r.opp);
            if (!o) return null;
            const res = r.w > r.l ? 'win' : r.w < r.l ? 'loss' : 'even';
            return (
              <div key={r.opp} className={`bench-row ${res}`}>
                <span className="muted small">vs</span>
                <BotBadge bot={o} size={14} />
                <span className="bench-wl">
                  {r.w}-{r.l}
                </span>
                <span className="muted small">
                  {r.gf}:{r.ga}
                </span>
              </div>
            );
          })}
        </div>
      </Flex>
    </Surface>
  );
}
