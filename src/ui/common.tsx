import type { Bot, Shape } from '../game/types';
import { STAT_KEYS, STAT_INFO } from '../game/types';
import { PERK_MAP } from '../game/perks';

const SHAPE_PATHS: Record<Shape, string> = {
  round: 'M12 4a8 8 0 1 0 0.001 0Z',
  square: 'M4 4h16v16H4Z',
  triangle: 'M12 3L21 20H3Z',
  diamond: 'M12 2L21 12L12 22L3 12Z',
  hex: 'M7 3h10l5 9-5 9H7l-5-9Z',
  star: 'M12 2l2.9 6.6 7.1.7-5.4 4.8 1.6 7-6.2-3.7-6.2 3.7 1.6-7L2 9.3l7.1-.7Z',
};

export function ShapeIcon({ shape, color, accent, size = 22 }: { shape: Shape; color: string; accent?: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ flexShrink: 0, display: 'block' }} aria-hidden>
      <path d={SHAPE_PATHS[shape]} fill={color} stroke={accent ?? 'rgba(255,255,255,.6)'} strokeWidth={1.6} strokeLinejoin="round" />
    </svg>
  );
}

export function BotBadge({ bot, size = 22, bold }: { bot: Bot; size?: number; bold?: boolean }) {
  return (
    <span className="bot-badge" style={{ fontWeight: bold ? 700 : 500 }}>
      <ShapeIcon shape={bot.look.shape} color={bot.look.color} accent={bot.look.accent} size={size} />
      <span className="ellipsis">{bot.name}</span>
    </span>
  );
}

export function MiniStats({ bot }: { bot: Bot }) {
  return (
    <div className="mini-stats">
      {STAT_KEYS.map((k) => (
        <div key={k} className="mini-stat" title={STAT_INFO[k].label}>
          <span className="mini-stat-label">{STAT_INFO[k].short}</span>
          <span className="mini-stat-bar">
            <span style={{ width: `${bot.stats[k] * 10}%`, background: bot.look.color }} />
          </span>
          <span className="mini-stat-val">{bot.stats[k]}</span>
        </div>
      ))}
    </div>
  );
}

export function PerkIcons({ bot }: { bot: Bot }) {
  if (!bot.perks.length) return <span className="muted small">No perks</span>;
  return (
    <span className="perk-icons">
      {bot.perks.map((p) => (
        <span key={p} title={PERK_MAP[p]?.name}>
          {PERK_MAP[p]?.icon}
        </span>
      ))}
    </span>
  );
}

export function pct(w: number, p: number) {
  return p ? Math.round((w / p) * 100) : 0;
}
