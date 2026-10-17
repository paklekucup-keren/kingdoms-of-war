import type { PlacedB, SaveData } from './types';

const KEY_A = 'kow_save_a';
const KEY_B = 'kow_save_b';
const KEY_META = 'kow_save_meta';
const VERSION = 1;

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

function pack(d: SaveData) {
  const body = JSON.stringify(d);
  return JSON.stringify({ body, sum: hash(body), v: VERSION });
}
function unpack(raw: string | null): SaveData | null {
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (o.v !== VERSION || typeof o.body !== 'string') return null;
    if (hash(o.body) !== o.sum) return null;      // corruption detected
    const d = JSON.parse(o.body) as SaveData;
    if (!Array.isArray(d.buildings) || typeof d.gold !== 'number') return null;
    return d;
  } catch { return null; }
}

export function defaultSave(): SaveData {
  let id = 1;
  const B = (t: PlacedB['t'], gx: number, gy: number, lvl = 1): PlacedB =>
    ({ id: id++, t, gx, gy, lvl, busy: 0, stored: 0 });
  return {
    v: VERSION,
    gold: 650, food: 550,
    buildings: [
      B('townhall', 6, 6),
      B('goldmine', 3, 5), B('farm', 3, 9),
      B('barracks', 11, 5), B('camp', 11, 9),
      B('tower', 4, 3), B('tower', 11, 12),
    ],
    nextId: id,
    army: { sword: 6, archer: 0, knight: 0, ram: 0 },
    queue: [],
    stars: {},
    score: 0,
    best: [],
    settings: { sfx: true, music: true, quality: 'high', name: 'Commander' },
    tut: ['collect', 'build', 'train', 'attack'],
    lastTs: Date.now(),
    coopWins: 0,
  };
}

// dual slots: newest valid wins, older valid slot is the backup
export function loadSave(): SaveData | null {
  try {
    const meta = Number(localStorage.getItem(KEY_META) ?? '0');
    const order = meta % 2 === 0 ? [KEY_A, KEY_B] : [KEY_B, KEY_A];
    for (const k of order) { const d = unpack(localStorage.getItem(k)); if (d) return d; }
    return null;
  } catch { return null; }
}

let slot = 0;
export function writeSave(d: SaveData) {
  try {
    d.lastTs = Date.now();
    const packed = pack(d);
    const key = slot % 2 === 0 ? KEY_A : KEY_B;
    localStorage.setItem(key, packed);
    localStorage.setItem(KEY_META, String(slot));
    slot++;
  } catch { /* storage full/blocked — keep playing in memory */ }
}

export function wipeSave() {
  try { localStorage.removeItem(KEY_A); localStorage.removeItem(KEY_B); localStorage.removeItem(KEY_META); } catch { }
}

export function pushScore(d: SaveData, entry: { score: number; mode: string }) {
  d.best = [...d.best, { name: d.settings.name || 'Commander', score: entry.score, mode: entry.mode, date: Date.now() }]
    .sort((a, b) => b.score - a.score).slice(0, 10);
}
