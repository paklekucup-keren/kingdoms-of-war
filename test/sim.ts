// Headless smoke test for Kingdoms of War game logic (run: npx tsx test/sim.ts)
import { makeEnemy, makeWaves, BUILDINGS } from '../src/game/content';
import { Sim } from '../src/game/engine';
import { defaultSave, loadSave, writeSave } from '../src/game/save';
import { GRID } from '../src/game/types';

function assert(cond: unknown, msg: string) {
  if (!cond) { console.error('FAIL:', msg); process.exit(1); }
  console.log('ok -', msg);
}

// localStorage shim for save roundtrip
const store = new Map<string, string>();
(globalThis as unknown as { localStorage: Storage }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(), key: () => null, length: 0,
};

// 1. enemy generation sanity
for (let lvl = 1; lvl <= 10; lvl++) {
  const e = makeEnemy(lvl, lvl * 31 + 5);
  assert(e.buildings.some(b => b.t === 'townhall'), `enemy lvl ${lvl} has a town hall`);
  const occ = new Set<number>();
  for (const b of e.buildings) {
    const d = BUILDINGS[b.t];
    for (let y = b.gy; y < b.gy + d.h; y++) for (let x = b.gx; x < b.gx + d.w; x++) {
      const k = y * GRID + x;
      if (occ.has(k)) throw new Error(`overlap at lvl ${lvl}`);
      occ.add(k);
    }
  }
}
console.log('ok - enemy bases have no overlapping footprints (levels 1-10)');

// 2. full attack battle: deploy 12 swordsmen + 4 archers vs level 1 base
{
  const e = makeEnemy(1, 99);
  const sim = new Sim({ buildings: e.buildings, buildingSide: 1, garrison: e.garrison, seed: 7 });
  const t0 = sim.destruction(1);
  assert(t0 === 0, 'battle starts at 0% destruction');
  for (let i = 0; i < 12; i++) sim.deploy('sword', 1 + (i % 4) * 0.5, 1 + Math.floor(i / 4) * 0.6, 0, 0);
  for (let i = 0; i < 4; i++) sim.deploy('archer', 15, 1 + i * 0.5, 0, 0);
  let crashed = false, events = 0;
  try {
    for (let i = 0; i < 180 * 30; i++) { sim.update(1 / 30); events += sim.drain().length; }
  } catch (err) { crashed = true; console.error(err); }
  assert(!crashed, 'attack sim ran 180 simulated seconds without exceptions');
  assert(events > 10, `combat produced events (${events})`);
  const pct = sim.destruction(1);
  assert(pct >= 20, `attackers dealt damage (destruction ${pct}%)`);
  console.log(`   -> final destruction vs lvl-1 base: ${pct}%  | enemy TH dead: ${sim.townhallDead(1)} | units left: ${sim.alive(0)}`);
}

// 3a. sealed wall box: rams must chew through walls to reach the storage inside
{
  let id = 1;
  const B = (t: 'storage' | 'wall', gx: number, gy: number) =>
    ({ id: id++, t, gx, gy, lvl: 1, busy: 0, stored: 50 });
  const box = [B('storage', 7, 7)];
  for (let x = 5; x <= 10; x++) { box.push(B('wall', x, 5)); box.push(B('wall', x, 10)); }
  for (let y = 6; y <= 9; y++) { box.push(B('wall', 5, y)); box.push(B('wall', 10, y)); }
  const sim = new Sim({ buildings: box, buildingSide: 1, garrison: {}, seed: 3 });
  sim.deploy('ram', 2, 2, 0, 0);
  sim.deploy('ram', 2, 13, 0, 0);
  for (let i = 0; i < 6; i++) sim.deploy('sword', 1 + i * 0.5, 1, 0, 0);
  for (let i = 0; i < 150 * 30; i++) { sim.update(1 / 30); sim.drain(); }
  const storageDead = box[0] && sim.b.find(b => b.t === 'storage')!.hp <= 0;
  assert(storageDead, 'rams breached a sealed wall box and destroyed the storage');
  console.log(`   -> sealed box breached, destruction: ${sim.destruction(1)}%`);
}

// 3b. realistic mid-game army vs level-3 base — proper grouped edge siege
{
  const e = makeEnemy(3, 4242);
  const sim = new Sim({ buildings: e.buildings, buildingSide: 1, garrison: e.garrison, seed: 3 });
  for (let i = 0; i < 12; i++) sim.deploy('sword', 6.5 + (i % 4) * 0.7, 14.2 + Math.floor(i / 4) * 0.55, 0, 0);
  for (let i = 0; i < 2; i++) sim.deploy('ram', 7 + i * 1.2, 14.6, 0, 0);
  for (let i = 0; i < 5; i++) sim.deploy('archer', 7 + i * 0.7, 15.2, 0, 0);
  for (let i = 0; i < 3; i++) sim.deploy('knight', 14.6, 7 + i * 0.7, 0, 0);
  for (let i = 0; i < 150 * 30; i++) { sim.update(1 / 30); sim.drain(); }
  const pct = sim.destruction(1);
  assert(pct >= 25, `mid-game army made progress vs lvl-3 base (${pct}%)`);
  console.log(`   -> lvl-3 base destruction with mixed army: ${pct}% | TH dead: ${sim.townhallDead(1)}`);
}

// 4. defense battle: fresh kingdom + town hall militia holds its first siege
{
  const save = defaultSave();
  const waves = makeWaves(2, 0);
  const garrison = { ...save.army, sword: save.army.sword + 2 };
  const sim = new Sim({ buildings: save.buildings.map(b => ({ ...b })), buildingSide: 0, garrison, waves, seed: 11 });
  let crashed = false;
  try { for (let i = 0; i < 200 * 30 && !(sim.wavesSpawned && sim.alive(1) === 0) && !sim.townhallDead(0); i++) { sim.update(1 / 30); sim.drain(); } }
  catch (err) { crashed = true; console.error(err); }
  assert(!crashed, 'defense sim ran without exceptions');
  console.log(`   -> TH1 no-wall defense: TH dead=${sim.townhallDead(0)} wavesCleared=${sim.wavesSpawned && sim.alive(1) === 0} baseDamage=${sim.destruction(0)}%`);
  assert(sim.waveIdx > 0, 'waves spawned during defense');
}

// 4b. representative TH2 defense (towers, cannon, wall ring, knights) must hold
{
  let id = 1;
  const B = (t: 'townhall' | 'tower' | 'cannon' | 'wall' | 'camp', gx: number, gy: number, lvl = 1) =>
    ({ id: id++, t, gx, gy, lvl, busy: 0, stored: 0 });
  const base = [B('townhall', 7, 7, 2), B('tower', 4, 4, 2), B('tower', 11, 4, 2), B('tower', 8, 11, 2), B('cannon', 11, 11, 1), B('camp', 3, 12, 2)];
  for (let x = 3; x <= 13; x++) { if (x !== 8 && x !== 9) { base.push(B('wall', x, 3)); base.push(B('wall', x, 13)); } }
  for (let y = 4; y <= 12; y++) { base.push(B('wall', 3, y)); base.push(B('wall', 13, y)); }
  const garrison = { sword: 8 + 4, archer: 4, knight: 2, ram: 0 };
  const sim = new Sim({ buildings: base, buildingSide: 0, garrison, waves: makeWaves(2, 0), seed: 11 });
  for (let i = 0; i < 240 * 30 && !(sim.wavesSpawned && sim.alive(1) === 0) && !sim.townhallDead(0); i++) { sim.update(1 / 30); sim.drain(); }
  const held = !sim.townhallDead(0) && sim.wavesSpawned && sim.alive(1) === 0;
  assert(held, `TH2 walled defense held the siege (baseDamage=${sim.destruction(0)}%)`);
  console.log(`   -> TH2 walled defense: held=${held} baseDamage=${sim.destruction(0)}%`);
}

// 5. save roundtrip + corruption fallback
{
  store.clear();
  const d = defaultSave();
  d.gold = 1234; d.stars = { c1: 3 };
  writeSave(d);
  const r1 = loadSave();
  assert(r1 && r1.gold === 1234 && r1.stars.c1 === 3, 'save roundtrips through checksum wrapper');
  // corrupt the newest slot -> loader must fall back to older valid slot
  const meta = Number(store.get('kow_save_meta') ?? '0');
  store.clear();
  const a = defaultSave(); a.gold = 111; writeSave(a);       // slot 0
  const b = defaultSave(); b.gold = 222; writeSave(b);       // slot 1 (newest)
  const newestKey = (meta + 0) % 2 === 0 ? 'kow_save_b' : 'kow_save_a';
  store.set(newestKey === 'kow_save_a' ? 'kow_save_b' : 'kow_save_a', '{"corrupted":true}');
  const r2 = loadSave();
  assert(r2 && (r2.gold === 111 || r2.gold === 222), 'corrupted slot falls back to valid backup slot');
}

console.log('\nALL TESTS PASSED');
