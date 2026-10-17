// ---------- core shared types ----------
export interface Res { gold: number; food: number }

export type BType =
  | 'townhall' | 'goldmine' | 'farm' | 'storage'
  | 'barracks' | 'camp' | 'tower' | 'cannon' | 'wall';

export type TType = 'sword' | 'archer' | 'knight' | 'ram';

export interface PlacedB {
  id: number;
  t: BType;
  gx: number; gy: number;
  lvl: number;          // 0 while under construction
  busy: number;         // timestamp (ms) when construction/upgrade finishes, 0 = idle
  stored: number;       // accumulated production (mines/farms)
  hp?: number;          // battle-only current hp
}

export type Army = Record<TType, number>;

export interface QueueItem { t: TType; end: number; dur: number }

export interface Settings {
  sfx: boolean; music: boolean; quality: 'low' | 'high'; name: string;
}

export interface ScoreEntry { name: string; score: number; mode: string; date: number }

export interface SaveData {
  v: number;
  gold: number; food: number;
  buildings: PlacedB[];
  nextId: number;
  army: Army;
  queue: QueueItem[];
  stars: Record<string, number>;   // campaign node id -> stars (1..3)
  score: number;
  best: ScoreEntry[];
  settings: Settings;
  tut: string[];                   // remaining tutorial steps
  lastTs: number;
  coopWins: number;
}

export const GRID = 16;

export const emptyArmy = (): Army => ({ sword: 0, archer: 0, knight: 0, ram: 0 });

// ---------- small helpers ----------
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function distRect(px: number, py: number, gx: number, gy: number, w: number, h: number) {
  const dx = Math.max(gx - px, 0, px - (gx + w));
  const dy = Math.max(gy - py, 0, py - (gy + h));
  return Math.hypot(dx, dy);
}

export function fmt(n: number) {
  if (n >= 100000) return Math.floor(n / 1000) + 'k';
  return String(Math.floor(n));
}

export function fmtTime(s: number) {
  s = Math.max(0, Math.ceil(s));
  const m = Math.floor(s / 60);
  return m > 0 ? `${m}:${String(s % 60).padStart(2, '0')}` : `${s}s`;
}

// deterministic RNG
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
