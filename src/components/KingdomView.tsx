import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Hammer, Swords, X, ArrowUp, Coins, Wheat, Check, Info, Tent, Sword, Landmark,
  Castle, Pickaxe, Warehouse, TowerControl, Bomb, BrickWall, SkipForward, GraduationCap, Sparkles,
} from 'lucide-react';
import type { BType, PlacedB, SaveData, TType } from '../game/types';
import { BUILDINGS, TROOPS, TROOP_ORDER, armyCap, armySize, buildLimit, canPlace, maxLvlFor, storageCap, thLevel } from '../game/content';
import { FX, drawBuilding, makeGround } from '../game/render';
import { GRID, fmt, fmtTime } from '../game/types';
import { audio } from '../game/audio';

const B_ICONS: Record<string, typeof Castle> = {
  castle: Castle, pickaxe: Pickaxe, wheat: Wheat, warehouse: Warehouse, swords: Swords,
  tent: Tent, tower: TowerControl, bomb: Bomb, bricks: BrickWall,
};
const T_ICONS: Record<TType, typeof Sword> = { sword: Sword, archer: Swords, knight: Landmark, ram: Hammer };
const BUILD_ORDER: BType[] = ['goldmine', 'farm', 'storage', 'camp', 'barracks', 'tower', 'cannon', 'wall', 'townhall'];

export default function KingdomView({ d, commit, toast, now, onOpenMap, onOpenHelp, tutDone }: {
  d: SaveData;
  commit: (fn: (d: SaveData) => void) => void;
  toast: (m: string) => void;
  now: number;
  onOpenMap: () => void; onOpenHelp: () => void;
  tutDone: (id: string) => void;
}) {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const fxRef = useRef(new FX());
  const stateRef = useRef({ placing: null as null | { t: BType; gx: number; gy: number; valid: boolean }, selectedId: -1 });
  const [placing, setPlacing] = useState<null | { t: BType; gx: number; gy: number; valid: boolean }>(null);
  const [selectedId, setSelectedId] = useState(-1);
  const [tray, setTray] = useState<'build' | 'train' | null>(null);
  const dRef = useRef(d); dRef.current = d;

  const th = thLevel(d.buildings);
  const cap = useMemo(() => storageCap(d.buildings), [d.buildings]);
  const aCap = useMemo(() => armyCap(d.buildings), [d.buildings]);
  const aUsed = armySize(d.army);
  const buildersBusy = d.buildings.filter(b => b.busy > now).length;
  const selected = d.buildings.find(b => b.id === selectedId);
  const tut = d.tut[0];

  const occ = useMemo(() => {
    const g: (PlacedB | null)[][] = Array.from({ length: GRID }, () => Array(GRID).fill(null));
    for (const b of d.buildings) {
      const def = BUILDINGS[b.t];
      for (let y = b.gy; y < b.gy + def.h; y++) for (let x = b.gx; x < b.gx + def.w; x++) if (y < GRID && x < GRID) g[y][x] = b;
    }
    return g;
  }, [d.buildings]);

  useEffect(() => { stateRef.current.placing = placing; }, [placing]);
  useEffect(() => { stateRef.current.selectedId = selectedId; }, [selectedId]);

  // ---------- canvas ----------
  useEffect(() => {
    const cv = cvRef.current!; const ctx = cv.getContext('2d')!;
    let raf = 0, ts = 0, ground: HTMLCanvasElement | null = null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      const s = cv.clientWidth;
      cv.width = cv.height = s * dpr;
      ts = s / GRID;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ground = makeGround(ts, 1234, true);
    };
    resize();
    const ro = new ResizeObserver(resize); ro.observe(cv);
    const fx = fxRef.current;
    fx.quality = d.settings.quality === 'high' ? 1 : 0.5;
    let last = performance.now();
    const loop = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      const st = stateRef.current, dd = dRef.current;
      fx.update(dt);
      const sx = (Math.random() - 0.5) * fx.shake * 30, sy = (Math.random() - 0.5) * fx.shake * 30;
      ctx.save(); ctx.translate(sx, sy);
      if (ground) ctx.drawImage(ground, 0, 0);
      const time = t / 1000;
      // buildings sorted by row
      const bs = [...dd.buildings].sort((a, b) => (a.gy + BUILDINGS[a.t].h) - (b.gy + BUILDINGS[b.t].h));
      for (const b of bs) {
        const busyB = b.busy > Date.now();
        const def = BUILDINGS[b.t];
        drawBuilding(ctx, b, ts, { time: time + b.id, scaffold: b.lvl === 0 || busyB });
        if (st.selectedId === b.id) {
          ctx.strokeStyle = '#f0cf7a'; ctx.lineWidth = 3;
          ctx.strokeRect(b.gx * ts + 2, b.gy * ts + 2, def.w * ts - 4, def.h * ts - 4);
        }
        if (busyB) { // progress bar
          const tot = def.time(Math.max(1, b.lvl + 1)) * 1000;
          const left = Math.max(0, b.busy - Date.now());
          const f = 1 - left / tot;
          ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(b.gx * ts, b.gy * ts - 7, def.w * ts, 6);
          ctx.fillStyle = '#e3b23c'; ctx.fillRect(b.gx * ts, b.gy * ts - 7, def.w * ts * f, 6);
        }
        if (def.prod && b.lvl > 0 && !busyB && b.stored >= 8) {
          // collect bubble
          const bcx = (b.gx + def.w / 2) * ts, bcy = b.gy * ts - 12 - Math.sin(time * 3 + b.id) * 3;
          ctx.fillStyle = 'rgba(20,14,8,0.85)';
          ctx.beginPath(); ctx.arc(bcx, bcy, 12, 0, Math.PI * 2); ctx.fill();
          ctx.strokeStyle = '#e3b23c'; ctx.lineWidth = 2; ctx.stroke();
          ctx.fillStyle = def.prod.res === 'gold' ? '#e3b23c' : '#c9d06a';
          ctx.beginPath(); ctx.arc(bcx, bcy, 5.5, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(0,0,0,0.35)';
          if (def.prod.res === 'food') ctx.fillRect(bcx - 1.5, bcy - 7, 3, 14);
        }
      }
      // placement ghost
      const pl = st.placing;
      if (pl) {
        ctx.fillStyle = pl.valid ? 'rgba(80,200,90,0.16)' : 'rgba(220,60,50,0.14)';
        ctx.fillRect(0, 0, GRID * ts, GRID * ts);
        drawBuilding(ctx, { t: pl.t, lvl: 1, gx: pl.gx, gy: pl.gy }, ts, { ghost: true, bad: !pl.valid, time });
      }
      fx.draw(ctx, ts);
      ctx.restore();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- pointer ----------
  const tileFrom = (e: React.PointerEvent) => {
    const r = cvRef.current!.getBoundingClientRect();
    const ts = r.width / GRID;
    return { x: (e.clientX - r.left) / ts, y: (e.clientY - r.top) / ts, ts };
  };
  const onDown = (e: React.PointerEvent) => {
    audio.ensure();
    const { x, y } = tileFrom(e);
    const pl = stateRef.current.placing;
    if (pl) {
      const def = BUILDINGS[pl.t];
      moveGhostTo(pl.t, x - def.w / 2 + 0.5, y - def.h / 2 + 0.5);
      return;
    }
    const gx = Math.floor(x), gy = Math.floor(y);
    const b = occ[gy]?.[gx];
    if (b) {
      setSelectedId(b.id); setTray(null);
      // collect production on tap
      const def = BUILDINGS[b.t];
      if (def.prod && b.lvl > 0 && b.stored >= 1 && !(b.busy > Date.now())) {
        const amt = Math.floor(b.stored);
        commit(sv => {
          const bb = sv.buildings.find(z => z.id === b.id)!;
          const have = Math.floor(bb.stored);
          if (have <= 0) return;
          const got = Math.min(have, def.prod!.res === 'gold' ? cap.gold - sv.gold : cap.food - sv.food);
          if (got > 0) { if (def.prod!.res === 'gold') sv.gold += got; else sv.food += got; }
          bb.stored -= have;
        });
        audio.play('collect');
        fxRef.current.burst(b.gx + 1, b.gy + 0.5, def.prod.res === 'gold' ? '#e3b23c' : '#c9d06a', 10, 2.2);
        fxRef.current.float(b.gx + 1, b.gy, `+${amt}`, def.prod.res === 'gold' ? '#f0cf7a' : '#d7e38a');
        tutDone('collect');
      } else audio.play('click');
    } else { setSelectedId(-1); }
  };
  const onMove = (e: React.PointerEvent) => {
    const pl = stateRef.current.placing;
    if (!pl || e.buttons === 0) return;
    const { x, y } = tileFrom(e);
    const def = BUILDINGS[pl.t];
    moveGhostTo(pl.t, x - def.w / 2 + 0.5, y - def.h / 2 + 0.5);
  };
  const moveGhostTo = (t: BType, cx: number, cy: number) => {
    const gx = Math.round(cx), gy = Math.round(cy);
    setPlacing({ t, gx, gy, valid: canPlace(occ, t, gx, gy) });
  };

  // ---------- actions ----------
  const countOf = (t: BType) => d.buildings.filter(b => b.t === t).length;
  const canAfford = (c: { gold: number; food: number }) => d.gold >= c.gold && d.food >= c.food;

  const startPlace = (t: BType) => {
    const def = BUILDINGS[t];
    if (countOf(t) >= buildLimit(th, t)) { audio.play('error'); return; }
    const lvl = t === 'townhall' ? th : 1;
    if (!canAfford(def.cost(lvl))) { toast('Not enough resources'); audio.play('error'); return; }
    let pos = { gx: 2, gy: 2 };
    outer: for (let gy = 1; gy < GRID - def.h; gy++) for (let gx = 1; gx < GRID - def.w; gx++)
      if (canPlace(occ, t, gx, gy)) { pos = { gx, gy }; break outer; }
    audio.play('click');
    setPlacing({ t, ...pos, valid: canPlace(occ, t, pos.gx, pos.gy) });
    setTray(null); setSelectedId(-1);
  };
  const confirmPlace = () => {
    if (!placing || !placing.valid) { audio.play('error'); return; }
    if (buildersBusy >= 2) { toast('All builders are busy'); audio.play('error'); return; }
    const def = BUILDINGS[placing.t];
    const lvl = 1;
    const cost = def.cost(lvl);
    commit(sv => {
      if (sv.gold < cost.gold || sv.food < cost.food) return;
      sv.gold -= cost.gold; sv.food -= cost.food;
      const timeMs = def.time(lvl) * 1000;
      sv.buildings.push({ id: sv.nextId++, t: placing.t, gx: placing.gx, gy: placing.gy, lvl: 0, busy: Date.now() + timeMs, stored: 0 });
    });
    audio.play('place');
    fxRef.current.burst(placing.gx + def.w / 2, placing.gy + def.h / 2, '#c9a23c', 14, 2.5);
    fxRef.current.addShake(0.12);
    tutDone('build');
    setPlacing(null);
  };
  const upgrade = (b: PlacedB) => {
    const def = BUILDINGS[b.t];
    const next = Math.max(1, b.lvl) + 1;
    if (next > maxLvlFor(b.t, th)) { toast('Upgrade Town Hall first'); audio.play('error'); return; }
    const cost = def.cost(next);
    if (buildersBusy >= 2) { toast('All builders are busy'); audio.play('error'); return; }
    if (!canAfford(cost)) { toast('Not enough resources'); audio.play('error'); return; }
    commit(sv => {
      sv.gold -= cost.gold; sv.food -= cost.food;
      const bb = sv.buildings.find(z => z.id === b.id)!;
      bb.busy = Date.now() + def.time(next) * 1000;
    });
    audio.play('build');
  };
  const train = (t: TType) => {
    const def = TROOPS[t];
    if (d.queue.length >= 6) { toast('Training queue is full'); audio.play('error'); return; }
    if (!canAfford(def.cost)) { toast('Not enough resources'); audio.play('error'); return; }
    const queued = d.queue.reduce((s, q) => s + TROOPS[q.t].cap, 0);
    if (armySize(d.army) + queued + def.cap > aCap) { toast('Army camps are full — build more camps'); audio.play('error'); return; }
    commit(sv => {
      sv.gold -= def.cost.gold; sv.food -= def.cost.food;
      const lastEnd = sv.queue.length ? sv.queue[sv.queue.length - 1].end : Date.now();
      const start = Math.max(Date.now(), lastEnd);
      sv.queue.push({ t, end: start + def.time * 1000, dur: def.time * 1000 });
    });
    audio.play('train');
    tutDone('train');
  };

  const selDef = selected ? BUILDINGS[selected.t] : null;
  const nextLvl = selected ? Math.max(1, selected.lvl) + 1 : 1;
  const upCost = selected ? selDef!.cost(nextLvl) : null;
  const canUpgrade = selected && !selected.busy && nextLvl <= selDef!.max && nextLvl <= maxLvlFor(selected.t, th);
  const barracksLvl = Math.max(0, ...d.buildings.filter(b => b.t === 'barracks' && b.lvl > 0).map(b => b.lvl));

  return (
    <div className="relative h-full w-full flex flex-col items-center overflow-hidden"
      style={{ background: 'radial-gradient(120% 90% at 50% 0%, #2d2317 0%, #1a130c 60%, #100b07 100%)' }}>
      {/* ------- play area ------- */}
      <div className="relative flex-1 w-full flex items-center justify-center min-h-0 p-2">
        <div className="relative anim-pop" style={{ width: 'min(100%, calc(100dvh - 240px))', maxWidth: 560, aspectRatio: '1' }}>
          <canvas ref={cvRef} className="w-full h-full rounded-lg"
            style={{ boxShadow: '0 0 0 3px #2a2118, 0 0 0 5px #7a5c2e, 0 18px 40px rgba(0,0,0,.6)' }}
            onPointerDown={onDown} onPointerMove={onMove} />
          {placing && (
            <div className="absolute left-1/2 -translate-x-1/2 -bottom-3 translate-y-full flex gap-2 z-20">
              <button className="btn btn-moss px-4 py-2" onClick={confirmPlace} disabled={!placing.valid}><Check size={18} /> Place</button>
              <button className="btn btn-crim px-4 py-2" onClick={() => setPlacing(null)}><X size={18} /></button>
            </div>
          )}
        </div>
      </div>

      {/* ------- top-left: builders ------- */}
      <div className="absolute left-2 top-2 chip text-xs">
        <Hammer size={13} color="#e3b23c" /> {2 - buildersBusy}/2 free
      </div>
      <button className="absolute right-2 top-2 btn btn-iron p-2" onClick={onOpenHelp} aria-label="Help">
        <Info size={16} />
      </button>

      {/* ------- tutorial card ------- */}
      {tut && !placing && (
        <div className="absolute left-1/2 -translate-x-1/2 top-2 z-20 panel-parch px-3 py-2 flex items-center gap-2 max-w-[92%] anim-rise">
          <GraduationCap size={20} color="#7d2a1e" className="shrink-0" />
          <p className="text-[13px] font-bold leading-tight">
            {tut === 'collect' && 'Tap a glowing Gold Mine or Farm to collect resources.'}
            {tut === 'build' && 'Tap Build and place any new building in your kingdom.'}
            {tut === 'train' && 'Open the Barracks and train a Swordsman.'}
            {tut === 'attack' && 'Press ATTACK and conquer Timberfall Camp!'}
          </p>
          <button className="btn btn-iron px-2 py-1 text-[11px]" onClick={() => { commit(sv => { sv.tut = []; }); }} title="Skip tutorial"><SkipForward size={13} /></button>
        </div>
      )}

      {/* ------- selected building popover ------- */}
      {selected && selDef && !placing && !tray && (
        <div className="w-full max-w-lg px-2 pb-2 z-10 anim-rise">
          <div className="panel-parch p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                {(() => { const I = B_ICONS[selDef.icon] ?? Castle; return <I size={20} color="#7d2a1e" />; })()}
                <div className="min-w-0">
                  <p className="font-display font-bold text-[15px] leading-tight truncate">
                    {selDef.name} <span style={{ color: '#7a5c2e' }}>Lv {Math.max(1, selected.lvl)}{selected.busy ? ` → ${nextLvl}` : ''}</span>
                  </p>
                  <p className="text-[11px] leading-tight" style={{ color: '#5d4c33' }}>{selDef.desc}</p>
                </div>
              </div>
              <button className="btn btn-iron p-1.5 shrink-0" onClick={() => setSelectedId(-1)}><X size={15} /></button>
            </div>
            {selected.busy > now ? (
              <p className="mt-2 text-sm font-bold flex items-center gap-1.5"><Sparkles size={14} color="#b8860b" /> Working… {fmtTime((selected.busy - now) / 1000)} left</p>
            ) : (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {canUpgrade ? (
                  <button className="btn btn-gold px-3 py-1.5 text-[13px]" onClick={() => upgrade(selected)}>
                    <ArrowUp size={14} /> Upgrade {fmtTime(selDef.time(nextLvl))}
                    <span className="flex items-center gap-1 text-[12px] opacity-90">
                      {upCost!.gold > 0 && <><Coins size={12} />{fmt(upCost!.gold)}</>}
                      {upCost!.food > 0 && <><Wheat size={12} />{fmt(upCost!.food)}</>}
                    </span>
                  </button>
                ) : nextLvl > maxLvlFor(selected.t, th) && selected.t !== 'townhall' ? (
                  <span className="text-[12px] font-bold" style={{ color: '#7d2a1e' }}>Requires Town Hall Lv {nextLvl <= 5 ? Math.min(5, nextLvl) : 5}</span>
                ) : null}
                {selected.t === 'barracks' && (
                  <button className="btn btn-crim px-3 py-1.5 text-[13px]" onClick={() => { setTray('train'); audio.play('click'); }}>
                    <Swords size={14} /> Train Troops
                  </button>
                )}
                {selDef.prod && selected.lvl > 0 && (
                  <span className="chip text-[12px]">
                    {selDef.prod.res === 'gold' ? <Coins size={12} color="#e3b23c" /> : <Wheat size={12} color="#c9d06a" />}
                    {Math.floor(selected.stored)} / {selDef.prod.cap(selected.lvl)}
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ------- bottom bar ------- */}
      {!selected || tray ? (
        <div className="w-full max-w-lg px-2 pb-2 z-10">
          {!tray ? (
            <div className="flex gap-2">
              <button className="btn btn-gold flex-1 py-3" onClick={() => { setTray('build'); audio.play('click'); }}>
                <Hammer size={18} /> BUILD
              </button>
              <button className="btn btn-crim flex-[1.4] py-3 text-lg anim-pulse-gold" onClick={() => { tutDone('attackPrep'); onOpenMap(); }}>
                <Swords size={20} /> ATTACK!
              </button>
              <button className="btn btn-iron flex-1 py-3" onClick={() => { setTray('train'); audio.play('click'); }}>
                <Tent size={18} /> ARMY
              </button>
            </div>
          ) : (
            <div className="panel-parch p-2.5 anim-rise">
              <div className="flex items-center justify-between mb-2">
                <p className="font-display font-bold text-[15px]">{tray === 'build' ? 'Construction Yard' : 'War Council'}</p>
                <div className="flex items-center gap-2">
                  {tray === 'train' && <span className="chip text-[12px]"><Tent size={12} color="#e3b23c" /> {aUsed}/{aCap}</span>}
                  <button className="btn btn-iron p-1.5" onClick={() => setTray(null)}><X size={15} /></button>
                </div>
              </div>
              {tray === 'build' ? (
                <div className="flex gap-2 overflow-x-auto scroll-thin pb-1">
                  {BUILD_ORDER.map(t => {
                    const def = BUILDINGS[t];
                    const limit = buildLimit(th, t);
                    const cnt = countOf(t);
                    const locked = limit === 0 || (t === 'townhall' && th >= 5);
                    const lvl = t === 'townhall' ? th : 1;
                    const cost = t === 'townhall' ? def.cost(th + 1) : def.cost(lvl);
                    const afford = canAfford(cost);
                    const I = B_ICONS[def.icon] ?? Castle;
                    return (
                      <button key={t} disabled={t === 'townhall' ? locked : (locked || cnt >= limit || !afford)}
                        onClick={() => t === 'townhall' ? (() => { const thB = d.buildings.find(b => b.t === 'townhall'); if (thB) { setSelectedId(thB.id); setTray(null); } })() : startPlace(t)}
                        className="relative shrink-0 w-[86px] rounded-lg p-1.5 text-left transition-transform hover:scale-105 active:scale-95"
                        style={{ background: locked || cnt >= limit ? 'linear-gradient(180deg,#8a8378,#6b655b)' : afford ? 'linear-gradient(180deg,#5d7a43,#40592e)' : 'linear-gradient(180deg,#7a6a45,#59492c)', border: '2px solid #2a2118', boxShadow: '0 3px 0 #2a2118', color: '#f5ecd7' }}>
                        <I size={20} />
                        <p className="text-[11px] font-bold leading-tight mt-0.5">{t === 'townhall' ? 'TH Upgrade' : def.name}</p>
                        <p className="text-[10px] opacity-85 leading-tight">
                          {locked ? `TH${buildLimit(th, 'townhall')} locked` : cnt >= limit ? 'Max built' : `${cnt}/${limit}`}
                        </p>
                        <p className="flex items-center gap-1 text-[10px] font-bold mt-0.5">
                          {cost.gold > 0 && <><Coins size={10} color="#f0cf7a" />{fmt(cost.gold)}</>}
                          {cost.food > 0 && <><Wheat size={10} color="#d7e38a" />{fmt(cost.food)}</>}
                        </p>
                      </button>
                    );
                  })}
                </div>
              ) : (
                <div>
                  <div className="flex gap-2 overflow-x-auto scroll-thin pb-1">
                    {TROOP_ORDER.map(t => {
                      const def = TROOPS[t];
                      const locked = barracksLvl < def.unlockB;
                      const afford = canAfford(def.cost);
                      const I = T_ICONS[t];
                      return (
                        <button key={t} disabled={locked || !afford || d.queue.length >= 6} onClick={() => train(t)}
                          className="relative shrink-0 w-[96px] rounded-lg p-1.5 text-left transition-transform hover:scale-105 active:scale-95"
                          style={{ background: locked ? 'linear-gradient(180deg,#8a8378,#6b655b)' : afford ? 'linear-gradient(180deg,#7d3a50,#57202e)' : 'linear-gradient(180deg,#7a6a45,#59492c)', border: '2px solid #2a2118', boxShadow: '0 3px 0 #2a2118', color: '#f5ecd7' }}>
                          <div className="flex items-center justify-between">
                            <I size={19} />
                            <span className="chip text-[11px] px-1.5 py-0">{d.army[t]}</span>
                          </div>
                          <p className="text-[11px] font-bold leading-tight mt-0.5">{def.name}</p>
                          {locked ? <p className="text-[10px]">Barracks Lv {def.unlockB}</p> : (
                            <p className="flex items-center gap-1 text-[10px] font-bold mt-0.5">
                              {def.cost.gold > 0 && <><Coins size={10} color="#f0cf7a" />{fmt(def.cost.gold)}</>}
                              {def.cost.food > 0 && <><Wheat size={10} color="#d7e38a" />{def.cost.food}</>}
                              <span className="opacity-80">· {def.time}s</span>
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                  {/* queue */}
                  <div className="mt-1.5 flex items-center gap-1.5 min-h-[26px]">
                    <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#5d4c33' }}>Queue</span>
                    {d.queue.length === 0 && <span className="text-[12px]" style={{ color: '#7a5c2e' }}>Empty — tap a troop to train</span>}
                    {d.queue.map((q, i) => {
                      const I = T_ICONS[q.t];
                      const f = i === 0 ? Math.max(0, Math.min(1, 1 - (q.end - now) / q.dur)) : 0;
                      return (
                        <div key={i} className="relative w-9 h-9 rounded-md flex items-center justify-center overflow-hidden"
                          style={{ background: '#3a2d1a', border: '1px solid #7a5c2e' }} title={TROOPS[q.t].name}>
                          <div className="absolute bottom-0 left-0 right-0" style={{ height: `${f * 100}%`, background: 'rgba(212,164,55,.45)' }} />
                          <I size={16} color="#efe0bd" className="relative" />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* floating help for TH hint */}
      <div className="absolute bottom-1 right-2 text-[10px] uppercase tracking-widest" style={{ color: '#6e6046' }}>Offline · Autosaved</div>
    </div>
  );
}
