import { useState } from 'react';
import {
  X, Volume2, VolumeX, Music, Gauge, Trash2, Trophy, WifiOff, Swords, Hammer,
  Shield, Coins, Wheat, Users, Smartphone, Castle, Star, School,
} from 'lucide-react';
import type { SaveData } from '../game/types';

export function ModalShell({ title, onClose, children, accent = '#7d2a1e' }: {
  title: React.ReactNode; onClose: () => void; children: React.ReactNode; accent?: string;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center p-3" style={{ background: 'rgba(10,7,4,0.78)' }}>
      <div className="panel-parch w-full max-w-md max-h-[92dvh] flex flex-col anim-pop overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3" style={{ background: accent, borderBottom: '2px solid #7a5c2e' }}>
          <h2 className="font-display font-black text-lg" style={{ color: '#f0cf7a' }}>{title}</h2>
          <button className="btn btn-iron p-2" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>
        <div className="overflow-y-auto scroll-thin p-4">{children}</div>
      </div>
    </div>
  );
}

export function SettingsModal({ d, commit, onClose }: { d: SaveData; commit: (fn: (s: SaveData) => void) => void; onClose: () => void }) {
  const [confirmWipe, setConfirmWipe] = useState(false);
  const s = d.settings;
  const Row = ({ icon, label, children: c }: { icon: React.ReactNode; label: string; children: React.ReactNode }) => (
    <div className="flex items-center justify-between gap-3 py-2.5" style={{ borderBottom: '1px solid rgba(122,92,46,.35)' }}>
      <span className="flex items-center gap-2 font-bold text-sm">{icon}{label}</span>
      {c}
    </div>
  );
  const Toggle = ({ on, onClick }: { on: boolean; onClick: () => void }) => (
    <button onClick={onClick} className="w-14 h-7 rounded-full relative transition-colors" style={{ background: on ? '#3c7a44' : '#6b655b', border: '2px solid #2a2118' }}>
      <span className="absolute top-0.5 w-5 h-5 rounded-full transition-all" style={{ left: on ? 26 : 2, background: '#efe0bd', boxShadow: '0 1px 3px rgba(0,0,0,.5)' }} />
    </button>
  );
  return (
    <ModalShell title="SETTINGS" onClose={onClose} accent="linear-gradient(180deg,#3c5a78,#27405c)">
      <div className="mb-3">
        <label className="text-[11px] font-bold uppercase tracking-wide" style={{ color: '#5d4c33' }}>Commander name</label>
        <input value={s.name} maxLength={14} onChange={e => commit(sv => { sv.settings.name = e.target.value; })}
          className="mt-1 w-full rounded-md px-3 py-2 font-bold outline-none"
          style={{ background: 'rgba(42,33,24,.12)', border: '2px solid #7a5c2e', color: '#2a2118' }} />
      </div>
      <Row icon={s.sfx ? <Volume2 size={17} color="#3c7a44" /> : <VolumeX size={17} />} label="Sound effects">
        <Toggle on={s.sfx} onClick={() => commit(sv => { sv.settings.sfx = !sv.settings.sfx; })} />
      </Row>
      <Row icon={<Music size={17} color="#3c5a78" />} label="Music">
        <Toggle on={s.music} onClick={() => commit(sv => { sv.settings.music = !sv.settings.music; })} />
      </Row>
      <Row icon={<Gauge size={17} color="#b8860b" />} label="Graphics quality">
        <div className="flex gap-1.5">
          {(['low', 'high'] as const).map(q => (
            <button key={q} onClick={() => commit(sv => { sv.settings.quality = q; })}
              className="px-3 py-1.5 rounded-md font-bold text-xs uppercase"
              style={{ background: s.quality === q ? '#b8860b' : 'rgba(42,33,24,.15)', color: s.quality === q ? '#fff8e7' : '#5d4c33', border: '2px solid #2a2118' }}>
              {q}
            </button>
          ))}
        </div>
      </Row>
      <div className="mt-3 p-3 rounded-md text-[12px] leading-snug" style={{ background: 'rgba(60,90,120,.12)', border: '1px solid rgba(60,90,120,.35)' }}>
        <p className="font-bold flex items-center gap-1.5"><WifiOff size={14} /> Fully offline</p>
        <p className="mt-1">Progress autosaves to this device with a dual-slot checksum-protected save. On Android, use "Add to Home screen" to install it like an app. See README for building a native APK.</p>
      </div>
      <div className="mt-4">
        {confirmWipe ? (
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold flex-1" style={{ color: '#7d2a1e' }}>Erase all progress forever?</p>
            <button className="btn btn-iron px-3 py-1.5 text-sm" onClick={() => setConfirmWipe(false)}>No</button>
            <button className="btn btn-crim px-3 py-1.5 text-sm" onClick={() => { commit(sv => { Object.assign(sv, freshWipe()); }); setConfirmWipe(false); onClose(); }}>Yes, erase</button>
          </div>
        ) : (
          <button className="btn btn-crim w-full py-2 text-sm" onClick={() => setConfirmWipe(true)}><Trash2 size={15} /> Reset all progress</button>
        )}
      </div>
    </ModalShell>
  );
}

function freshWipe(): Partial<SaveData> {
  return { gold: 650, food: 550, army: { sword: 6, archer: 0, knight: 0, ram: 0 }, queue: [], stars: {}, score: 0, best: [], tut: [], coopWins: 0 };
}

export function ScoresModal({ d, onClose }: { d: SaveData; onClose: () => void }) {
  return (
    <ModalShell title="WAR RECORDS" onClose={onClose} accent="linear-gradient(180deg,#8a6416,#5c420e)">
      <div className="flex justify-center gap-4 mb-3">
        <span className="chip"><Trophy size={14} color="#e3b23c" /> War score {d.score}</span>
        <span className="chip"><Star size={14} color="#e3b23c" /> {Object.values(d.stars).reduce((a, b) => a + b, 0)} campaign stars</span>
        <span className="chip"><Users size={14} color="#7be07a" /> {d.coopWins} co-op wins</span>
      </div>
      {d.best.length === 0 && <p className="text-center text-sm py-6" style={{ color: '#5d4c33' }}>No records yet — win battles to carve your name here.</p>}
      <div className="flex flex-col gap-1.5">
        {d.best.map((e, i) => (
          <div key={i} className="flex items-center gap-2 rounded-md px-3 py-2"
            style={{ background: i === 0 ? 'linear-gradient(90deg,rgba(184,134,11,.35),rgba(184,134,11,.1))' : 'rgba(42,33,24,.1)', border: '1px solid rgba(122,92,46,.4)' }}>
            <span className="font-display font-black w-7 text-center" style={{ color: i < 3 ? '#b8860b' : '#7a5c2e' }}>{i + 1}</span>
            <span className="font-bold flex-1 truncate">{e.name}</span>
            <span className="text-[11px] uppercase tracking-wide px-2 py-0.5 rounded" style={{ background: 'rgba(42,33,24,.2)' }}>{e.mode}</span>
            <span className="font-black" style={{ color: '#7d2a1e' }}>{e.score}</span>
          </div>
        ))}
      </div>
    </ModalShell>
  );
}

export function HelpModal({ onClose }: { onClose: () => void }) {
  const Sec = ({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) => (
    <div className="mb-3">
      <p className="font-display font-bold text-[15px] flex items-center gap-2" style={{ color: '#7d2a1e' }}>{icon}{title}</p>
      <div className="text-[13px] leading-snug mt-1" style={{ color: '#3f342a' }}>{children}</div>
    </div>
  );
  return (
    <ModalShell title="HOW TO PLAY" onClose={onClose} accent="linear-gradient(180deg,#40592e,#2c3e20)">
      <Sec icon={<Hammer size={16} />} title="Build your kingdom">
        Place mines and farms to produce <b className="inline-flex items-center gap-0.5"><Coins size={11} /> gold</b> and <b className="inline-flex items-center gap-0.5"><Wheat size={11} /> food</b> — tap glowing buildings to collect. Upgrade your Town Hall to unlock cannons, knights and more. Two builders work at a time.
      </Sec>
      <Sec icon={<Swords size={16} />} title="Raise an army">
        Train Swordsmen, Archers (over walls), Knights (hunt defenses) and Siege Rams (wall-breakers) in the Barracks. Army Camps raise your capacity.
      </Sec>
      <Sec icon={<Shield size={16} />} title="Attack & defend">
        In battle, pick a troop and tap the green border to deploy. Units fight on their own — destroy the enemy Town Hall and 50% / 100% of the base for up to 3 stars. In defense missions, survive every wave and use the Rally flag to position your defenders. Defense never consumes your trained troops.
      </Sec>
      <Sec icon={<Users size={16} />} title="Local co-op (no internet)">
        Open Co-op to host or join a room with a 4-letter code. Play with a friend in another window on this device, or add an AI ally commander. The host runs the battle — no accounts, no servers.
      </Sec>
      <Sec icon={<WifiOff size={16} />} title="Play anywhere">
        Everything runs on your device. Install via "Add to Home screen" for a native-feel app, or build a real APK (see README.md — Capacitor, ~5 minutes).
      </Sec>
      <Sec icon={<Smartphone size={16} />} title="Made for small phones">
        Lightweight 2D canvas rendering, object-pooled particles, grid pathfinding and a quality switch keep 30+ fps on entry-level devices.
      </Sec>
      <Sec icon={<Castle size={16} />} title="Learn fast">
        The in-game tutorial coach <School size={12} className="inline" /> walks you through your first minutes: collect, build, train, attack.
      </Sec>
    </ModalShell>
  );
}

export interface Toast { id: number; msg: string }
export function Toasts({ items }: { items: Toast[] }) {
  return (
    <div className="absolute left-1/2 -translate-x-1/2 top-12 z-[60] flex flex-col items-center gap-1.5 pointer-events-none">
      {items.map(t => (
        <div key={t.id} className="chip anim-toast text-sm px-3 py-1.5" style={{ borderColor: '#b8860b' }}>{t.msg}</div>
      ))}
    </div>
  );
}
