import type { Bot } from './types';

let n = 0;
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7) + (n++).toString(36);
}

const mk = (
  id: string,
  name: string,
  s: [number, number, number, number, number],
  perks: string[],
  look: Bot['look'],
): Bot => ({
  id,
  name,
  stats: { speed: s[0], power: s[1], reflex: s[2], control: s[3], accuracy: s[4] },
  perks,
  look,
});

export const DEFAULT_BOTS: Bot[] = [
  mk('d-blaze', 'Blaze', [5, 9, 5, 4, 7], ['fireball', 'hotstreak', 'turbo', 'bouncy'], {
    shape: 'triangle', color: '#ff5a1f', accent: '#ffd23f', trail: 'fire', goalFx: 'explosion', sound: 'bass',
  }),
  mk('d-frost', 'Frostbyte', [6, 4, 6, 6, 8], ['freeze', 'shield', 'bouncy'], {
    shape: 'hex', color: '#38bdf8', accent: '#e0f2fe', trail: 'sparkle', goalFx: 'shockwave', sound: 'chime',
  }),
  mk('d-volt', 'Voltron', [6, 8, 7, 4, 5], ['thunder', 'turbo', 'bouncy', 'hotstreak'].slice(0, 3), {
    shape: 'diamond', color: '#facc15', accent: '#1e1b4b', trail: 'line', goalFx: 'lightning', sound: 'laser',
  }),
  mk('d-wall', 'The Wall', [8, 3, 9, 6, 4], ['wall', 'warp', 'turbo'], {
    shape: 'square', color: '#64748b', accent: '#f1f5f9', trail: 'smoke', goalFx: 'shockwave', sound: 'horn',
  }),
  mk('d-ghost', 'Casper', [6, 5, 6, 7, 6], ['phantom', 'curve', 'magnet', 'turbo'], {
    shape: 'round', color: '#c4b5fd', accent: '#ffffff', trail: 'bubbles', goalFx: 'hearts', sound: 'chime',
  }),
  mk('d-snipe', 'Deadeye', [5, 6, 5, 4, 10], ['sniper', 'bank', 'bouncy', 'magnet'].slice(0, 3), {
    shape: 'star', color: '#22c55e', accent: '#052e16', trail: 'line', goalFx: 'fireworks', sound: 'classic',
  }),
  mk('d-pixel', 'Bit Crusher', [6, 6, 6, 7, 5], ['clone', 'hotstreak', 'turbo'], {
    shape: 'square', color: '#ec4899', accent: '#22d3ee', trail: 'pixel', goalFx: 'pixels', sound: 'retro',
  }),
  mk('d-tank', 'Big Mama', [5, 7, 6, 6, 6], ['giant', 'comeback', 'magnet'], {
    shape: 'round', color: '#a16207', accent: '#fde68a', trail: 'rainbow', goalFx: 'confetti', sound: 'horn',
  }),
];
