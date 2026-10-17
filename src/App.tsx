import { useCallback, useEffect, useRef, useState } from 'react';
import { Coins, Wheat, Trophy, Settings, Castle } from 'lucide-react';
import type { Army, SaveData } from './game/types';
import { armySize, BUILDINGS, makeEnemy, makeWaves, storageCap, type CampaignNode } from './game/content';
import { defaultSave, loadSave, pushScore, writeSave } from './game/save';
import { audio } from './game/audio';
import { fmt } from './game/types';
import StartScreen from './components/StartScreen';
import KingdomView from './components/KingdomView';
import BattleView, { type BattleResult, type BattleSpec } from './components/BattleView';
import CampaignMap from './components/CampaignMap';
import CoopLobby from './components/CoopLobby';
import { HelpModal, ScoresModal, SettingsModal, Toasts, type Toast } from './components/Panels';

type Screen = 'start' | 'kingdom' | 'battle';
type Modal = 'none' | 'map' | 'settings' | 'scores' | 'help' | 'coop';

export default function App() {
  const [save, setSave] = useState<SaveData | null>(() => loadSave());
  const saveRef = useRef(save); saveRef.current = save;
  const [screen, setScreen] = useState<Screen>('start');
  const [modal, setModal] = useState<Modal>('none');
  const [battle, setBattle] = useState<BattleSpec | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [now, setNow] = useState(Date.now());
  const toastId = useRef(0);
  const skirmishSeed = useRef(Math.floor(Math.random() * 9000) + 100);

  const toast = useCallback((msg: string) => {
    const id = ++toastId.current;
    setToasts(t => [...t.slice(-2), { id, msg }]);
    window.setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 2600);
  }, []);

  const commit = useCallback((fn: (d: SaveData) => void) => {
    setSave(prev => {
      if (!prev) return prev;
      const d: SaveData = JSON.parse(JSON.stringify(prev));
      fn(d);
      writeSave(d);
      return d;
    });
  }, []);

  // ---------- audio wiring ----------
  useEffect(() => {
    const wake = () => audio.ensure();
    window.addEventListener('pointerdown', wake, { passive: true });
    window.addEventListener('keydown', wake);
    return () => { window.removeEventListener('pointerdown', wake); window.removeEventListener('keydown', wake); };
  }, []);
  useEffect(() => {
    audio.sfxOn = save?.settings.sfx ?? true;
    audio.musicOn = save?.settings.music ?? true;
    audio.applyToggles();
  }, [save?.settings.sfx, save?.settings.music]);
  useEffect(() => {
    const onVis = () => audio.setMusic(document.hidden ? 'off' : screen === 'battle' ? 'battle' : 'calm');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [screen]);
  useEffect(() => { if (screen !== 'battle') audio.setMusic('calm'); }, [screen]);

  // ---------- game tick ----------
  useEffect(() => {
    if (!save) return;
    const iv = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      setSave(prev => {
        if (!prev) return prev;
        const d: SaveData = JSON.parse(JSON.stringify(prev));
        let changed = false;
        // production catch-up
        const dt = Math.min(3600, Math.max(0, (t - d.lastTs) / 1000));
        d.lastTs = t;
        if (dt > 0.5) {
          for (const b of d.buildings) {
            const def = BUILDINGS[b.t];
            if (def.prod && b.lvl > 0 && !b.busy) {
              const add = def.prod.rate(b.lvl) * dt;
              const capB = def.prod.cap(b.lvl);
              if (b.stored < capB) { b.stored = Math.min(capB, b.stored + add); changed = true; }
            }
          }
        }
        // construction completion
        for (const b of d.buildings) {
          if (b.busy && b.busy <= t) {
            b.lvl = Math.max(1, b.lvl + 1); b.busy = 0; changed = true;
            b.stored = 0;
            toast(`${BUILDINGS[b.t].name} reached level ${b.lvl}!`);
            audio.play('upgrade');
          }
        }
        // training completion
        const capA = d.queue;
        if (capA.length && capA[0].end <= t) {
          const q = capA.shift()!;
          d.army[q.t]++;
          changed = true;
          toast(`A soldier joins your army!`);
          audio.play('train');
        }
        if (changed) { writeSave(d); return d; }
        return prev;
      });
    }, 500);
    return () => clearInterval(iv);
  }, [save === null, toast]);
  // persist on hide
  useEffect(() => {
    const h = () => { if (document.hidden && saveRef.current) writeSave(saveRef.current); };
    document.addEventListener('visibilitychange', h);
    window.addEventListener('beforeunload', h);
    return () => { document.removeEventListener('visibilitychange', h); window.removeEventListener('beforeunload', h); };
  }, []);

  const tutDone = useCallback((id: string) => {
    commit(d => { d.tut = d.tut.filter(x => x !== id); });
  }, [commit]);

  // ---------- battle lifecycle ----------
  const startAttack = (n: CampaignNode) => {
    if (save && armySize(save.army) === 0) { audio.play('error'); toast('Train troops before marching!'); return; }
    const seed = n.lvl * 733 + ((skirmishSeed.current += 97) % 1000);
    setBattle({ kind: 'attack', enemy: makeEnemy(n.lvl, seed), nodeId: n.id, label: n.name, duration: 145 + n.lvl * 6 });
    setModal('none'); setScreen('battle');
  };
  const startDefense = (n: CampaignNode) => {
    setBattle({ kind: 'defense', waves: makeWaves(Math.max(1, n.lvl - 1), 0), lvl: n.lvl, endless: false, label: n.name, nodeId: n.id });
    setModal('none'); setScreen('battle');
  };
  const startSkirmish = () => {
    if (save && armySize(save.army) === 0) { audio.play('error'); toast('Train troops before marching!'); return; }
    const stars = save ? Object.values(save.stars).reduce((a, b) => a + b, 0) : 0;
    const lvl = Math.min(12, 2 + Math.floor(stars / 2));
    const seed = (skirmishSeed.current += 137);
    setBattle({ kind: 'attack', enemy: makeEnemy(lvl, seed), label: 'Skirmish Raid', duration: 170 });
    setModal('none'); setScreen('battle');
  };
  const startEndless = () => {
    setBattle({ kind: 'defense', waves: makeWaves(2, 60), lvl: 2, endless: true, label: 'Endless Siege' });
    setModal('none'); setScreen('battle');
  };

  const finishBattle = useCallback((r: BattleResult, charge: Army) => {
    commit(d => {
      for (const k of Object.keys(charge) as (keyof Army)[]) d.army[k] = Math.max(0, d.army[k] - charge[k]);
      const cap = storageCap(d.buildings);
      let over = false;
      if (r.lootG) { const add = Math.min(r.lootG, cap.gold - d.gold); if (add < r.lootG) over = true; d.gold += Math.max(0, add); }
      if (r.lootF) { const add = Math.min(r.lootF, cap.food - d.food); if (add < r.lootF) over = true; d.food += Math.max(0, add); }
      if (over) toast('Storage is full — build more Storages!');
      d.score += Math.max(0, Math.round(r.scoreAdd));
      if (r.nodeId && r.stars > 0) d.stars[r.nodeId] = Math.max(d.stars[r.nodeId] ?? 0, r.stars);
      if (r.mode === 'endless' && r.endlessScore !== undefined && r.endlessScore > 0) pushScore(d, { score: r.endlessScore, mode: 'Endless' });
      if (r.mode === 'defense' && r.win) pushScore(d, { score: r.scoreAdd, mode: 'Defense' });
      if (r.mode === 'coop' && r.win) { d.coopWins++; pushScore(d, { score: r.scoreAdd, mode: 'Co-op' }); }
      if (r.win && r.nodeId === 'c1') d.tut = d.tut.filter(x => x !== 'attack');
      if (r.win && r.nodeId === 'c10') toast('The realm is yours. All hail the true monarch!');
    });
  }, [commit, toast]);

  const exitBattle = useCallback(() => {
    setBattle(prev => {
      if (prev?.kind === 'coop-host') prev.host.close();
      if (prev?.kind === 'coop-guest') prev.client.close();
      return null;
    });
    setScreen('kingdom');
  }, []);

  // ---------- screens ----------
  if (!save || screen === 'start') {
    return (
      <>
        <StartScreen
          save={save}
          onPlay={() => {
            audio.ensure(); audio.play('upgrade');
            if (!save) { const d = defaultSave(); writeSave(d); setSave(d); }
            setScreen('kingdom');
          }}
          onNew={() => { const d = defaultSave(); writeSave(d); setSave(d); setScreen('kingdom'); toast('A new kingdom rises!'); }}
          onScores={() => setModal('scores')}
          onSettings={() => setModal('settings')}
          onHelp={() => setModal('help')}
        />
        {modal === 'scores' && save && <ScoresModal d={save} onClose={() => setModal('none')} />}
        {modal === 'settings' && save && <SettingsModal d={save} commit={commit} onClose={() => setModal('none')} />}
        {modal === 'settings' && !save && (
          <SettingsModal d={defaultSave()} commit={() => {}} onClose={() => setModal('none')} />
        )}
        {modal === 'help' && <HelpModal onClose={() => setModal('none')} />}
        <Toasts items={toasts} />
      </>
    );
  }

  return (
    <div className="h-full w-full flex flex-col" style={{ background: '#100b07' }}>
      {/* HUD */}
      <div className="flex items-center justify-between gap-2 px-2 py-1.5 z-20" style={{ background: 'linear-gradient(180deg,#241a10,#171009)', borderBottom: '2px solid #4a3823' }}>
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="chip text-[13px]"><Castle size={14} color="#f0cf7a" /></span>
          <span className="chip text-[13px]"><Coins size={14} color="#e3b23c" /> {fmt(save.gold)}</span>
          <span className="chip text-[13px]"><Wheat size={14} color="#c9d06a" /> {fmt(save.food)}</span>
          <span className="chip text-[13px] hidden sm:inline-flex"><Trophy size={14} color="#e3b23c" /> {fmt(save.score)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="btn btn-iron p-2" onClick={() => { setModal('scores'); audio.play('click'); }} aria-label="Records"><Trophy size={15} /></button>
          <button className="btn btn-iron p-2" onClick={() => { setModal('settings'); audio.play('click'); }} aria-label="Settings"><Settings size={15} /></button>
        </div>
      </div>

      <div className="relative flex-1 min-h-0">
        {screen === 'kingdom' && (
          <KingdomView
            d={save} commit={commit} toast={toast} now={now}
            onOpenMap={() => { setModal('map'); audio.play('click'); }}
            onOpenHelp={() => { setModal('help'); audio.play('click'); }}
            tutDone={tutDone}
          />
        )}
        {screen === 'battle' && battle && (
          <BattleView
            key={JSON.stringify({ k: battle.kind, n: (battle as { nodeId?: string }).nodeId, r: retryKey })}
            spec={battle} d={save} retryKey={retryKey}
            onFinish={finishBattle}
            onRetry={() => setRetryKey(k => k + 1)}
            onAbort={exitBattle}
          />
        )}
        {modal === 'map' && (
          <CampaignMap
            save={save}
            onSelect={n => { if (n.kind === 'attack') startAttack(n); else startDefense(n); }}
            onSkirmish={startSkirmish}
            onEndless={startEndless}
            onCoop={() => { setModal('coop'); audio.play('click'); }}
            onClose={() => setModal('none')}
          />
        )}
        {modal === 'coop' && (
          <CoopLobby
            d={save}
            onStart={spec => { setBattle(spec); setModal('none'); setScreen('battle'); }}
            onClose={() => setModal('none')}
          />
        )}
        {modal === 'settings' && <SettingsModal d={save} commit={commit} onClose={() => setModal('none')} />}
        {modal === 'scores' && <ScoresModal d={save} onClose={() => setModal('none')} />}
        {modal === 'help' && <HelpModal onClose={() => setModal('none')} />}
        <Toasts items={toasts} />
      </div>
    </div>
  );
}
