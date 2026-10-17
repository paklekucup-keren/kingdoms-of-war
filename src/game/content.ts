import type { Army, BType, PlacedB, Res, TType } from './types';
import { GRID, rng } from './types';

// ================= BUILDINGS =================
export interface BDef {
  t: BType; name: string; desc: string; icon: string;
  w: number; h: number; max: number;
  cost: (l: number) => Res;       // cost to reach level l (l=1 is build)
  time: (l: number) => number;    // seconds
  hp: (l: number) => number;
  prod?: { res: 'gold' | 'food'; rate: (l: number) => number; cap: (l: number) => number };
  def?: { range: (l: number) => number; dmg: (l: number) => number; rate: (l: number) => number; aoe?: number };
}

const sc = (base: number, l: number, p = 1.4) => Math.round(base * Math.pow(p, l - 1));

export const BUILDINGS: Record<BType, BDef> = {
  townhall: {
    t: 'townhall', name: 'Town Hall', icon: 'castle', w: 3, h: 3, max: 5,
    desc: 'Heart of the kingdom. Upgrade to unlock new buildings and higher levels.',
    cost: l => ({ gold: [0, 900, 2400, 6000, 14000][l - 1] ?? 0, food: 0 }),
    time: l => [0, 15, 30, 60, 120][l - 1] ?? 0,
    hp: l => sc(950, l, 1.5),
  },
  goldmine: {
    t: 'goldmine', name: 'Gold Mine', icon: 'pickaxe', w: 2, h: 2, max: 5,
    desc: 'Digs gold over time. Tap to collect the haul.',
    cost: l => ({ gold: 0, food: sc(110, l, 1.7) }),
    time: l => 5 * l, hp: l => sc(280, l),
    prod: { res: 'gold', rate: l => 0.35 + 0.4 * l, cap: l => 220 + 200 * l },
  },
  farm: {
    t: 'farm', name: 'Farm', icon: 'wheat', w: 2, h: 2, max: 5,
    desc: 'Grows food for your armies. Tap to harvest.',
    cost: l => ({ gold: sc(100, l, 1.7), food: 0 }),
    time: l => 5 * l, hp: l => sc(280, l),
    prod: { res: 'food', rate: l => 0.3 + 0.35 * l, cap: l => 220 + 190 * l },
  },
  storage: {
    t: 'storage', name: 'Storage', icon: 'warehouse', w: 2, h: 2, max: 5,
    desc: 'Raises your gold and food capacity by 700 per level.',
    cost: l => ({ gold: sc(160, l, 1.75), food: sc(60, l, 1.75) }),
    time: l => 6 * l, hp: l => sc(340, l),
  },
  barracks: {
    t: 'barracks', name: 'Barracks', icon: 'swords', w: 2, h: 2, max: 4,
    desc: 'Trains troops. Higher levels unlock new unit types.',
    cost: l => ({ gold: sc(240, l, 1.9), food: sc(80, l, 1.9) }),
    time: l => 8 * l, hp: l => sc(360, l),
  },
  camp: {
    t: 'camp', name: 'Army Camp', icon: 'tent', w: 2, h: 2, max: 5,
    desc: 'Houses your army. +6 troop capacity per level.',
    cost: l => ({ gold: sc(140, l, 1.7), food: sc(50, l, 1.7) }),
    time: l => 6 * l, hp: l => sc(320, l),
  },
  tower: {
    t: 'tower', name: 'Archer Tower', icon: 'tower', w: 1, h: 1, max: 5,
    desc: 'Long-range defense that rains arrows on attackers.',
    cost: l => ({ gold: sc(170, l, 1.8), food: 0 }),
    time: l => 8 * l, hp: l => sc(360, l),
    def: { range: l => 5.1 + 0.25 * l, dmg: l => sc(11, l, 1.45), rate: () => 1.25 },
  },
  cannon: {
    t: 'cannon', name: 'Cannon', icon: 'bomb', w: 1, h: 1, max: 5,
    desc: 'Short-range cannon dealing splash damage to groups.',
    cost: l => ({ gold: sc(400, l, 1.85), food: sc(100, l, 1.85) }),
    time: l => 12 * l, hp: l => sc(420, l),
    def: { range: l => 4.1 + 0.2 * l, dmg: l => sc(24, l, 1.5), rate: () => 0.6, aoe: 0.95 },
  },
  wall: {
    t: 'wall', name: 'Wall', icon: 'bricks', w: 1, h: 1, max: 6,
    desc: 'Blocks enemy troops. Cheap, sturdy, essential.',
    cost: l => ({ gold: sc(22, l, 1.9), food: 0 }),
    time: () => 2, hp: l => sc(300, l, 1.6),
  },
};

const TH_COUNTS: Record<number, Record<BType, number>> = {
  1: { townhall: 1, goldmine: 1, farm: 1, storage: 1, barracks: 1, camp: 1, tower: 2, cannon: 0, wall: 8 },
  2: { townhall: 1, goldmine: 2, farm: 2, storage: 1, barracks: 1, camp: 1, tower: 3, cannon: 1, wall: 16 },
  3: { townhall: 1, goldmine: 3, farm: 3, storage: 2, barracks: 2, camp: 2, tower: 4, cannon: 2, wall: 26 },
  4: { townhall: 1, goldmine: 4, farm: 4, storage: 2, barracks: 2, camp: 2, tower: 5, cannon: 3, wall: 36 },
  5: { townhall: 1, goldmine: 5, farm: 5, storage: 3, barracks: 3, camp: 2, tower: 6, cannon: 4, wall: 48 },
};

export function thLevel(buildings: PlacedB[]) {
  const th = buildings.find(b => b.t === 'townhall');
  return th ? Math.max(1, th.lvl) : 1;
}
export const buildLimit = (th: number, t: BType) => TH_COUNTS[Math.min(5, Math.max(1, th))][t];
export const maxLvlFor = (t: BType, th: number) =>
  t === 'townhall' ? 5 : t === 'barracks' ? Math.min(4, th) : t === 'wall' ? Math.min(6, th + 1) : Math.min(5, th);

export function storageCap(buildings: PlacedB[]) {
  let g = 1000, f = 1000;
  for (const b of buildings) if (b.t === 'storage' && b.lvl > 0 && !b.busy) { g += 700 * b.lvl; f += 700 * b.lvl; }
  return { gold: g, food: f };
}
export function armyCap(buildings: PlacedB[]) {
  let c = 6;
  for (const b of buildings) if (b.t === 'camp' && b.lvl > 0 && !b.busy) c += 6 * b.lvl;
  return c;
}
export const armySize = (a: Partial<Army>) =>
  (a.sword ?? 0) + (a.archer ?? 0) + 2 * (a.knight ?? 0) + 3 * (a.ram ?? 0);

export const canPlace = (occ: (PlacedB | null)[][], t: BType, gx: number, gy: number) => {
  const d = BUILDINGS[t];
  if (gx < 0 || gy < 0 || gx + d.w > GRID || gy + d.h > GRID) return false;
  for (let y = gy; y < gy + d.h; y++) for (let x = gx; x < gx + d.w; x++) if (occ[y]?.[x]) return false;
  return true;
};

// ================= TROOPS =================
export interface TDef {
  t: TType; name: string; desc: string; icon: string;
  cost: Res; time: number; hp: number; dmg: number; speed: number; range: number;
  cap: number; prefer: 'any' | 'defense' | 'wall'; wallBonus: number; unlockB: number;
}
export const TROOPS: Record<TType, TDef> = {
  sword: {
    t: 'sword', name: 'Swordsman', icon: 'sword', cost: { gold: 0, food: 25 }, time: 3,
    hp: 85, dmg: 10, speed: 1.55, range: 0.85, cap: 1, prefer: 'any', wallBonus: 1, unlockB: 1,
    desc: 'Sturdy melee fighter. Cheap and reliable.',
  },
  archer: {
    t: 'archer', name: 'Archer', icon: 'bow', cost: { gold: 0, food: 38 }, time: 4,
    hp: 48, dmg: 9, speed: 1.5, range: 3.3, cap: 1, prefer: 'any', wallBonus: 1, unlockB: 2,
    desc: 'Ranged attacker. Fragile but shoots over walls.',
  },
  knight: {
    t: 'knight', name: 'Knight', icon: 'shield', cost: { gold: 25, food: 72 }, time: 7,
    hp: 200, dmg: 17, speed: 1.95, range: 0.9, cap: 2, prefer: 'defense', wallBonus: 1, unlockB: 3,
    desc: 'Fast heavy cavalry that hunts towers and cannons first.',
  },
  ram: {
    t: 'ram', name: 'Siege Ram', icon: 'hammer', cost: { gold: 115, food: 60 }, time: 12,
    hp: 340, dmg: 58, speed: 0.9, range: 0.85, cap: 3, prefer: 'wall', wallBonus: 4, unlockB: 4,
    desc: 'Slow siege engine. Devastates walls and buildings.',
  },
};
export const TROOP_ORDER: TType[] = ['sword', 'archer', 'knight', 'ram'];

// ================= CAMPAIGN =================
export interface CampaignNode { id: string; name: string; story: string; kind: 'attack' | 'defense'; lvl: number }
export const CAMPAIGN: CampaignNode[] = [
  { id: 'c1', name: 'Timberfall Camp', story: 'A ragtag bandit camp. A perfect first conquest.', kind: 'attack', lvl: 1 },
  { id: 'c2', name: 'Millbrook Village', story: 'Farmers pay tribute to no crown. Remind them.', kind: 'attack', lvl: 2 },
  { id: 'c3', name: 'Stonehill Keep', story: 'A walled keep guards the river crossing.', kind: 'attack', lvl: 3 },
  { id: 'c4', name: 'Duskbarrow Fort', story: 'Cannons now answer those who knock.', kind: 'attack', lvl: 4 },
  { id: 'c5', name: 'The First Retaliation', story: 'The mountain clans strike back. Hold your walls!', kind: 'defense', lvl: 3 },
  { id: 'c6', name: 'Brickhaven Bastion', story: 'Twin cannon nests behind deep walls.', kind: 'attack', lvl: 5 },
  { id: 'c7', name: 'Embercourt', story: 'A lord risen from ash, hungry for your throne.', kind: 'attack', lvl: 6 },
  { id: 'c8', name: 'The Silent Vale', story: 'Its towers have never fallen. Yours may be the first.', kind: 'attack', lvl: 7 },
  { id: 'c9', name: 'Ironhold', story: 'A fortress that eats armies whole.', kind: 'attack', lvl: 8 },
  { id: 'c10', name: 'Citadel of the Usurper', story: 'The pretender king awaits. End this war.', kind: 'attack', lvl: 10 },
];

const ENEMY_NAMES = ['Blackboar Clan', 'Ashen Marauders', 'The Gilded Hand', 'Wulfgar\'s Host', 'Red Fen Reavers',
  'Hollow Crown', 'The Iron Pact', 'Mossvale Kingdom', 'Carrion Court', 'Stormbarrow'];

export interface EnemyBase { name: string; lvl: number; buildings: PlacedB[]; garrison: Partial<Army>; lootBonus: Res }

// deterministic enemy base generator — compact layouts scale with level
export function makeEnemy(lvl: number, seed: number, hpMult = 1): EnemyBase {
  const r = rng(seed * 2654435761 % 2147483647);
  const thL = Math.min(5, Math.max(1, Math.ceil(lvl / 2)));
  const list: PlacedB[] = [];
  const occ: (PlacedB | null)[][] = Array.from({ length: GRID }, () => Array(GRID).fill(null));
  let id = 1;
  const put = (t: BType, gx: number, gy: number, l: number) => {
    const d = BUILDINGS[t];
    const b: PlacedB = { id: id++, t, gx, gy, lvl: l, busy: 0, stored: 0 };
    for (let y = gy; y < gy + d.h; y++) for (let x = gx; x < gx + d.w; x++) occ[y][x] = b;
    list.push(b);
    return b;
  };
  const free = (t: BType, gx: number, gy: number) => canPlace(occ, t, gx, gy);
  const tryPut = (t: BType, cx: number, cy: number, l: number, spread = 10) => {
    for (let i = 0; i < 60; i++) {
      const gx = Math.round(cx + (r() - 0.5) * spread);
      const gy = Math.round(cy + (r() - 0.5) * spread);
      if (free(t, gx, gy)) return put(t, gx, gy, l);
    }
    return null;
  };

  // town hall at center
  put('townhall', 6 + Math.floor(r() * 2), 6 + Math.floor(r() * 2), thL);

  // wall ring (rect) with 1-2 gates
  if (lvl >= 2) {
    const x0 = 3 + Math.floor(r() * 2), y0 = 3 + Math.floor(r() * 2);
    const x1 = 13 - Math.floor(r() * 2), y1 = 13 - Math.floor(r() * 2);
    const wallL = Math.min(6, Math.max(1, thL + (lvl > 7 ? 1 : 0)));
    const gates = new Set<number>([Math.floor(r() * 4)]);
    if (lvl >= 4) gates.add(Math.floor(r() * 4));
    const edge = (side: number, i: number) => {
      const mid = Math.floor((side % 2 === 0 ? x1 - x0 : y1 - y0) / 2);
      if (gates.has(side) && (i === mid || i === mid + 1)) return; // gate
      const gx = side === 0 ? x0 + i : side === 1 ? x1 : side === 2 ? x1 - i : x0;
      const gy = side === 0 ? y0 : side === 1 ? y0 + i : side === 2 ? y1 : y1 - i;
      if (free('wall', gx, gy)) put('wall', gx, gy, wallL);
    };
    for (let i = 0; i <= x1 - x0; i++) { edge(0, i); edge(2, i); }
    for (let i = 1; i < y1 - y0; i++) { edge(1, i); edge(3, i); }
  }

  // inner defense ring
  const tCount = Math.min(6, 1 + Math.floor(lvl * 0.8));
  const cCount = Math.min(4, Math.max(0, lvl - 2));
  for (let i = 0; i < tCount; i++) tryPut('tower', 8 + (r() - 0.5) * 8, 8 + (r() - 0.5) * 8, Math.min(5, thL), 9);
  for (let i = 0; i < cCount; i++) tryPut('cannon', 8 + (r() - 0.5) * 8, 8 + (r() - 0.5) * 8, Math.min(5, thL), 9);

  // economy inside / around
  const eco: { t: BType; g?: boolean }[] = [
    { t: 'storage' }, { t: 'goldmine', g: true }, { t: 'farm', g: true },
    ...(lvl >= 3 ? [{ t: 'goldmine', g: true } as const, { t: 'farm', g: true } as const] : []),
    ...(lvl >= 4 ? [{ t: 'storage' } as const, { t: 'barracks' } as const, { t: 'camp' } as const] : []),
  ];
  for (const e of eco) {
    const b = tryPut(e.t, 8 + (r() - 0.5) * 7, 8 + (r() - 0.5) * 7, Math.min(5, Math.max(1, thL - (r() < 0.3 ? 0 : 0))), 11);
    if (b && e.g) b.stored = Math.round((60 + 38 * lvl) * (0.7 + r() * 0.6));
    if (b && e.t === 'storage') b.stored = Math.round((80 + 45 * lvl) * (0.7 + r() * 0.6));
  }
  // outer decoys
  const decoys = Math.min(5, Math.floor(lvl / 2));
  for (let i = 0; i < decoys; i++) {
    const t: BType = r() < 0.5 ? 'farm' : 'goldmine';
    const corner = [[2.5, 2.5], [13, 2.5], [2.5, 13], [13, 13]][i % 4];
    tryPut(t, corner[0], corner[1], 1, 3);
  }
  if (hpMult !== 1) for (const b of list) b.hp = Math.round(BUILDINGS[b.t].hp(b.lvl) * hpMult);

  const garrison: Partial<Army> = {
    sword: Math.min(14, lvl + 1 + Math.floor(r() * 2)),
    archer: Math.min(10, Math.floor(lvl * 0.8)),
    knight: lvl >= 4 ? Math.min(6, Math.floor(lvl / 2)) : 0,
  };
  return {
    name: ENEMY_NAMES[(seed + lvl) % ENEMY_NAMES.length], lvl,
    buildings: list, garrison,
    lootBonus: { gold: 100 + 90 * lvl, food: 80 + 70 * lvl },
  };
}

// defense waves: list of waves, each wave = list of [troop, count]
export function makeWaves(lvl: number, endless: number): { troops: [TType, number][]; gap: number }[] {
  const waves: { troops: [TType, number][]; gap: number }[] = [];
  const n = endless > 0 ? endless : 3;
  for (let w = 0; w < n; w++) {
    const p = lvl + w * 0.9 + (endless > 0 ? w * 0.5 : 0);
    const troops: [TType, number][] = [
      ['sword', Math.min(16, 3 + Math.round(p * 1.2))],
      ['archer', Math.min(10, Math.round(p * 0.7))],
    ];
    if (p >= 2.5) troops.push(['knight', Math.min(7, Math.round(p / 2.4))]);
    if (p >= 4.5) troops.push(['ram', Math.min(4, Math.round((p - 3) / 2.5))]);
    waves.push({ troops, gap: w === 0 ? 2 : 20 });
  }
  return waves;
}

// base mission score / loot
export function missionReward(lvl: number, stars: number): Res & { score: number } {
  return { gold: 120 + 90 * lvl, food: 100 + 70 * lvl, score: 300 * lvl + 600 * stars };
}
