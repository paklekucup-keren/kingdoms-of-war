import { useEffect, useRef, useState } from 'react';
import { X, Crown, Search, Users, Bot, Play, WifiOff, Loader2, RefreshCw, LogIn } from 'lucide-react';
import type { Army, SaveData } from '../game/types';
import { makeEnemy, armySize } from '../game/content';
import { CoopClient, CoopHost, listenLobby, roomCode, type LobbyInfo, type StartCfg } from '../game/net';
import type { BattleSpec } from './BattleView';
import { audio } from '../game/audio';

export default function CoopLobby({ d, onStart, onClose }: {
  d: SaveData;
  onStart: (spec: BattleSpec) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'host' | 'join'>('host');
  const [host, setHost] = useState<CoopHost | null>(null);
  const [roster, setRoster] = useState<{ id: string; name: string; color: number }[]>([]);
  const [bot, setBot] = useState(true);
  const [found, setFound] = useState<LobbyInfo[]>([]);
  const [code, setCode] = useState('');
  const [client, setClient] = useState<CoopClient | null>(null);
  const [joinState, setJoinState] = useState<'idle' | 'joining' | 'joined' | 'fail'>('idle');
  const hostRef = useRef<CoopHost | null>(null);
  const clientRef = useRef<CoopClient | null>(null);
  const [err, setErr] = useState('');

  const handedOff = useRef(false);

  useEffect(() => {
    if (tab !== 'join') return;
    const stop = listenLobby(list => setFound(list));
    return stop;
  }, [tab]);

  // transports are owned by the battle view once a match starts — otherwise clean up
  useEffect(() => () => {
    if (!handedOff.current) { hostRef.current?.close(); clientRef.current?.close(); }
  }, []);

  const createHost = () => {
    audio.ensure(); audio.play('click');
    hostRef.current?.close();
    const h = new CoopHost(roomCode(), d.settings.name || 'Commander', 'Twin Assault');
    h.onRoster = p => setRoster([...p]);
    hostRef.current = h;
    setHost(h); setRoster([...h.players]);
  };

  const startMission = () => {
    const h = hostRef.current; if (!h) return;
    audio.play('upgrade');
    const players = h.players.length;
    const lvl = 6 + Math.min(4, players * 2);
    const seed = Math.floor(Math.random() * 9999) + 1;
    const enemy = makeEnemy(lvl, seed);
    const hpMult = 1 + 0.45 * Math.max(0, players - 1) + (bot && players < 2 ? 0.25 : 0);
    const cfg = h.start({
      seed, lvl, name: enemy.name, hpMult, duration: 200,
      buildings: enemy.buildings,
      garrison: { sword: 0, archer: 0, knight: 0, ram: 0, ...enemy.garrison } as Army,
    }, d.army);
    handedOff.current = true;
    onStart({ kind: 'coop-host', host: h, cfg: cfg as StartCfg, bot });
  };

  const join = (c: string) => {
    if (clientRef.current) return;
    audio.ensure(); audio.play('click');
    setErr(''); setJoinState('joining');
    const cl = new CoopClient(c.toUpperCase().trim(), d.settings.name || 'Ally', { ...d.army });
    clientRef.current = cl; setClient(cl);
    const kill = window.setTimeout(() => {
      if (joinStateRef.current === 'joining') { setJoinState('fail'); setErr('No host answered. Check the code and try again.'); cl.close(); clientRef.current = null; setClient(null); }
    }, 6000);
    cl.on('welcome', () => { clearTimeout(kill); setJoinState('joined'); });
    cl.on('start', (m: { cfg: StartCfg }) => { clearTimeout(kill); handedOff.current = true; onStart({ kind: 'coop-guest', client: cl, cfg: m.cfg }); });
    cl.on('err', (m: { msg: string }) => { setErr(m.msg); setJoinState('fail'); });
    cl.hello();
    const ping = window.setInterval(() => { if (joinStateRef.current === 'joining') cl.hello(); else clearInterval(ping); }, 1200);
  };
  const joinStateRef = useRef(joinState); joinStateRef.current = joinState;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-3" style={{ background: 'rgba(10,7,4,0.8)' }}>
      <div className="panel-parch w-full max-w-md anim-pop overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3" style={{ background: 'linear-gradient(180deg,#1f6b5c,#134a40)', borderBottom: '2px solid #7a5c2e' }}>
          <div>
            <h2 className="font-display font-black text-lg" style={{ color: '#c9f2e7' }}>CO-OP WAR ROOM</h2>
            <p className="text-[11px] font-semibold flex items-center gap-1" style={{ color: '#8fd8c6' }}><WifiOff size={11} /> Local play — no internet needed</p>
          </div>
          <button className="btn btn-iron p-2" onClick={onClose} aria-label="Close"><X size={17} /></button>
        </div>

        <div className="grid grid-cols-2 gap-2 p-3 pb-0">
          <button className={`btn py-2 text-sm ${tab === 'host' ? 'btn-gold' : 'btn-iron'}`} onClick={() => setTab('host')}><Crown size={15} /> Host Game</button>
          <button className={`btn py-2 text-sm ${tab === 'join' ? 'btn-gold' : 'btn-iron'}`} onClick={() => setTab('join')}><LogIn size={15} /> Join Game</button>
        </div>

        <div className="p-4">
          {tab === 'host' ? (
            !host ? (
              <div className="text-center py-4">
                <p className="text-sm font-bold" style={{ color: '#5d4c33' }}>
                  Create a war room. Friends join with your 4-letter code — Battles run on your device (host-authoritative).
                </p>
                <p className="text-[12px] mt-2" style={{ color: '#7a5c2e' }}>
                  Bring your army of {armySize(d.army)} units. Enemy strength scales with player count (2-4 commanders).
                </p>
                <button className="btn btn-gold px-5 py-2.5 mt-3" onClick={createHost}><Crown size={17} /> Create Room</button>
              </div>
            ) : (
              <div>
                <div className="text-center rounded-lg py-3" style={{ background: 'rgba(42,33,24,.12)', border: '2px dashed #7a5c2e' }}>
                  <p className="text-[11px] font-bold uppercase tracking-widest" style={{ color: '#7a5c2e' }}>Room code — say it aloud</p>
                  <p className="font-display font-black text-4xl tracking-[0.35em] mt-1" style={{ color: '#7d2a1e' }}>{host.code}</p>
                </div>
                <div className="mt-3">
                  <p className="text-[12px] font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: '#5d4c33' }}><Users size={13} /> Commanders ({roster.length}/4)</p>
                  <div className="flex flex-col gap-1 mt-1">
                    {roster.map(p => (
                      <div key={p.id} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm font-bold"
                        style={{ background: 'rgba(42,33,24,.1)', border: '1px solid rgba(122,92,46,.4)' }}>
                        <Crown size={13} color={p.color === 0 ? '#b8860b' : '#7a5c2e'} /> {p.name} {p.color === 0 && '(you, host)'}
                      </div>
                    ))}
                    {roster.length === 1 && <p className="text-[12px] px-1" style={{ color: '#7a5c2e' }}>Waiting for allies to join… open the game in another tab/window on this device and use Join Game.</p>}
                  </div>
                </div>
                <label className="mt-3 flex items-center gap-2 text-sm font-bold cursor-pointer" style={{ color: '#5d4c33' }}>
                  <input type="checkbox" checked={bot} onChange={e => setBot(e.target.checked)} className="w-4 h-4 accent-[#7d2a1e]" />
                  <Bot size={15} /> Add AI ally commander
                </label>
                <button className="btn btn-crim w-full py-2.5 mt-3" onClick={startMission}>
                  <Play size={17} /> March on the Twin Fortress
                </button>
              </div>
            )
          ) : (
            <div>
              {joinState !== 'joined' ? (
                <>
                  <p className="text-sm font-bold" style={{ color: '#5d4c33' }}>Enter the host's room code:</p>
                  <div className="flex gap-2 mt-2">
                    <input value={code} maxLength={4} onChange={e => setCode(e.target.value.toUpperCase())}
                      placeholder="CODE"
                      className="flex-1 rounded-md px-3 py-2 font-display font-black text-2xl text-center tracking-[0.3em] outline-none uppercase"
                      style={{ background: 'rgba(42,33,24,.12)', border: '2px solid #7a5c2e', color: '#2a2118' }} />
                    <button className="btn btn-gold px-4" disabled={code.trim().length !== 4 || joinState === 'joining'} onClick={() => join(code)}>
                      {joinState === 'joining' ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
                    </button>
                  </div>
                  {err && <p className="mt-2 text-[12px] font-bold" style={{ color: '#7d2a1e' }}>{err}</p>}
                  <div className="mt-4">
                    <p className="text-[12px] font-bold uppercase tracking-wide flex items-center gap-1.5" style={{ color: '#5d4c33' }}>
                      <Search size={13} /> Local games found <RefreshCw size={11} className="animate-spin" style={{ animationDuration: '3s' }} />
                    </p>
                    {found.length === 0 && <p className="text-[12px] mt-1 px-1" style={{ color: '#7a5c2e' }}>None yet — hosts appear here automatically.</p>}
                    <div className="flex flex-col gap-1.5 mt-1.5">
                      {found.map(f => (
                        <button key={f.code} className="flex items-center gap-2 rounded-md px-3 py-2 text-left transition-transform hover:scale-[1.02]"
                          style={{ background: 'linear-gradient(180deg,#5d7a43,#40592e)', border: '2px solid #2a2118', color: '#f5ecd7', boxShadow: '0 3px 0 #2a2118' }}
                          onClick={() => join(f.code)}>
                          <Crown size={14} color="#f0cf7a" />
                          <span className="font-bold text-sm flex-1">{f.host}'s room</span>
                          <span className="text-[11px] opacity-90">{f.mode}</span>
                          <span className="chip text-[11px]"><Users size={11} /> {f.players}/{f.max}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="text-center py-6">
                  <Loader2 size={26} className="animate-spin mx-auto" color="#7d2a1e" />
                  <p className="font-bold mt-2" style={{ color: '#5d4c33' }}>Joined {client?.code}! Waiting for the host to march…</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
