import type { Army, BType, PlacedB, TType } from './types';
import { GRID, clamp, distRect, rng } from './types';
import { BUILDINGS, TROOPS } from './content';

export interface SimB {
  id: number; t: BType; lvl: number; side: number;
  gx: number; gy: number; w: number; h: number;
  hp: number; mx: number; cd: number; stored: number;
}
export interface SimU {
  id: number; tp: TType; side: number; owner: number;
  x: number; y: number; hp: number; mx: number; cd: number;
  walk: number; swing: number; ox: number; oy: number;
  tgtB: number; tgtU: number; holdX: number; holdY: number; ver: number;
}
export interface Proj {
  x: number; y: number; u: number; tx: number; ty: number;
  spd: number; dmg: number; aoe: number; side: number; kind: 'arrow' | 'ball';
}
export interface Ev {
  k: 'shoot' | 'cannon' | 'hit' | 'boom' | 'udie' | 'bdie' | 'wave' | 'deploy';
  x: number; y: number; a?: number; b?: number; c?: number;
}

export interface SimConfig {
  buildings: PlacedB[]; buildingSide: number;    // 1 = enemy base (attack), 0 = player base (defense)
  garrison?: Partial<Army>;                       // defenders for the building side
  defenderOwner?: number;
  waves?: { troops: [TType, number][]; gap: number }[];  // defense mode
  seed?: number;
}

export class Sim {
  b: SimB[] = []; u: SimU[] = []; pr: Proj[] = []; ev: Ev[] = [];
  wallGrid = new Uint8Array(GRID * GRID);     // 1 = blocking wall alive
  private fields = new Map<number, Int16Array>(); private fieldVer = 0;
  private nid = 1;
  private rnd: () => number;
  mode: 'attack' | 'defense';
  time = 0;
  waveIdx = 0; waveT = 0; wavesSpawned = false;
  lootG = 0; lootF = 0; kills = 0; deployed = 0;
  rally: { x: number; y: number } | null = null;
  private waves?: { troops: [TType, number][]; gap: number }[];

  constructor(cfg: SimConfig) {
    this.rnd = rng(cfg.seed ?? 7);
    this.mode = cfg.waves ? 'defense' : 'attack';
    const bSide = cfg.buildingSide;
    for (const pb of cfg.buildings) {
      const d = BUILDINGS[pb.t];
      const mx = Math.round(pb.hp ?? d.hp(pb.lvl));
      const sb: SimB = { id: pb.id, t: pb.t, lvl: pb.lvl, side: bSide, gx: pb.gx, gy: pb.gy, w: d.w, h: d.h, hp: mx, mx, cd: this.rnd() * 0.5, stored: pb.stored };
      this.b.push(sb);
      if (pb.t === 'wall') this.wallGrid[pb.gy * GRID + pb.gx] = 1;
    }
    const gar = cfg.garrison ?? {};
    for (const tp of Object.keys(gar) as TType[]) {
      const n = gar[tp] ?? 0;
      for (let i = 0; i < n; i++) {
        const a = this.rnd() * Math.PI * 2, rr = 1.5 + this.rnd() * 2.5;
        this.spawnUnit(tp, bSide, cfg.defenderOwner ?? -1, 8 + Math.cos(a) * rr, 8 + Math.sin(a) * rr);
      }
    }
    this.waves = cfg.waves;
    if (this.waves) this.waveT = this.waves[0].gap;
  }

  spawnUnit(tp: TType, side: number, owner: number, x: number, y: number) {
    const d = TROOPS[tp];
    const u: SimU = {
      id: this.nid++, tp, side, owner, x: clamp(x, 0.3, GRID - 0.3), y: clamp(y, 0.3, GRID - 0.3),
      hp: d.hp, mx: d.hp, cd: 0.3 + this.rnd() * 0.4, walk: this.rnd() * 3, swing: 0,
      ox: (this.rnd() - 0.5) * 0.3, oy: (this.rnd() - 0.5) * 0.3,
      tgtB: -1, tgtU: -1, holdX: x, holdY: y, ver: -1,
    };
    this.u.push(u);
    this.ev.push({ k: 'deploy', x: u.x, y: u.y, a: side });
    return u;
  }

  deployable(x: number, y: number) {
    return x >= 0.2 && y >= 0.2 && x <= GRID - 0.2 && y <= GRID - 0.2 &&
      (x < 2.2 || x > GRID - 2.2 || y < 2.2 || y > GRID - 2.2);
  }
  deploy(tp: TType, x: number, y: number, side: number, owner = 0) {
    if (!this.deployable(x, y)) return null;
    this.deployed++;
    return this.spawnUnit(tp, side, owner, x, y);
  }

  // ---------- pathing ----------
  private field(target: SimB) {
    let f = this.fields.get(target.id);
    if (f) return f;
    f = new Int16Array(GRID * GRID).fill(32000);
    const q: number[] = [];
    for (let y = target.gy; y < target.gy + target.h; y++)
      for (let x = target.gx; x < target.gx + target.w; x++) { const i = y * GRID + x; f[i] = 0; q.push(i); }
    let head = 0;
    while (head < q.length) {
      const i = q[head++], cx = i % GRID, cy = (i / GRID) | 0, v = f[i] + 1;
      if (cx > 0 && f[i - 1] > v && !this.wallGrid[i - 1]) { f[i - 1] = v; q.push(i - 1); }
      if (cx < GRID - 1 && f[i + 1] > v && !this.wallGrid[i + 1]) { f[i + 1] = v; q.push(i + 1); }
      if (cy > 0 && f[i - GRID] > v && !this.wallGrid[i - GRID]) { f[i - GRID] = v; q.push(i - GRID); }
      if (cy < GRID - 1 && f[i + GRID] > v && !this.wallGrid[i + GRID]) { f[i + GRID] = v; q.push(i + GRID); }
    }
    this.fields.set(target.id, f);
    return f;
  }
  private wallAt(x: number, y: number) {
    const gx = clamp(Math.floor(x), 0, GRID - 1), gy = clamp(Math.floor(y), 0, GRID - 1);
    return this.wallGrid[gy * GRID + gx] === 1;
  }
  private nearestWall(u: SimU, maxD: number) {
    let best: SimB | null = null, bd = maxD;
    for (const b of this.b) {
      if (b.hp <= 0 || b.t !== 'wall' || b.side === u.side) continue;
      const d = distRect(u.x, u.y, b.gx, b.gy, 1, 1);
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  private pickBuilding(u: SimU) {
    const pref = TROOPS[u.tp].prefer;
    const enemySide = u.side === 0 ? 1 : 0;
    let anyDef = false, anyWall = false;
    if (pref !== 'any') for (const b of this.b) {
      if (b.hp <= 0 || b.side !== enemySide) continue;
      if (b.t === 'tower' || b.t === 'cannon') anyDef = true;
      if (b.t === 'wall') anyWall = true;
    }
    let best: SimB | null = null, bd = 1e9;
    for (const b of this.b) {
      if (b.hp <= 0 || b.side !== enemySide) continue;
      if (pref === 'defense' && anyDef && b.t !== 'tower' && b.t !== 'cannon') continue;
      if (pref === 'wall' && anyWall && b.t !== 'wall') continue;
      let d = distRect(u.x, u.y, b.gx, b.gy, b.w, b.h);
      if (pref === 'any' && b.t === 'wall') d *= 2.6;
      if (d < bd) { bd = d; best = b; }
    }
    return best;
  }
  private nearestUnit(u: SimU, range: number) {
    let best: SimU | null = null, bd = range;
    for (const o of this.u) {
      if (o.hp <= 0 || o.side === u.side) continue;
      const d = Math.hypot(o.x - u.x, o.y - u.y);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }
  private byIdB(id: number) { return this.b.find(b => b.id === id); }
  private byIdU(id: number) { return this.u.find(o => o.id === id); }

  // ---------- damage ----------
  damageB(b: SimB, dmg: number, fromSide: number) {
    if (b.hp <= 0) return;
    b.hp -= dmg;
    if (b.hp <= 0) {
      b.hp = 0;
      let lg = 0, lf = 0;
      if (b.stored > 0 && fromSide !== b.side) {
        if (b.t === 'goldmine' || b.t === 'farm') { if (b.t === 'goldmine') lg = b.stored; else lf = b.stored; }
        if (b.t === 'storage') { lg = Math.ceil(b.stored / 2); lf = Math.ceil(b.stored / 2); }
        this.lootG += lg; this.lootF += lf; b.stored = 0;
      }
      if (b.t === 'wall') { this.wallGrid[b.gy * GRID + b.gx] = 0; this.fieldVer++; this.fields.clear(); }
      this.ev.push({ k: 'boom', x: b.gx + b.w / 2, y: b.gy + b.h / 2, a: b.w, b: lg, c: lf });
    }
  }
  damageU(o: SimU, dmg: number) {
    if (o.hp <= 0) return;
    o.hp -= dmg;
    if (o.hp <= 0) { o.hp = 0; this.kills++; this.ev.push({ k: 'udie', x: o.x, y: o.y, a: o.side }); }
  }

  // ---------- waves ----------
  private tickWaves(dt: number) {
    if (!this.waves || this.wavesSpawned) return;
    this.waveT -= dt;
    if (this.waveT > 0) return;
    const w = this.waves[this.waveIdx];
    const side = Math.floor(this.rnd() * 4);
    const pos = 2.5 + this.rnd() * 11;
    const bx = side === 0 ? pos : side === 1 ? 15 : side === 2 ? pos : 1;
    const by = side === 0 ? 1 : side === 1 ? pos : side === 2 ? 15 : pos;
    for (const [tp, n] of w.troops)
      for (let i = 0; i < n; i++)
        this.spawnUnit(tp, 1, -1, bx + (this.rnd() - 0.5) * 2.4, by + (this.rnd() - 0.5) * 2.4);
    this.ev.push({ k: 'wave', x: bx, y: by, a: this.waveIdx + 1 });
    this.waveIdx++;
    if (this.waveIdx >= this.waves.length) this.wavesSpawned = true;
    else this.waveT = this.waves[this.waveIdx].gap;
  }

  // ---------- main update ----------
  update(dt: number) {
    this.time += dt;
    this.tickWaves(dt);

    // towers
    for (const b of this.b) {
      if (b.hp <= 0) continue;
      const def = BUILDINGS[b.t].def;
      if (!def) continue;
      b.cd -= dt;
      if (b.cd > 0) continue;
      const rngv = def.range(b.lvl), cx = b.gx + b.w / 2, cy = b.gy + b.h / 2;
      let best: SimU | null = null, bd = rngv;
      for (const o of this.u) {
        if (o.hp <= 0 || o.side === b.side) continue;
        const d = Math.hypot(o.x - cx, o.y - cy);
        if (d < bd) { bd = d; best = o; }
      }
      if (best) {
        b.cd = 1 / def.rate(b.lvl);
        const ball = !!def.aoe;
        this.pr.push({
          x: cx, y: cy - 0.2, u: best.id, tx: best.x, ty: best.y,
          spd: ball ? 6.5 : 10, dmg: def.dmg(b.lvl), aoe: def.aoe ?? 0, side: b.side, kind: ball ? 'ball' : 'arrow',
        });
        this.ev.push({ k: ball ? 'cannon' : 'shoot', x: cx, y: cy });
      }
    }

    // projectiles
    for (let i = this.pr.length - 1; i >= 0; i--) {
      const p = this.pr[i];
      const tgt = this.byIdU(p.u);
      if (tgt && tgt.hp > 0) { p.tx = tgt.x; p.ty = tgt.y; }
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy);
      const step = p.spd * dt;
      if (d <= step) {
        if (p.aoe > 0) {
          for (const o of this.u) if (o.hp > 0 && o.side !== p.side && Math.hypot(o.x - p.tx, o.y - p.ty) < p.aoe) this.damageU(o, p.dmg);
          this.ev.push({ k: 'hit', x: p.tx, y: p.ty, a: 1 });
        } else if (tgt && tgt.hp > 0) {
          this.damageU(tgt, p.dmg);
          this.ev.push({ k: 'hit', x: p.tx, y: p.ty });
        }
        this.pr[i] = this.pr[this.pr.length - 1]; this.pr.pop();
      } else { p.x += (dx / d) * step; p.y += (dy / d) * step; }
    }

    // units
    for (const u of this.u) {
      if (u.hp <= 0) continue;
      const d = TROOPS[u.tp];
      u.cd -= dt; u.swing = Math.max(0, u.swing - dt * 3);

      // acquire targets
      let tgtU = u.tgtU >= 0 ? this.byIdU(u.tgtU) : undefined;
      if (tgtU && tgtU.hp <= 0) { tgtU = undefined; u.tgtU = -1; }
      if (!tgtU && u.tp !== 'ram') {
        const sight = this.mode === 'defense' ? (u.side === 0 ? 7 : 3.4) : (u.side === 1 ? 5.5 : 2.0);
        const nu = this.nearestUnit(u, sight);
        if (nu) { tgtU = nu; u.tgtU = nu.id; }
      }
      let tgtB = u.tgtB >= 0 ? this.byIdB(u.tgtB) : undefined;
      if (tgtB && tgtB.hp <= 0) { tgtB = undefined; u.tgtB = -1; }
      if (!tgtU && !tgtB) {
        if (u.ver !== this.fieldVer) { u.tgtB = -1; u.ver = this.fieldVer; }
        tgtB = this.pickBuilding(u) ?? undefined;
        u.tgtB = tgtB ? tgtB.id : -1;
      }

      // in range → attack
      const ux = u.x + u.ox, uy = u.y + u.oy;
      if (tgtU) {
        const dd = Math.hypot(tgtU.x - ux, tgtU.y - uy);
        if (dd <= d.range + 0.25) {
          u.walk += dt * 0.4;
          if (u.cd <= 0) {
            u.cd = 1; u.swing = 1;
            if (d.range > 1.5) {
              this.pr.push({ x: ux, y: uy - 0.2, u: tgtU.id, tx: tgtU.x, ty: tgtU.y, spd: 10, dmg: d.dmg, aoe: 0, side: u.side, kind: 'arrow' });
              this.ev.push({ k: 'shoot', x: ux, y: uy });
            } else { this.damageU(tgtU, d.dmg); this.ev.push({ k: 'hit', x: tgtU.x, y: tgtU.y }); }
          }
          continue;
        }
        // chase
        const mdx = tgtU.x - ux, mdy = tgtU.y - uy, md = Math.hypot(mdx, mdy) || 1;
        let nx = u.x + (mdx / md) * d.speed * dt, ny = u.y + (mdy / md) * d.speed * dt;
        if (d.range <= 1.5 && this.wallAt(nx, ny)) {
          const w = this.nearestWall(u, 1.6);
          if (w) { u.tgtB = w.id; u.tgtU = -1; }
          nx = u.x; ny = u.y;
        }
        u.x = nx; u.y = ny; u.walk += dt;
        continue;
      }
      if (!tgtB) { // defense: return to rally / hold
        if (this.mode === 'defense' && u.side === 0) {
          const gp = this.rally ?? { x: u.holdX, y: u.holdY };
          const mdx = gp.x - u.x, mdy = gp.y - u.y, md = Math.hypot(mdx, mdy);
          if (md > 0.6) { u.x += (mdx / md) * d.speed * dt; u.y += (mdy / md) * d.speed * dt; u.walk += dt; }
        }
        continue;
      }
      const dd = distRect(ux, uy, tgtB.gx, tgtB.gy, tgtB.w, tgtB.h);
      if (dd <= d.range) {
        u.walk += dt * 0.4;
        if (u.cd <= 0) {
          u.cd = u.tp === 'ram' ? 1.4 : 1; u.swing = 1;
          const mult = tgtB.t === 'wall' ? d.wallBonus : 1;
          if (d.range > 1.5) {
            this.pr.push({ x: ux, y: uy - 0.2, u: -1, tx: tgtB.gx + tgtB.w / 2, ty: tgtB.gy + tgtB.h / 2, spd: 10, dmg: 0, aoe: 0, side: u.side, kind: 'arrow' });
            this.damageB(tgtB, d.dmg, u.side);
            this.ev.push({ k: 'shoot', x: ux, y: uy });
          } else {
            this.damageB(tgtB, d.dmg * mult, u.side);
            this.ev.push({ k: 'hit', x: clamp(ux, tgtB.gx, tgtB.gx + tgtB.w), y: clamp(uy, tgtB.gy, tgtB.gy + tgtB.h), a: u.tp === 'ram' ? 1 : 0 });
          }
        }
        continue;
      }
      // move toward building via flow field
      const f = this.field(tgtB);
      const cx = clamp(Math.floor(u.x), 0, GRID - 1), cy = clamp(Math.floor(u.y), 0, GRID - 1);
      const here = f[cy * GRID + cx];
      if (here >= 32000) { // unreachable → smash nearest wall on the way
        const w = this.pickBuilding(u) && u.tp !== 'ram' ? this.nearestWall(u, 20) : this.nearestWall(u, 40);
        const w2 = u.tp === 'ram' ? this.nearestWall(u, 40) : w;
        if (w2 && w2.id !== tgtB.id) { u.tgtB = w2.id; }
        else { // straight move
          const mdx = tgtB.gx + tgtB.w / 2 - u.x, mdy = tgtB.gy + tgtB.h / 2 - u.y, md = Math.hypot(mdx, mdy) || 1;
          u.x += (mdx / md) * d.speed * dt; u.y += (mdy / md) * d.speed * dt; u.walk += dt;
        }
        continue;
      }
      let bxv = here, nx = 0, ny = 0;
      const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dx2, dy2] of dirs) {
        const tx2 = cx + dx2, ty2 = cy + dy2;
        if (tx2 < 0 || ty2 < 0 || tx2 >= GRID || ty2 >= GRID) continue;
        const v = f[ty2 * GRID + tx2];
        if (v < bxv) { bxv = v; nx = dx2; ny = dy2; }
      }
      if (nx === 0 && ny === 0) { // on the target or stuck: head to rect
        const mdx = tgtB.gx + tgtB.w / 2 - ux, mdy = tgtB.gy + tgtB.h / 2 - uy, md = Math.hypot(mdx, mdy) || 1;
        u.x += (mdx / md) * d.speed * dt; u.y += (mdy / md) * d.speed * dt;
      } else {
        const gx2 = cx + nx + 0.5, gy2 = cy + ny + 0.5;
        const mdx = gx2 - u.x, mdy = gy2 - u.y, md = Math.hypot(mdx, mdy) || 1;
        u.x += (mdx / md) * d.speed * dt; u.y += (mdy / md) * d.speed * dt;
      }
      u.walk += dt;
    }

    // separation (cheap n², n is small)
    const us = this.u;
    for (let i = 0; i < us.length; i++) {
      const a = us[i]; if (a.hp <= 0) continue;
      for (let j = i + 1; j < us.length; j++) {
        const c = us[j]; if (c.hp <= 0) continue;
        const dx = c.x - a.x, dy = c.y - a.y, d2 = dx * dx + dy * dy;
        if (d2 < 0.16 && d2 > 0.0001) {
          const d = Math.sqrt(d2), push = (0.4 - d) * 0.5;
          const px = (dx / d) * push, py = (dy / d) * push;
          a.x -= px; a.y -= py; c.x += px; c.y += py;
        }
      }
    }

    // cleanup dead units after linger
    for (let i = this.u.length - 1; i >= 0; i--) if (this.u[i].hp <= 0) this.u.splice(i, 1);
  }

  alive(side: number) { let n = 0; for (const u of this.u) if (u.side === side && u.hp > 0) n++; return n; }
  townhallDead(side: number) { return this.b.some(b => b.side === side && b.t === 'townhall' && b.hp <= 0); }
  destruction(side: number) {
    let tot = 0, dead = 0;
    for (const b of this.b) {
      if (b.side !== side) continue;
      tot++;
      if (b.hp <= 0) dead++; else if (b.hp < b.mx) dead += (1 - b.hp / b.mx) * 0.5;
    }
    return tot ? clamp(Math.round((dead / tot) * 100), 0, 100) : 0;
  }
  drain(): Ev[] { const e = this.ev; this.ev = []; return e; }
}
