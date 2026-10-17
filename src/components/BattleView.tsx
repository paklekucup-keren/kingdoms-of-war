import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sword, Swords, Landmark, Hammer, Pause, Play, FastForward, Flag, Star, Coins, Wheat,
  RotateCcw, LogOut, Trophy, Skull, Wifi, Users,
} from 'lucide-react';
import type { Army, SaveData, TType } from '../game/types';
import { GRID, emptyArmy, fmt, fmtTime } from '../game/types';
import { TROOPS, TROOP_ORDER, missionReward } from '../game/content';
import { Sim, type Ev } from '../game/engine';
import type { CoopClient, CoopHost, StartCfg, EndMsg, Snap } from '../game/net';
import { FX, drawBuilding, drawRubble, drawUnit, drawProj, makeGround, sideColor } from '../game/render';
import { audio } from '../game/audio';

export interface BattleResult {
  win: boolean; stars: number; pct: number; lootG: number; lootF: number; scoreAdd: number;
  nodeId?: string; endlessScore?: number; mode: string;
}
export type BattleSpec =
  | { kind: 'attack'; enemy: import('../game/content').EnemyBase; nodeId?: string; label: string; duration: number }
  | { kind: 'defense'; waves: { troops: [TType, number][]; gap: number }[]; lvl: number; endless: boolean; label: string; nodeId?: string }
  | { kind: 'coop-host'; host: CoopHost; cfg: StartCfg; bot: boolean }
  | { kind: 'coop-guest'; client: CoopClient; cfg: StartCfg };

const T_ICONS: Record<TType, typeof Sword> = { sword: Sword, archer: Swords, knight: Landmark, ram: Hammer };

interface GU { tx: number; ty: number; x: number; y: number; frac: number; tp: TType; side: number; owner: number; walk: number; gone: number }

export default function BattleView({ spec, d, onFinish, onAbort, onRetry, retryKey }: {
  spec: BattleSpec;
  d: SaveData;
  onFinish: (r: BattleResult, charge: Army) => void;
  onAbort: () => void;
  onRetry: () => void;
  retryKey: number;
}) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef(new FX());
  const simRef = useRef<Sim | null>(null);
  const armyLeft = useRef<Army>(emptyArmy());
  const chargeRef = useRef<Army>(emptyArmy());
  const guestUnits = useRef(new Map<number, GU>());
  const guestBHp = useRef(new Map<number, number>());
  const guestSnapAt = useRef(0);
  const coopCounts = useRef<Record<string, Army>>({});
  const overRef = useRef<BattleResult | null>(null);
  const timeRef = useRef({ left: 0, pct: 0, wave: 0, wavesTotal: 0, hostDead: false });
  const botT = useRef(3);
  const botLeft = useRef<Army>({ sword: 4, archer: 3, knight: 2, ram: 0 });
  const rallyRef = useRef<{ x: number; y: number } | null>(null);

  const [hud, setHud] = useState({ left: 0, pct: 0, wave: 0, wavesTotal: 0 });
  const [selTroop, setSelTroop] = useState<TType | null>('sword');
  const [paused, setPaused] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [rallyMode, setRallyMode] = useState(false);
  const [result, setResult] = useState<BattleResult | null>(null);
  const [confirmExit, setConfirmExit] = useState(false);
  const pausedRef = useRef(false); pausedRef.current = paused;
  const speedRef = useRef(1); speedRef.current = speed;

  const isGuest = spec.kind === 'coop-guest';
  const isCoop = spec.kind === 'coop-host' || spec.kind === 'coop-guest';
  const isDefenseView = spec.kind === 'defense';
  const playerColor = isCoop ? (spec.kind === 'coop-host' ? 0 : (spec.cfg.players.find(p => p.id === spec.client.id)?.color ?? 1)) : 0;

  const players = isCoop ? spec.cfg.players : [];
  const myTotalArmy = useMemo(() => ({ ...d.army }), // for local battles
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [spec, retryKey]);

  // ---------- init ----------
  useEffect(() => {
    audio.ensure();
    audio.setMusic('battle');
    guestUnits.current.clear(); guestBHp.current.clear(); overRef.current = null;
    chargeRef.current = emptyArmy(); rallyRef.current = null;
    setResult(null); setPaused(false); setSelTroop('sword'); setRallyMode(false);

    if (spec.kind === 'attack') {
      const sim = new Sim({ buildings: spec.enemy.buildings, buildingSide: 1, garrison: spec.enemy.garrison, seed: spec.enemy.lvl * 31 + 7 });
      simRef.current = sim;
      timeRef.current.left = spec.duration;
      armyLeft.current = { ...myTotalArmy };
    } else if (spec.kind === 'defense') {
      // town hall militia: free defenders that scale with your kingdom's development
      const militia = Math.max(1, d.buildings.find(b => b.t === 'townhall')?.lvl ?? 1) * 2;
      const garrison: Army = { ...d.army, sword: d.army.sword + militia };
      const ready = d.buildings.filter(b => b.lvl > 0 && !(b.busy > 0)).map(b => ({ ...b }));
      const sim = new Sim({ buildings: ready, buildingSide: 0, defenderOwner: 0, garrison, waves: spec.waves, seed: spec.lvl * 17 + (spec.endless ? Date.now() % 999 : 3) });
      simRef.current = sim;
      timeRef.current.left = 9999;
      timeRef.current.wavesTotal = spec.waves.length;
      armyLeft.current = emptyArmy();
    } else if (spec.kind === 'coop-host') {
      const { host, cfg } = spec;
      const sim = new Sim({ buildings: cfg.buildings.map(b => ({ ...b, hp: undefined })), buildingSide: 1, garrison: cfg.garrison, seed: cfg.seed });
      // apply hp mult
      for (const b of sim.b) { b.mx = Math.round(b.mx * cfg.hpMult); b.hp = b.mx; }
      simRef.current = sim;
      timeRef.current.left = cfg.duration;
      armyLeft.current = emptyArmy();
      host.onCmd = (pid, tp, x, y) => {
        const sim2 = simRef.current; if (!sim2 || overRef.current) return false;
        if (!sim2.deployable(x, y)) return false;
        if (!host.trySpend(pid, tp)) return false;
        const color = host.players.find(p => p.id === pid)?.color ?? 1;
        return !!sim2.deploy(tp, x, y, 0, color);
      };
    } else {
      // guest
      guestSnapAt.current = Date.now();
      spec.client.on('snap', (m: { s: Snap }) => {
        const s = m.s; guestSnapAt.current = Date.now();
        coopCounts.current = s.counts;
        for (const g of guestUnits.current.values()) g.gone++;
        for (const [id, tp, side, owner, x, y, frac] of s.u) {
          const gx = x / 100, gy = y / 100;
          const g = guestUnits.current.get(id);
          if (g) { g.tx = gx; g.ty = gy; g.frac = frac / 10000; g.gone = 0; }
          else guestUnits.current.set(id, { tx: gx, ty: gy, x: gx, y: gy, frac: frac / 10000, tp: tp as TType, side, owner, walk: Math.random() * 3, gone: 0 });
        }
        for (const [id, g] of guestUnits.current) if (g.gone > 1) guestUnits.current.delete(id);
        timeRef.current.left = s.left; timeRef.current.pct = s.pct; timeRef.current.wave = s.wave; timeRef.current.wavesTotal = s.wavesTotal;
        for (const [id, frac] of s.b) guestBHp.current.set(id, frac / 10000);
      });
      spec.client.on('evs', (m: { evs: Ev[] }) => { for (const e of m.evs) fireEv(e); });
      spec.client.on('end', (m: { r: EndMsg }) => {
        const r = m.r;
        settle({ win: r.win, stars: r.stars, pct: r.pct, lootG: r.lootG, lootF: r.lootF, scoreAdd: r.score, mode: 'coop' });
      });
      spec.client.on('bye', () => { timeRef.current.hostDead = true; });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, retryKey]);

  // guest cleanup of gone units: handled in draw loop via gone counter & snap rebuild.
  useEffect(() => () => { audio.setMusic('calm'); }, []);

  // ---------- event → fx ----------
  const fireEv = (e: Ev) => {
    const fx = fxRef.current;
    switch (e.k) {
      case 'shoot': audio.play('bow'); break;
      case 'cannon': audio.play('cannon'); fx.ring(e.x, e.y, '#e3b23c'); break;
      case 'hit':
        if (Math.random() < 0.6) audio.play('hit');
        fx.burst(e.x, e.y - 0.2, e.a ? '#c96a3a' : '#d8cfae', e.a ? 8 : 3, 2.5); break;
      case 'boom': {
        audio.play('boom'); fx.addShake(0.35);
        fx.burst(e.x, e.y, '#8d8578', 16, 4, 5, 0.14);
        fx.burst(e.x, e.y, '#e8863a', 10, 3, 3, 0.1);
        fx.ring(e.x, e.y, '#f0cf7a');
        if ((e.b ?? 0) > 0) fx.float(e.x, e.y - 0.4, `+${e.b}`, '#f0cf7a');
        if ((e.c ?? 0) > 0) fx.float(e.x, e.y - 0.8, `+${e.c}`, '#d7e38a');
        break;
      }
      case 'udie': audio.play('udie'); fx.burst(e.x, e.y, e.a === 1 ? '#b3382e' : '#2e63b3', 6, 2.4); break;
      case 'wave': audio.play('wave'); fx.ring(e.x, e.y, '#b3382e'); break;
      case 'deploy': fx.ring(e.x, e.y, e.a === 1 ? '#b3382e' : '#7be07a'); break;
    }
  };

  // ---------- battle end ----------
  const settle = (r: BattleResult) => {
    if (overRef.current) return;
    overRef.current = r;
    setResult(r);
    audio.setMusic('calm');
    audio.play(r.win ? 'win' : 'lose');
    if (spec.kind === 'coop-host') {
      spec.host.end({ win: r.win, pct: r.pct, stars: r.stars, lootG: r.lootG, lootF: r.lootF, score: r.scoreAdd });
    }
    onFinish(r, chargeRef.current);
  };

  // ---------- main loop ----------
  useEffect(() => {
    const cv = cvRef.current!; const ctx = cv.getContext('2d')!;
    let raf = 0, ts = 0, ground: HTMLCanvasElement | null = null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const s = cv.clientWidth; cv.width = cv.height = s * dpr;
      ts = s / GRID; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ground = makeGround(ts, spec.kind === 'defense' ? 1234 : (spec.kind === 'attack' ? spec.enemy.lvl * 991 + 5 : spec.cfg.seed), true);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cv);
    const fx = fxRef.current;
    fx.quality = d.settings.quality === 'high' ? 1 : 0.5;

    let last = performance.now(), hudT = 0, snapT = 0;
    const loop = (t: number) => {
      const rawDt = Math.min(0.05, (t - last) / 1000); last = t;
      const sim = simRef.current;

      // --- simulation step (host/local) ---
      if (sim && !pausedRef.current && !overRef.current) {
        const dt = rawDt * speedRef.current;
        sim.update(dt);
        if (spec.kind !== 'defense') timeRef.current.left -= dt;
        for (const e of sim.drain()) fireEv(e);

        // AI ally
        if (spec.kind === 'coop-host' && spec.bot) {
          botT.current -= dt;
          if (botT.current <= 0) {
            botT.current = 4;
            const order: TType[] = ['knight', 'sword', 'archer'];
            const tp = order.find(o => (botLeft.current[o] ?? 0) > 0);
            if (tp) {
              botLeft.current[tp]--;
              sim.deploy(tp, 1 + Math.random() * 2, 1 + Math.random() * 2, 0, 2);
            }
          }
        }

        // snapshots
        if (spec.kind === 'coop-host') {
          snapT -= dt;
          if (snapT <= 0) {
            snapT = 0.12;
            spec.host.snap({
              left: timeRef.current.left, pct: sim.destruction(1), wave: sim.waveIdx, wavesTotal: 0,
              u: sim.u.map(u => [u.id, u.tp, u.side, u.owner, Math.round(u.x * 100), Math.round(u.y * 100), Math.round((u.hp / u.mx) * 10000)]),
              b: sim.b.map(b => [b.id, Math.round((b.hp / b.mx) * 10000)]),
              counts: spec.host.rosterCounts(),
            });
          }
        }

        // --- end conditions ---
        if (spec.kind === 'defense') {
          const pct = sim.destruction(0);
          timeRef.current.pct = 100 - pct;
          if (sim.townhallDead(0)) {
            const score = spec.endless ? sim.kills * 15 + sim.waveIdx * 200 : 0;
            settle({ win: false, stars: 0, pct, lootG: 0, lootF: 0, scoreAdd: spec.endless ? 0 : sim.kills * 5, endlessScore: spec.endless ? score : undefined, nodeId: spec.nodeId, mode: spec.endless ? 'endless' : 'defense' });
          } else if (sim.wavesSpawned && sim.alive(1) === 0 && sim.ev.length === 0) {
            const intact = 100 - pct;
            const stars = intact >= 70 ? 3 : intact >= 40 ? 2 : 1;
            const rw = missionReward(spec.lvl, stars);
            settle({ win: true, stars, pct, lootG: rw.gold, lootF: rw.food, scoreAdd: rw.score, nodeId: spec.nodeId, mode: 'defense' });
          }
        } else {
          const pct = sim.destruction(1);
          timeRef.current.pct = pct;
          const thDead = sim.townhallDead(1);
          const myAlive = sim.alive(0);
          let remaining = 0;
          if (spec.kind === 'attack') for (const k of TROOP_ORDER) remaining += armyLeft.current[k];
          else if (spec.kind === 'coop-host') {
            for (const a of Object.values(spec.host.rosterCounts())) remaining += a.sword + a.archer + a.knight + a.ram;
            remaining += botLeft.current.sword + botLeft.current.archer + botLeft.current.knight;
          }
          const done = thDead || pct >= 100 || (myAlive === 0 && remaining === 0) || timeRef.current.left <= 0;
          if (done) {
            const stars = (pct >= 50 ? 1 : 0) + (thDead ? 1 : 0) + (pct >= 100 ? 1 : 0);
            const win = stars > 0;
            if (spec.kind === 'attack') {
              const rw = win ? missionReward(spec.enemy.lvl, stars) : { gold: 0, food: 0, score: 0 };
              settle({
                win, stars, pct,
                lootG: sim.lootG + rw.gold, lootF: sim.lootF + rw.food,
                scoreAdd: rw.score + pct * 2 + sim.kills * 5, nodeId: spec.nodeId, mode: 'attack',
              });
            } else {
              const lootG = Math.round(sim.lootG + (win ? 600 : 0)), lootF = Math.round(sim.lootF + (win ? 500 : 0));
              settle({ win, stars, pct, lootG, lootF, scoreAdd: (win ? 1500 : 0) + pct * 3 + sim.kills * 5, mode: 'coop' });
            }
          }
        }
      }

      // --- draw ---
      fx.update(rawDt);
      const sx = (Math.random() - 0.5) * fx.shake * 34, sy = (Math.random() - 0.5) * fx.shake * 34;
      ctx.save(); ctx.translate(sx, sy);
      if (ground) ctx.drawImage(ground, 0, 0);
      const time = t / 1000;

      // deploy zone tint
      if (!isDefenseView && selTroop && !overRef.current) {
        ctx.fillStyle = 'rgba(90,220,110,0.07)';
        ctx.fillRect(0, 0, 2.2 * ts, GRID * ts); ctx.fillRect((GRID - 2.2) * ts, 0, 2.2 * ts, GRID * ts);
        ctx.fillRect(0, 0, GRID * ts, 2.2 * ts); ctx.fillRect(0, (GRID - 2.2) * ts, GRID * ts, 2.2 * ts);
        ctx.strokeStyle = `rgba(120,235,140,${0.25 + Math.sin(time * 4) * 0.12})`; ctx.lineWidth = 2;
        ctx.strokeRect(2.2 * ts, 2.2 * ts, (GRID - 4.4) * ts, (GRID - 4.4) * ts);
      }

      if (sim) drawWorldSim(ctx, sim, ts, time);
      else drawWorldGuest(ctx, ts, time);

      // rally flag
      const rp = sim?.rally ?? null;
      if (rp) {
        ctx.strokeStyle = '#2c2116'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(rp.x * ts, rp.y * ts - ts * 0.8); ctx.lineTo(rp.x * ts, rp.y * ts); ctx.stroke();
        ctx.fillStyle = '#e3b23c';
        const sway = Math.sin(time * 5) * ts * 0.05;
        ctx.beginPath(); ctx.moveTo(rp.x * ts, rp.y * ts - ts * 0.8); ctx.lineTo(rp.x * ts + ts * 0.55 + sway, rp.y * ts - ts * 0.62); ctx.lineTo(rp.x * ts, rp.y * ts - ts * 0.44); ctx.closePath(); ctx.fill();
      }

      fx.draw(ctx, ts);
      ctx.restore();

      // hud sync ~6Hz
      hudT -= rawDt;
      if (hudT <= 0) {
        hudT = 0.16;
        const tr = timeRef.current;
        setHud(h => (h.left === Math.ceil(tr.left) && h.pct === tr.pct && h.wave === tr.wave ? h : { left: Math.ceil(tr.left), pct: tr.pct, wave: tr.wave, wavesTotal: tr.wavesTotal }));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spec, retryKey]);

  const drawWorldSim = (ctx: CanvasRenderingContext2D, sim: Sim, ts: number, time: number) => {
    const bs = [...sim.b].sort((a, b) => (a.gy + a.h) - (b.gy + b.h));
    for (const b of bs) {
      if (b.hp <= 0) { drawRubble(ctx, b, ts); continue; }
      drawBuilding(ctx, b, ts, { time: time + b.id, hpFrac: b.hp < b.mx ? b.hp / b.mx : undefined });
    }
    for (const p of sim.pr) {
      const ang = Math.atan2(p.ty - p.y, p.tx - p.x);
      drawProj(ctx, p.kind, p.x * ts, p.y * ts, ang, ts);
    }
    for (const u of sim.u) {
      drawUnit(ctx, u.tp, u.side, u.owner >= 0 ? u.owner : undefined, u.x * ts, u.y * ts, ts, { walk: u.walk, swing: u.swing }, u.hp / u.mx);
    }
  };
  const drawWorldGuest = (ctx: CanvasRenderingContext2D, ts: number, time: number) => {
    if (spec.kind !== 'coop-guest') return;
    const dt2 = 1 / 60;
    const bs = [...spec.cfg.buildings].sort((a, b) => (a.gy + 2) - (b.gy + 2));
    for (const b of bs) {
      const frac = guestBHp.current.get(b.id);
      if (frac !== undefined && frac <= 0) { drawRubble(ctx, { gx: b.gx, gy: b.gy, t: b.t }, ts); continue; }
      drawBuilding(ctx, b, ts, { time: time + b.id, hpFrac: frac !== undefined && frac < 1 ? frac : undefined });
    }
    for (const [, g] of guestUnits.current) {
      const k = Math.min(1, dt2 * 12);
      g.x += (g.tx - g.x) * k; g.y += (g.ty - g.y) * k;
      g.walk += dt2;
      drawUnit(ctx, g.tp, g.side, g.owner >= 0 ? g.owner : undefined, g.x * ts, g.y * ts, ts, { walk: g.walk, swing: 0 }, g.frac);
    }
  };

  // ---------- deploy ----------
  const tileFrom = (e: React.PointerEvent) => {
    const r = cvRef.current!.getBoundingClientRect();
    const ts2 = r.width / GRID;
    return { x: (e.clientX - r.left) / ts2, y: (e.clientY - r.top) / ts2 };
  };
  const myRemaining = (): Army => {
    if (spec.kind === 'attack') return armyLeft.current;
    if (spec.kind === 'coop-host') return spec.host.rosterCounts()[spec.host.myId] ?? emptyArmy();
    if (spec.kind === 'coop-guest') return coopCounts.current[spec.client.id] ?? ({ ...spec.cfg.players.find(p => p.id === spec.client.id)?.army } as Army);
    return emptyArmy();
  };
  const onDeploy = (e: React.PointerEvent) => {
    audio.ensure();
    const { x, y } = tileFrom(e);
    if (overRef.current || pausedRef.current) return;
    const sim = simRef.current;
    if (isDefenseView) {
      if (rallyMode && sim) { sim.rally = { x, y }; rallyRef.current = { x, y }; setRallyMode(false); audio.play('deploy'); fxRef.current.ring(x, y, '#e3b23c'); }
      return;
    }
    if (!selTroop) return;
    const rem = myRemaining();
    if ((rem[selTroop] ?? 0) <= 0) { audio.play('error'); return; }
    if (spec.kind === 'attack' && sim) {
      const u = sim.deploy(selTroop, x, y, 0, 0);
      if (!u) { audio.play('error'); return; }
      armyLeft.current[selTroop]--; chargeRef.current[selTroop]++;
    } else if (spec.kind === 'coop-host' && sim) {
      const u = sim.deploy(selTroop, x, y, 0, playerColor);
      if (!u) { audio.play('error'); return; }
      spec.host.trySpend(spec.host.myId, selTroop);
      chargeRef.current[selTroop]++;
    } else if (spec.kind === 'coop-guest') {
      if (!simGuardDeployable(x, y)) { audio.play('error'); return; }
      spec.client.dep(selTroop, x, y);
      const c = coopCounts.current[spec.client.id]; if (c) c[selTroop]--;
      chargeRef.current[selTroop]++;
    }
    audio.play('deploy');
    fxRef.current.ring(x, y, '#7be07a');
  };
  const simGuardDeployable = (x: number, y: number) => x >= 0.2 && y >= 0.2 && x <= GRID - 0.2 && y <= GRID - 0.2 && (x < 2.2 || x > GRID - 2.2 || y < 2.2 || y > GRID - 2.2);

  const rem = result ? emptyArmy() : myRemaining();
  const starsLive = hud.pct >= 100 ? 3 : hud.pct >= 50 ? 2 : (spec.kind !== 'defense' && simRef.current?.townhallDead(1)) ? 1 : 0;

  return (
    <div className="relative h-full w-full flex flex-col items-center overflow-hidden"
      style={{ background: 'radial-gradient(120% 90% at 50% 0%, #33241a 0%, #1c1109 65%, #0f0906 100%)' }}>
      {/* ------- top HUD ------- */}
      <div className="w-full max-w-lg flex items-center justify-between gap-1.5 px-2 pt-2 z-10">
        <div className="flex items-center gap-1.5 flex-wrap">
          {spec.kind !== 'defense' && (
            <span className="chip text-[13px]"><Flag size={13} color={hud.left < 20 ? '#e0604f' : '#e3b23c'} /> {fmtTime(Math.max(0, hud.left))}</span>
          )}
          {spec.kind === 'defense' && (
            <span className="chip text-[13px]"><Skull size={13} color="#e0604f" /> Wave {Math.min(hud.wave + (simRef.current?.wavesSpawned ? 0 : 1), hud.wavesTotal)}/{hud.wavesTotal}</span>
          )}
          <span className="chip text-[13px]">
            {spec.kind === 'defense' ? 'Kingdom' : 'Damage'} {spec.kind === 'defense' ? 100 - hud.pct : hud.pct}%
          </span>
          {spec.kind !== 'defense' && (
            <span className="chip">
              {[1, 2, 3].map(s => <Star key={s} size={14} fill={starsLive >= s ? '#f0cf7a' : 'rgba(255,255,255,0.12)'} color={starsLive >= s ? '#f0cf7a' : 'rgba(255,255,255,0.25)'} />)}
            </span>
          )}
          {isCoop && <span className="chip text-[12px]"><Wifi size={12} color="#7be07a" /> LOCAL</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn btn-iron p-2" title="Speed" onClick={() => { setSpeed(s => s === 1 ? 2 : 1); audio.play('click'); }}>
            <FastForward size={15} color={speed === 2 ? '#f0cf7a' : undefined} />
          </button>
          {!isGuest && (
            <button className="btn btn-iron p-2" title="Pause" onClick={() => { setPaused(p => !p); audio.play('click'); }}>
              {paused ? <Play size={15} /> : <Pause size={15} />}
            </button>
          )}
          <button className="btn btn-crim p-2" title="Retreat" onClick={() => { setConfirmExit(true); audio.play('click'); }}>
            <LogOut size={15} />
          </button>
        </div>
      </div>

      {/* co-op roster */}
      {isCoop && (
        <div className="flex items-center gap-1.5 mt-1 z-10 flex-wrap justify-center px-2">
          <Users size={13} color="#b8a888" />
          {players.map(p => (
            <span key={p.id} className="chip text-[11px]" style={{ borderColor: sideColor(0, p.color === 0 ? undefined : p.color) }}>
              {p.name}{p.id === (spec.kind === 'coop-guest' ? spec.client.id : '') ? ' (you)' : ''}
            </span>
          ))}
          {spec.kind === 'coop-host' && spec.bot && <span className="chip text-[11px]" style={{ borderColor: '#b8a888' }}>AI Ally</span>}
        </div>
      )}

      {/* ------- battlefield ------- */}
      <div className="relative flex-1 w-full flex items-center justify-center min-h-0 p-2">
        <div className="relative anim-pop" style={{ width: 'min(100%, calc(100dvh - 235px))', maxWidth: 560, aspectRatio: '1' }}>
          <canvas ref={cvRef} className="w-full h-full rounded-lg"
            style={{ boxShadow: '0 0 0 3px #2a2118, 0 0 0 5px #5c1d14, 0 18px 40px rgba(0,0,0,.65)' }}
            onPointerDown={onDeploy} />
          {paused && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 rounded-lg" style={{ background: 'rgba(10,7,4,0.72)' }}>
              <p className="font-display font-black text-2xl txt-shadow" style={{ color: '#f0cf7a' }}>PAUSED</p>
              <button className="btn btn-gold px-6 py-2.5" onClick={() => setPaused(false)}><Play size={17} /> Resume</button>
              <button className="btn btn-iron px-6 py-2.5" onClick={() => onAbort()}><LogOut size={17} /> Abandon Battle</button>
            </div>
          )}
          {isGuest && Date.now() - guestSnapAt.current > 3000 && !result && (
            <div className="absolute inset-x-4 top-4 z-20 panel-parch p-3 text-center anim-rise">
              <p className="font-bold text-sm">Waiting for host… {timeRef.current.hostDead ? 'Host disconnected.' : 'reconnecting'}</p>
              {timeRef.current.hostDead && <button className="btn btn-crim px-4 py-1.5 mt-2 text-sm" onClick={onAbort}>Return to Menu</button>}
            </div>
          )}
        </div>
      </div>

      {/* ------- deploy bar ------- */}
      {!isDefenseView && !result && (
        <div className="w-full max-w-lg px-2 pb-2 z-10">
          <div className="panel-parch p-2">
            <p className="text-[11px] font-bold uppercase tracking-wide mb-1" style={{ color: '#5d4c33' }}>
              Select a troop, then tap the green border to deploy
            </p>
            <div className="flex gap-2 justify-center">
              {TROOP_ORDER.map(tp => {
                const def = TROOPS[tp];
                const n = rem[tp] ?? 0;
                const I = T_ICONS[tp];
                const sel = selTroop === tp;
                return (
                  <button key={tp} disabled={n <= 0}
                    onClick={() => { setSelTroop(tp); audio.play('click'); }}
                    className="relative w-[74px] rounded-lg p-1.5 text-left transition-transform active:scale-95"
                    style={{
                      background: n <= 0 ? 'linear-gradient(180deg,#8a8378,#6b655b)' : sel ? 'linear-gradient(180deg,#c9963a,#8a6416)' : 'linear-gradient(180deg,#5d7a43,#40592e)',
                      border: sel ? '2px solid #f0cf7a' : '2px solid #2a2118',
                      boxShadow: sel ? '0 0 12px rgba(240,207,122,.5), 0 3px 0 #2a2118' : '0 3px 0 #2a2118',
                      color: '#f5ecd7', transform: sel ? 'scale(1.06)' : undefined,
                    }}>
                    <div className="flex items-center justify-between">
                      <I size={19} />
                      <span className="chip text-[12px] px-1.5 py-0">{n}</span>
                    </div>
                    <p className="text-[11px] font-bold leading-tight mt-0.5">{def.name}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
      {isDefenseView && !result && (
        <div className="w-full max-w-lg px-2 pb-2 z-10">
          <div className="flex gap-2">
            <button className={`btn flex-1 py-2.5 ${rallyMode ? 'btn-gold anim-pulse-gold' : 'btn-iron'}`}
              onClick={() => { setRallyMode(r => !r); audio.play('click'); }}>
              <Flag size={17} /> {rallyMode ? 'Tap the field to rally!' : 'Rally Defenders'}
            </button>
          </div>
        </div>
      )}

      {/* ------- results ------- */}
      {result && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(10,7,4,0.8)' }}>
          <div className="panel-parch w-full max-w-sm p-5 text-center anim-pop">
            <p className="font-display font-black text-3xl" style={{ color: result.win ? '#3c7a44' : '#7d2a1e' }}>
              {result.win ? 'VICTORY!' : 'DEFEAT'}
            </p>
            {result.mode !== 'endless' && (
              <div className="flex justify-center gap-2 my-3">
                {[1, 2, 3].map(s => (
                  <Star key={s} size={40} className="anim-star" style={{ animationDelay: `${0.15 + s * 0.18}s` }}
                    fill={result.stars >= s ? '#f0cf7a' : 'rgba(0,0,0,0.15)'} color={result.stars >= s ? '#b8860b' : 'rgba(0,0,0,0.25)'} />
                ))}
              </div>
            )}
            <p className="font-bold text-sm" style={{ color: '#5d4c33' }}>
              {result.mode === 'endless'
                ? `Your kingdom fell after slaying wave upon wave. War score: ${result.endlessScore ?? 0}`
                : result.win ? `Destruction: ${result.pct}%` : 'Your army was vanquished. Train and return stronger!'}
            </p>
            {(result.lootG > 0 || result.lootF > 0) && (
              <div className="flex justify-center gap-3 mt-3">
                {result.lootG > 0 && <span className="chip text-sm"><Coins size={14} color="#e3b23c" /> +{fmt(result.lootG)}</span>}
                {result.lootF > 0 && <span className="chip text-sm"><Wheat size={14} color="#c9d06a" /> +{fmt(result.lootF)}</span>}
              </div>
            )}
            {result.scoreAdd > 0 && (
              <p className="mt-2 font-bold flex justify-center items-center gap-1.5 text-sm"><Trophy size={14} color="#b8860b" /> +{fmt(result.scoreAdd)} war score</p>
            )}
            <div className="flex gap-2 mt-4">
              <button className="btn btn-gold flex-1 py-2.5" onClick={() => { audio.play('click'); onAbort(); }}>
                {result.win ? 'Continue' : 'Return to Kingdom'}
              </button>
              {!result.win && result.mode !== 'coop' && result.mode !== 'endless' && (
                <button className="btn btn-crim flex-1 py-2.5" onClick={() => { audio.play('click'); onRetry(); }}>
                  <RotateCcw size={16} /> Retry
                </button>
              )}
              {!result.win && result.mode === 'endless' && (
                <button className="btn btn-crim flex-1 py-2.5" onClick={() => { audio.play('click'); onRetry(); }}>
                  <RotateCcw size={16} /> Again
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ------- retreat confirm ------- */}
      {confirmExit && !result && (
        <div className="absolute inset-0 z-40 flex items-center justify-center p-4" style={{ background: 'rgba(10,7,4,0.75)' }}>
          <div className="panel-parch w-full max-w-xs p-4 text-center anim-pop">
            <p className="font-display font-bold text-lg">Abandon the battle?</p>
            <p className="text-sm mt-1" style={{ color: '#5d4c33' }}>Deployed troops will be lost.</p>
            <div className="flex gap-2 mt-3">
              <button className="btn btn-iron flex-1 py-2" onClick={() => setConfirmExit(false)}>Stay</button>
              <button className="btn btn-crim flex-1 py-2" onClick={() => {
                setConfirmExit(false);
                if (simRef.current && !overRef.current) {
                  const sim = simRef.current;
                  const pct = spec.kind === 'defense' ? sim.destruction(0) : sim.destruction(1);
                  settle({ win: false, stars: 0, pct, lootG: spec.kind === 'attack' ? sim.lootG : 0, lootF: spec.kind === 'attack' ? sim.lootF : 0, scoreAdd: Math.round(pct), nodeId: spec.kind !== 'coop-host' ? (spec as { nodeId?: string }).nodeId : undefined, mode: spec.kind === 'defense' ? (spec.endless ? 'endless' : 'defense') : spec.kind === 'attack' ? 'attack' : 'coop' });
                } else onAbort();
              }}>Retreat</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
