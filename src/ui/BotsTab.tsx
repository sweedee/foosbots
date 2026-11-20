import { useRef, useState } from 'react';
import { Button } from '@dynatrace/strato-components/buttons';
import { Checkbox, Select, TextInput } from '@dynatrace/strato-components/forms';
import { Flex, Surface } from '@dynatrace/strato-components/layouts';
import { Text, Strong } from '@dynatrace/strato-components/typography';
import { Chip } from '@dynatrace/strato-components/content';
import { Modal } from '@dynatrace/strato-components/overlays';
import { Tabs, Tab } from '@dynatrace/strato-components/navigation';
import { BotBadge, MiniStats, PerkIcons, ShapeIcon, pct } from './common';
import { Preview, type PreviewHandle } from './Preview';
import { Field } from './PlayTab';
import { deleteBot, recordOf, saveBot, setCurrentBot, useStore } from '../game/store';
import { uid } from '../game/defaults';
import { PERKS, perkCost, perkReqMet, reqText } from '../game/perks';
import {
  PERK_POINTS,
  STAT_CAP,
  STAT_INFO,
  STAT_KEYS,
  STAT_MAX,
  STAT_MIN,
  type Bot,
  type GoalFx,
  type Shape,
  type SoundPack,
  type StatKey,
  type Trail,
} from '../game/types';

const SHAPES: Shape[] = ['round', 'square', 'triangle', 'diamond', 'hex', 'star'];
const COLORS = ['#ef4444', '#f97316', '#facc15', '#22c55e', '#14b8a6', '#38bdf8', '#6366f1', '#a855f7', '#ec4899', '#f5f5f5', '#64748b', '#a16207'];
const TRAILS: { v: Trail; l: string }[] = [
  { v: 'none', l: 'None' },
  { v: 'line', l: 'Streak' },
  { v: 'sparkle', l: 'Sparkle ✨' },
  { v: 'fire', l: 'Fire 🔥' },
  { v: 'rainbow', l: 'Rainbow 🌈' },
  { v: 'smoke', l: 'Smoke 💨' },
  { v: 'pixel', l: 'Pixels 👾' },
  { v: 'bubbles', l: 'Bubbles 🫧' },
];
const GOALFX: { v: GoalFx; l: string }[] = [
  { v: 'confetti', l: 'Confetti 🎉' },
  { v: 'explosion', l: 'Explosion 💥' },
  { v: 'fireworks', l: 'Fireworks 🎆' },
  { v: 'lightning', l: 'Lightning ⚡' },
  { v: 'shockwave', l: 'Shockwave 🌊' },
  { v: 'hearts', l: 'Hearts 💖' },
  { v: 'pixels', l: 'Pixel rain 👾' },
];
const SOUNDS: { v: SoundPack; l: string }[] = [
  { v: 'classic', l: 'Classic' },
  { v: 'laser', l: 'Laser' },
  { v: 'retro', l: '8-bit' },
  { v: 'bass', l: 'Bass drop' },
  { v: 'chime', l: 'Chime' },
  { v: 'horn', l: 'Air horn' },
];

const NAMES = ['Rusty', 'Nova', 'Turbo', 'Pixel', 'Gizmo', 'Bolt', 'Sprocket', 'Echo', 'Zap', 'Widget', 'Cog', 'Quark'];

function newBot(): Bot {
  return {
    id: uid(),
    name: NAMES[Math.floor(Math.random() * NAMES.length)] + ' ' + Math.floor(Math.random() * 90 + 10),
    stats: { speed: 5, power: 5, reflex: 5, control: 5, accuracy: 5 },
    perks: [],
    look: {
      shape: SHAPES[Math.floor(Math.random() * SHAPES.length)],
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      accent: '#ffffff',
      trail: 'line',
      goalFx: 'confetti',
      sound: 'classic',
    },
  };
}

export function BotsTab() {
  const bots = useStore((s) => s.bots);
  const current = useStore((s) => s.currentBot);
  useStore((s) => s.records);
  const [editing, setEditing] = useState<Bot | null>(null);
  const [toDelete, setToDelete] = useState<Bot | null>(null);

  if (editing) {
    return (
      <Editor
        initial={editing}
        onCancel={() => setEditing(null)}
        onSave={(b) => {
          saveBot(b);
          setEditing(null);
        }}
      />
    );
  }

  return (
    <Flex flexDirection="column" gap={12}>
      <Flex justifyContent="space-between" alignItems="center">
        <Text>
          <Strong>{bots.length}</Strong> bots
        </Text>
        <Button variant="emphasized" color="primary" onClick={() => setEditing(newBot())}>
          + New bot
        </Button>
      </Flex>
      <div className="bot-grid">
        {bots.map((b) => {
          const r = recordOf(b.id);
          return (
            <Surface key={b.id} className={`bot-card ${b.id === current ? 'is-current' : ''}`} style={{ borderLeft: `4px solid ${b.look.color}` }}>
              <Flex flexDirection="column" gap={8}>
                <Flex justifyContent="space-between" alignItems="center" gap={8}>
                  <BotBadge bot={b} size={24} bold />
                  <button className="star-btn" title="Set as my bot" onClick={() => setCurrentBot(b.id)} aria-label="Set as my bot">
                    {b.id === current ? '★' : '☆'}
                  </button>
                </Flex>
                <MiniStats bot={b} />
                <Flex justifyContent="space-between" alignItems="center">
                  <PerkIcons bot={b} />
                  <span className="small muted">
                    Elo {Math.round(r.elo)} · {r.played ? `${pct(r.wins, r.played)}%` : 'new'}
                  </span>
                </Flex>
                <Flex gap={4}>
                  <Button size="condensed" onClick={() => setEditing(structuredClone(b))}>
                    Edit
                  </Button>
                  <Button size="condensed" onClick={() => saveBot({ ...structuredClone(b), id: uid(), name: b.name + ' 2' })}>
                    Copy
                  </Button>
                  <span style={{ flex: 1 }} />
                  <Button size="condensed" color="critical" onClick={() => setToDelete(b)} disabled={bots.length <= 2}>
                    Delete
                  </Button>
                </Flex>
              </Flex>
            </Surface>
          );
        })}
      </div>
      <Modal
        title="Delete bot?"
        show={!!toDelete}
        onDismiss={() => setToDelete(null)}
        size="small"
        footer={
          <Flex justifyContent="flex-end" gap={8}>
            <Button onClick={() => setToDelete(null)}>Cancel</Button>
            <Button
              color="critical"
              variant="emphasized"
              onClick={() => {
                if (toDelete) deleteBot(toDelete.id);
                setToDelete(null);
              }}
            >
              Delete
            </Button>
          </Flex>
        }
      >
        <Text>{toDelete?.name} and its record will be removed.</Text>
      </Modal>
    </Flex>
  );
}

// ------------------------------------------------------------------

function Editor({ initial, onCancel, onSave }: { initial: Bot; onCancel: () => void; onSave: (b: Bot) => void }) {
  const [bot, setBot] = useState<Bot>(initial);
  const [tab, setTab] = useState(0);
  const [note, setNote] = useState('');
  const previewRef = useRef<PreviewHandle>(null);

  const statTotal = STAT_KEYS.reduce((s, k) => s + bot.stats[k], 0);
  const perkUsed = perkCost(bot.perks);

  const setLook = (p: Partial<Bot['look']>) => setBot((b) => ({ ...b, look: { ...b.look, ...p } }));

  const setStat = (k: StatKey, v: number) => {
    setBot((b) => {
      const total = STAT_KEYS.reduce((s, kk) => s + (kk === k ? 0 : b.stats[kk]), 0);
      const nv = Math.max(STAT_MIN, Math.min(STAT_MAX, v, STAT_CAP - total));
      const stats = { ...b.stats, [k]: nv };
      const lost = b.perks.filter((id) => !perkReqMet(PERKS.find((p) => p.id === id)!, stats));
      if (lost.length) setNote(`Removed: ${lost.map((id) => PERKS.find((p) => p.id === id)!.name).join(', ')}`);
      else setNote('');
      return { ...b, stats, perks: b.perks.filter((id) => !lost.includes(id)) };
    });
  };

  const togglePerk = (id: string, on: boolean) => setBot((b) => ({ ...b, perks: on ? [...b.perks, id] : b.perks.filter((x) => x !== id) }));

  return (
    <div className="editor">
      <div className="editor-preview">
        <Preview ref={previewRef} bot={bot} />
        <Flex gap={6} justifyContent="center" flexWrap="wrap">
          <Button size="condensed" onClick={() => previewRef.current?.testGoal()}>
            🎉 Test goal
          </Button>
          <Button size="condensed" onClick={() => previewRef.current?.testSound()}>
            🔊 Kick
          </Button>
        </Flex>
      </div>
      <div className="editor-body">
        <Flex flexDirection="column" gap={12}>
          <Flex gap={8} alignItems="center">
            <ShapeIcon shape={bot.look.shape} color={bot.look.color} accent={bot.look.accent} size={30} />
            <div style={{ flex: 1 }}>
              <TextInput value={bot.name} onChange={(v: string) => setBot((b) => ({ ...b, name: v.slice(0, 18) }))} placeholder="Bot name" />
            </div>
          </Flex>
          <Tabs selectedIndex={tab} onChange={setTab}>
            <Tab title="Look">
              <Flex flexDirection="column" gap={16} paddingTop={12}>
                <Field label="Shape">
                  <div className="tile-row">
                    {SHAPES.map((s) => (
                      <button key={s} className={`tile ${bot.look.shape === s ? 'sel' : ''}`} onClick={() => setLook({ shape: s })} aria-label={s}>
                        <ShapeIcon shape={s} color={bot.look.color} accent={bot.look.accent} size={22} />
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Color">
                  <ColorPicker value={bot.look.color} onChange={(c) => setLook({ color: c })} />
                </Field>
                <Field label="Accent">
                  <ColorPicker value={bot.look.accent} onChange={(c) => setLook({ accent: c })} extra={['#ffffff', '#000000']} />
                </Field>
                <Field label="Ball trail">
                  <Select value={bot.look.trail} onChange={(v) => v && setLook({ trail: v as Trail })}>
                    <Select.Content>
                      {TRAILS.map((t) => (
                        <Select.Option key={t.v} value={t.v}>
                          {t.l}
                        </Select.Option>
                      ))}
                    </Select.Content>
                  </Select>
                </Field>
                <Field label="Goal effect">
                  <Flex gap={6} alignItems="center">
                    <div style={{ flex: 1 }}>
                      <Select
                        value={bot.look.goalFx}
                        onChange={(v) => {
                          if (!v) return;
                          setLook({ goalFx: v as GoalFx });
                          setTimeout(() => previewRef.current?.testGoal(), 50);
                        }}
                      >
                        <Select.Content>
                          {GOALFX.map((t) => (
                            <Select.Option key={t.v} value={t.v}>
                              {t.l}
                            </Select.Option>
                          ))}
                        </Select.Content>
                      </Select>
                    </div>
                  </Flex>
                </Field>
                <Field label="Sounds">
                  <Select
                    value={bot.look.sound}
                    onChange={(v) => {
                      if (!v) return;
                      setLook({ sound: v as SoundPack });
                      setTimeout(() => previewRef.current?.testSound(), 50);
                    }}
                  >
                    <Select.Content>
                      {SOUNDS.map((t) => (
                        <Select.Option key={t.v} value={t.v}>
                          {t.l}
                        </Select.Option>
                      ))}
                    </Select.Content>
                  </Select>
                </Field>
              </Flex>
            </Tab>
            <Tab title={`Stats ${statTotal}/${STAT_CAP}`}>
              <Flex flexDirection="column" gap={12} paddingTop={12}>
                <PointsBar used={statTotal} cap={STAT_CAP} label="Stat points" color={bot.look.color} />
                {STAT_KEYS.map((k) => (
                  <StatRow key={k} k={k} value={bot.stats[k]} canAdd={statTotal < STAT_CAP} color={bot.look.color} onChange={(v) => setStat(k, v)} />
                ))}
                {note && <Text className="small warn">{note}</Text>}
              </Flex>
            </Tab>
            <Tab title={`Perks ${perkUsed}/${PERK_POINTS}`}>
              <Flex flexDirection="column" gap={8} paddingTop={12}>
                <PointsBar used={perkUsed} cap={PERK_POINTS} label="Perk points" color={bot.look.color} />
                {PERKS.map((p) => {
                  const on = bot.perks.includes(p.id);
                  const reqOk = perkReqMet(p, bot.stats);
                  const afford = perkUsed + p.cost <= PERK_POINTS;
                  const disabled = !on && (!reqOk || !afford);
                  return (
                    <label key={p.id} className={`perk-card ${on ? 'on' : ''} ${disabled ? 'off' : ''}`}>
                      <Checkbox value={on} disabled={disabled} onChange={(v: boolean) => togglePerk(p.id, v)} aria-label={p.name} />
                      <span className="perk-icon">{p.icon}</span>
                      <span className="perk-text">
                        <span className="perk-name">{p.name}</span>
                        <span className="perk-desc">{p.desc}</span>
                      </span>
                      <span className="perk-meta">
                        <Chip size="condensed" color={on ? 'primary' : 'neutral'}>
                          {'★'.repeat(p.cost)}
                        </Chip>
                        {p.req && <span className={`perk-req ${reqOk ? '' : 'bad'}`}>{reqText(p)}</span>}
                      </span>
                    </label>
                  );
                })}
              </Flex>
            </Tab>
          </Tabs>
          <Flex gap={8} className="editor-actions">
            <Button onClick={onCancel}>Cancel</Button>
            <span style={{ flex: 1 }} />
            <Button variant="emphasized" color="primary" onClick={() => onSave({ ...bot, name: bot.name.trim() || 'Unnamed' })}>
              Save bot
            </Button>
          </Flex>
        </Flex>
      </div>
    </div>
  );
}

function PointsBar({ used, cap, label, color }: { used: number; cap: number; label: string; color: string }) {
  return (
    <div className="points-bar">
      <Flex justifyContent="space-between">
        <Text className="small">{label}</Text>
        <Text className="small">
          <Strong>{cap - used}</Strong> left
        </Text>
      </Flex>
      <div className="points-track">
        <span style={{ width: `${(used / cap) * 100}%`, background: color }} />
      </div>
    </div>
  );
}

function StatRow({ k, value, canAdd, color, onChange }: { k: StatKey; value: number; canAdd: boolean; color: string; onChange: (v: number) => void }) {
  return (
    <div className="stat-row">
      <div className="stat-label">
        <span className="stat-name">{STAT_INFO[k].label}</span>
        <span className="stat-hint">{STAT_INFO[k].hint}</span>
      </div>
      <div className="stat-ctl">
        <button className="step-btn" onClick={() => onChange(value - 1)} disabled={value <= STAT_MIN} aria-label={`Lower ${k}`}>
          −
        </button>
        <div className="pips">
          {Array.from({ length: STAT_MAX }, (_, i) => (
            <button
              key={i}
              className={`pip ${i < value ? 'on' : ''}`}
              style={i < value ? { background: color } : undefined}
              onClick={() => onChange(i + 1)}
              aria-label={`${k} ${i + 1}`}
            />
          ))}
        </div>
        <button className="step-btn" onClick={() => onChange(value + 1)} disabled={value >= STAT_MAX || !canAdd} aria-label={`Raise ${k}`}>
          +
        </button>
        <span className="stat-val">{value}</span>
      </div>
    </div>
  );
}

function ColorPicker({ value, onChange, extra = [] }: { value: string; onChange: (c: string) => void; extra?: string[] }) {
  const list = [...extra, ...COLORS];
  return (
    <div className="swatches">
      {list.map((c) => (
        <button key={c} className={`swatch ${value.toLowerCase() === c ? 'sel' : ''}`} style={{ background: c }} onClick={() => onChange(c)} aria-label={c} />
      ))}
      <label className="swatch custom" title="Custom color">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
        <span>+</span>
      </label>
    </div>
  );
}

