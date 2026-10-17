import { useEffect, useRef } from 'react';
import { Play, RotateCcw, Swords, Trophy, Settings, WifiOff, Shield, Hammer, Coins } from 'lucide-react';
import type { SaveData } from '../game/types';
import { thLevel } from '../game/content';

export default function StartScreen({ save, onPlay, onNew, onScores, onSettings, onHelp }: {
  save: SaveData | null;
  onPlay: () => void; onNew: () => void; onScores: () => void; onSettings: () => void; onHelp: () => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current!; const ctx = cv.getContext('2d')!;
    let raf = 0, w = 0, h = 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);
    const embers = Array.from({ length: 42 }, () => ({
      x: Math.random(), y: Math.random(), s: 0.5 + Math.random() * 1.6, v: 0.02 + Math.random() * 0.05, o: Math.random() * Math.PI * 2,
    }));
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000); last = now;
      ctx.clearRect(0, 0, w, h);
      for (const e of embers) {
        e.y -= e.v * dt * 16; e.o += dt * 2;
        if (e.y < -0.05) { e.y = 1.05; e.x = Math.random(); }
        const x = (e.x + Math.sin(e.o) * 0.012) * w;
        ctx.globalAlpha = 0.25 + Math.sin(e.o * 1.7) * 0.2;
        ctx.fillStyle = e.s > 1.4 ? '#e8b34a' : '#c96a3a';
        ctx.beginPath(); ctx.arc(x, e.y * h, e.s, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, []);

  const stars = save ? Object.values(save.stars).reduce((a, b) => a + b, 0) : 0;

  return (
    <div className="relative h-full w-full overflow-hidden flex flex-col items-center justify-center"
      style={{ background: 'radial-gradient(130% 100% at 50% 0%, #3a2c1b 0%, #241a10 45%, #120d08 100%)' }}>
      <canvas ref={ref} className="absolute inset-0 w-full h-full" />
      {/* castle silhouettes */}
      <svg className="absolute bottom-0 left-0 w-full opacity-40" viewBox="0 0 100 26" preserveAspectRatio="none" style={{ height: '22%' }}>
        <path fill="#0c0906" d="M0 26V16h4v-3h2v3h3v-5h2v-2h2v2h2v5h4v-8h2v-3h2v3h2v8h6v-4h3v-6h2v-3h2v3h2v6h3v4h7v-7h3v-3h2v3h3v7h6v-5h4v-4h2v-2h2v2h2v4h4v5h5v-6h3v-4h2v4h3v6h7v-3h4v13z" />
      </svg>

      <div className="relative z-10 flex flex-col items-center px-6 w-full max-w-md">
        <div className="anim-bob">
          <img src="/icons/icon-512.png" alt="Kingdoms of War emblem" className="w-28 h-28 md:w-36 md:h-36 drop-shadow-[0_10px_24px_rgba(0,0,0,0.7)]" draggable={false} />
        </div>
        <h1 className="font-display text-4xl md:text-5xl font-black text-center mt-3 leading-tight">
          <span className="txt-shadow" style={{ color: 'var(--gold-2)' }}>KINGDOMS</span><br />
          <span className="txt-shadow text-2xl md:text-3xl tracking-[0.3em]" style={{ color: '#e8dcc2' }}>OF WAR</span>
        </h1>
        <p className="mt-2 text-sm md:text-base text-center font-semibold flex items-center gap-2" style={{ color: '#b8a888' }}>
          <WifiOff size={15} /> 100% offline strategy — build, battle, conquer
        </p>

        {save && (
          <div className="mt-4 flex items-center gap-2 anim-rise">
            <span className="chip"><Shield size={14} color="#e3b23c" /> TH {thLevel(save.buildings)}</span>
            <span className="chip"><Trophy size={14} color="#e3b23c" /> {save.score}</span>
            <span className="chip"><Coins size={14} color="#e3b23c" /> {stars} ★</span>
          </div>
        )}

        <div className="mt-6 flex flex-col gap-3 w-full max-w-xs">
          {save ? (
            <>
              <button className="btn btn-gold text-lg py-3 anim-pulse-gold" onClick={onPlay}>
                <Play size={20} /> CONTINUE REIGN
              </button>
              <button className="btn btn-iron py-2.5" onClick={onNew}>
                <RotateCcw size={17} /> New Kingdom
              </button>
            </>
          ) : (
            <button className="btn btn-gold text-lg py-3 anim-pulse-gold" onClick={onPlay}>
              <Hammer size={20} /> FOUND YOUR KINGDOM
            </button>
          )}
          <div className="grid grid-cols-2 gap-3">
            <button className="btn btn-crim py-2.5" onClick={onScores}><Trophy size={17} /> Records</button>
            <button className="btn btn-moss py-2.5" onClick={onSettings}><Settings size={17} /> Settings</button>
          </div>
          <button className="btn btn-iron py-2.5" onClick={onHelp}><Swords size={17} /> How to Play</button>
        </div>
        <p className="mt-5 text-[11px] tracking-widest uppercase" style={{ color: '#6e6046' }}>
          No accounts · No internet · Saves on your device
        </p>
      </div>
    </div>
  );
}
