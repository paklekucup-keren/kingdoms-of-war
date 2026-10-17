import type { Army, PlacedB, TType } from './types';
import type { Ev } from './engine';

// Local "LAN" co-op transport. Uses BroadcastChannel — zero internet, zero servers.
// Works between windows/tabs on the same device; architecture is host-authoritative.

export interface LobbyInfo { code: string; host: string; mode: string; players: number; max: number; ts: number }
export interface PlayerInfo { id: string; name: string; color: number }
export interface StartCfg {
  seed: number; lvl: number; name: string; hpMult: number; duration: number;
  buildings: PlacedB[]; garrison: Army; players: (PlayerInfo & { army: Army })[];
}
export interface Snap {
  left: number; pct: number; wave: number; wavesTotal: number;
  u: [number, TType, number, number, number, number, number][]; // id,tp,side,owner,x*100,y*100,hpFrac*10000
  b: [number, number][]; // id, hpFrac*10000
  counts: Record<string, Army>;
}
export interface EndMsg { win: boolean; pct: number; stars: number; lootG: number; lootF: number; score: number }

type Handler = (m: unknown) => void;
const uid = () => Math.random().toString(36).slice(2, 9);
const sidOf = () => Math.random().toString(36).slice(2, 7);

// ---------- lobby discovery ----------
const LOBBY = 'kow-lobby-v1';
export function listenLobby(cb: (l: LobbyInfo[]) => void) {
  const bc = new BroadcastChannel(LOBBY);
  const found = new Map<string, LobbyInfo>();
  bc.onmessage = (e: MessageEvent<LobbyInfo>) => { if (e.data?.code) found.set(e.data.code, e.data); };
  const t = window.setInterval(() => {
    const now = Date.now();
    for (const [k, v] of found) if (now - v.ts > 5000) found.delete(k);
    cb([...found.values()]);
  }, 800);
  return () => { clearInterval(t); bc.close(); };
}

// ---------- host ----------
export class CoopHost {
  code: string; sid = sidOf(); name: string; myId = uid();
  players: PlayerInfo[] = []; armies = new Map<string, Army>();
  counts = new Map<string, Army>();
  private bc: BroadcastChannel; private lobbyBc: BroadcastChannel; private ann: number;
  onRoster: (p: PlayerInfo[]) => void = () => {};
  onCmd: (playerId: string, tp: TType, x: number, y: number) => boolean = () => true;
  started = false;

  constructor(code: string, name: string, public mode: string) {
    this.code = code; this.name = name;
    this.players = [{ id: this.myId, name, color: 0 }];
    this.bc = new BroadcastChannel('kow-room-' + code);
    this.bc.onmessage = (e) => this.handle(e.data);
    this.lobbyBc = new BroadcastChannel(LOBBY);
    this.ann = window.setInterval(() => {
      if (this.started) return;
      this.lobbyBc.postMessage({ code, host: name, mode, players: this.players.length, max: 4, ts: Date.now() } as LobbyInfo);
    }, 1400);
  }
  private post(m: unknown) { this.bc.postMessage({ ...(m as object), sid: this.sid }); }
  private handle(m: { t?: string; sid?: string; id?: string; name?: string; army?: Army; tp?: TType; x?: number; y?: number }) {
    if (!m || this.started && m.t === 'hello') return;
    if (m.t === 'hello' && m.id && !this.players.some(p => p.id === m.id)) {
      if (this.players.length >= 4) { this.post({ t: 'err', msg: 'Room is full' }); return; }
      this.players.push({ id: m.id, name: (m.name || 'Ally').slice(0, 14), color: this.players.length });
      if (m.army) { this.armies.set(m.id, m.army); this.counts.set(m.id, { ...m.army }); }
      this.post({ t: 'welcome', id: m.id, hostName: this.name, mode: this.mode });
      this.post({ t: 'roster', players: this.players });
      this.onRoster(this.players);
    } else if (m.t === 'dep' && m.id && m.tp !== undefined) {
      this.onCmd(m.id, m.tp, m.x ?? 0, m.y ?? 0);
    }
  }
  start(cfg: Omit<StartCfg, 'players'>, hostArmy: Army) {
    this.started = true;
    clearInterval(this.ann);
    this.armies.set(this.myId, hostArmy); this.counts.set(this.myId, { ...hostArmy });
    const players = this.players.map(p => ({ ...p, army: this.armies.get(p.id) ?? { sword: 0, archer: 0, knight: 0, ram: 0 } }));
    this.post({ t: 'start', cfg: { ...cfg, players } });
    return { ...cfg, players } as StartCfg;
  }
  trySpend(playerId: string, tp: TType): boolean {
    const c = this.counts.get(playerId);
    if (!c || c[tp] <= 0) return false;
    c[tp]--;
    return true;
  }
  snap(s: Snap) { this.post({ t: 'snap', s }); }
  evs(evs: Ev[]) { if (evs.length) this.post({ t: 'evs', evs }); }
  end(r: EndMsg) { this.post({ t: 'end', r }); }
  rosterCounts() {
    const o: Record<string, Army> = {};
    for (const [k, v] of this.counts) o[k] = { ...v };
    return o;
  }
  close() { clearInterval(this.ann); try { this.post({ t: 'bye' }); this.bc.close(); this.lobbyBc.close(); } catch { } }
}

// ---------- client ----------
export class CoopClient {
  id = uid(); private bc: BroadcastChannel; private sid: string | null = null;
  private handlers = new Map<string, Handler[]>(); private closed = false;
  lastMsg = 0;
  constructor(public code: string, public name: string, public army: Army) {
    this.bc = new BroadcastChannel('kow-room-' + code);
    this.bc.onmessage = (e) => {
      const m = e.data;
      if (!m?.t) return;
      if (this.sid && m.sid !== this.sid) return;
      if (m.t === 'welcome') this.sid = m.sid;
      this.lastMsg = Date.now();
      (this.handlers.get(m.t) ?? []).forEach(h => h(m));
    };
  }
  hello() { this.bc.postMessage({ t: 'hello', id: this.id, name: this.name, army: this.army }); }
  on<T>(t: string, h: (m: T) => void) {
    const arr = this.handlers.get(t) ?? []; arr.push(h as Handler); this.handlers.set(t, arr);
  }
  dep(tp: TType, x: number, y: number) { this.bc.postMessage({ t: 'dep', id: this.id, tp, x, y }); }
  close() { this.closed = true; try { this.bc.close(); } catch { } }
  get isClosed() { return this.closed; }
}

export const roomCode = () => {
  const A = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * A.length)];
  return s;
};
