import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { Match, W, H } from '../game/engine';
import { Renderer } from '../game/render';
import type { Bot } from '../game/types';
import { playGoal, playKick, unlockAudio } from '../game/audio';

export const DUMMY: Bot = {
  id: 'dummy',
  name: 'Dummy',
  stats: { speed: 5, power: 5, reflex: 5, control: 5, accuracy: 5 },
  perks: [],
  look: { shape: 'round', color: '#52525b', accent: '#a1a1aa', trail: 'none', goalFx: 'confetti', sound: 'classic' },
};

export interface PreviewHandle {
  testGoal: () => void;
  testSound: () => void;
}

export const Preview = forwardRef<PreviewHandle, { bot: Bot }>(function Preview({ bot }, ref) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const botRef = useRef(bot);
  const rRef = useRef<Renderer | null>(null);
  botRef.current = bot;

  useImperativeHandle(ref, () => ({
    testGoal() {
      unlockAudio();
      const r = rRef.current;
      if (!r) return;
      playGoal(botRef.current.look.sound);
      r.goalFx(botRef.current, W / 2, 0, 0);
      r.banner = { text: 'GOAL!', color: botRef.current.look.color, t: 1.3 };
    },
    testSound() {
      unlockAudio();
      playKick(botRef.current.look.sound, 800);
    },
  }));

  useEffect(() => {
    const r = new Renderer(canvasRef.current!);
    r.sound = false;
    rRef.current = r;
    let m = new Match(botRef.current, DUMMY, { goalsToWin: 0, timeLimit: 60 });
    r.setMatch(m);
    let raf = 0;
    let last = performance.now();
    let acc = 0;
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      // keep preview in sync with edits
      const b = botRef.current;
      m.teams[0].bot = b;
      m.teams[0].perks = new Set(b.perks);
      acc += dt;
      const steps = Math.floor(acc * 240);
      acc -= steps / 240;
      for (let i = 0; i < steps; i++) m.step();
      r.handle(m.events);
      m.events.length = 0;
      if (m.done) {
        m = new Match(b, DUMMY, { goalsToWin: 0, timeLimit: 60 });
        r.setMatch(m);
      }
      r.update(dt);
      r.draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  return <canvas ref={canvasRef} className="preview-canvas" style={{ aspectRatio: `${W + 32} / ${H + 32}` }} />;
});
