import { useEffect, useRef, useState } from 'react';
import { Match } from '../game/engine';
import { Renderer } from '../game/render';
import type { Bot, MatchResult, MatchSettings } from '../game/types';
import { ShapeIcon } from './common';
import { playWhistle } from '../game/audio';

interface Props {
  a: Bot;
  b: Bot;
  settings: MatchSettings;
  runId: number;
  speed: number;
  instant: boolean;
  paused: boolean;
  onDone: (r: MatchResult) => void;
}

interface Board {
  score: [number, number];
  clock: number;
  ot: boolean;
  done: boolean;
}

function fmtClock(s: number) {
  if (s < 0) return '∞';
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss.toString().padStart(2, '0')}`;
}

export function Arena({ a, b, settings, runId, speed, instant, paused, onDone }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const matchRef = useRef<Match | null>(null);
  const speedRef = useRef(speed);
  const pausedRef = useRef(paused);
  const doneRef = useRef(onDone);
  const finishNowRef = useRef<(() => void) | null>(null);
  const [board, setBoard] = useState<Board>({ score: [0, 0], clock: settings.timeLimit || -1, ot: false, done: false });
  speedRef.current = speed;
  pausedRef.current = paused;
  doneRef.current = onDone;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const r = new Renderer(canvas);
    rendererRef.current = r;
    const m = new Match(a, b, settings);
    matchRef.current = m;
    r.setMatch(m);
    let reported = false;
    const report = () => {
      if (reported) return;
      reported = true;
      const res: MatchResult = {
        a: a.id,
        b: b.id,
        scoreA: m.score[0],
        scoreB: m.score[1],
        winner: m.winner === 0 ? 'a' : 'b',
        overtime: m.overtime,
        duration: m.time,
      };
      doneRef.current(res);
    };
    let lastBoard = '';
    const syncBoard = () => {
      const tl = m.timeLeft();
      const clock = m.overtime ? m.otTime : tl;
      const key = `${m.score[0]}-${m.score[1]}-${Math.floor(clock)}-${m.overtime}-${m.done}`;
      if (key !== lastBoard) {
        lastBoard = key;
        setBoard({ score: [m.score[0], m.score[1]], clock, ot: m.overtime, done: m.done });
      }
    };

    finishNowRef.current = () => {
      if (m.done) return;
      m.simulateToEnd();
      m.events.length = 0;
      r.particles = [];
      playWhistle(true);
      report();
    };

    if (instant) {
      m.simulateToEnd();
      r.sound = false;
      syncBoard();
      r.draw();
      playWhistle(true);
      const t = setTimeout(report, 0);
      return () => clearTimeout(t);
    }

    playWhistle();
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      const dtReal = Math.min(0.05, (now - last) / 1000);
      last = now;
      const sp = speedRef.current;
      if (!pausedRef.current && !m.done) {
        acc += dtReal * sp;
        const steps = Math.floor(acc / (1 / 240));
        acc -= steps / 240;
        for (let i = 0; i < steps && !m.done; i++) m.step();
        r.sound = true;
        r.handle(m.events, sp >= 8);
        m.events.length = 0;
        if (m.done) report();
      }
      if (!pausedRef.current) r.update(dtReal * Math.min(sp, 2));
      r.draw();
      syncBoard();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  useEffect(() => {
    if (instant) finishNowRef.current?.();
  }, [instant]);

  const winner = board.done ? (board.score[0] > board.score[1] ? a : board.score[1] > board.score[0] ? b : matchRef.current?.winner === 0 ? a : b) : null;

  return (
    <div className="arena">
      <div className="scoreboard">
        <TeamPill bot={a} score={board.score[0]} side="left" lead={board.score[0] > board.score[1]} />
        <div className={`clock ${board.ot ? 'clock-ot' : ''}`}>
          <span>{board.ot ? 'OT ' + fmtClock(board.clock) : fmtClock(board.clock)}</span>
          {settings.goalsToWin > 0 && <span className="clock-sub">to {settings.goalsToWin}</span>}
        </div>
        <TeamPill bot={b} score={board.score[1]} side="right" lead={board.score[1] > board.score[0]} />
      </div>
      <div className="canvas-wrap">
        <canvas ref={canvasRef} className="field" />
        {winner && (
          <div className="winner-overlay">
            <ShapeIcon shape={winner.look.shape} color={winner.look.color} accent={winner.look.accent} size={40} />
            <div className="winner-name">{winner.name} wins!</div>
            <div className="winner-score">
              {board.score[0]} – {board.score[1]}
              {board.ot ? ' (OT)' : ''}
            </div>
          </div>
        )}
        {paused && !winner && <div className="paused-overlay">PAUSED</div>}
      </div>
    </div>
  );
}

function TeamPill({ bot, score, side, lead }: { bot: Bot; score: number; side: 'left' | 'right'; lead: boolean }) {
  return (
    <div className={`team-pill ${side === 'right' ? 'pill-right' : ''}`} style={{ borderColor: bot.look.color }}>
      <ShapeIcon shape={bot.look.shape} color={bot.look.color} accent={bot.look.accent} size={18} />
      <span className="team-name ellipsis">{bot.name}</span>
      <span className="team-score" style={{ color: lead ? bot.look.color : undefined }}>
        {score}
      </span>
    </div>
  );
}
