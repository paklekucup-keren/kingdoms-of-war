import { X, Star, Lock, Swords, Shield, Crown, Users, Infinity as InfinityIcon, Dices } from 'lucide-react';
import { CAMPAIGN, type CampaignNode } from '../game/content';
import type { SaveData } from '../game/types';

export default function CampaignMap({ save, onSelect, onSkirmish, onEndless, onCoop, onClose }: {
  save: SaveData;
  onSelect: (n: CampaignNode) => void;
  onSkirmish: () => void; onEndless: () => void; onCoop: () => void; onClose: () => void;
}) {
  const totalStars = Object.values(save.stars).reduce((a, b) => a + b, 0);
  const unlocked = (i: number) => i === 0 || (save.stars[CAMPAIGN[i - 1].id] ?? 0) > 0;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center p-3" style={{ background: 'rgba(10,7,4,0.78)' }}>
      <div className="panel-parch w-full max-w-lg max-h-full flex flex-col anim-pop overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3" style={{ background: 'linear-gradient(180deg,#7d2a1e,#5c1d14)', borderBottom: '2px solid #7a5c2e' }}>
          <div>
            <h2 className="font-display font-black text-lg md:text-xl" style={{ color: '#f0cf7a' }}>WAR MAP</h2>
            <p className="text-xs font-semibold" style={{ color: '#e8c89a' }}>{totalStars} / {CAMPAIGN.length * 3} stars earned</p>
          </div>
          <button className="btn btn-iron p-2" onClick={onClose} aria-label="Close"><X size={18} /></button>
        </div>

        <div className="overflow-y-auto scroll-thin p-4" style={{ maxHeight: '62vh' }}>
          <div className="relative flex flex-col gap-1">
            <div className="absolute left-1/2 top-4 bottom-4 w-1 -translate-x-1/2 rounded" style={{ background: 'repeating-linear-gradient(180deg,#7a5c2e 0 8px,transparent 8px 16px)' }} />
            {CAMPAIGN.map((n, i) => {
              const stars = save.stars[n.id] ?? 0;
              const lock = !unlocked(i);
              const left = i % 2 === 0;
              return (
                <div key={n.id} className={`relative flex ${left ? 'justify-start' : 'justify-end'} py-1`}>
                  <button
                    disabled={lock}
                    onClick={() => onSelect(n)}
                    className={`relative z-10 w-[46%] text-left rounded-lg p-2.5 transition-transform ${lock ? '' : 'hover:scale-[1.03] active:scale-95'}`}
                    style={{
                      background: lock ? 'linear-gradient(180deg,#8a8378,#6b655b)' : n.kind === 'defense' ? 'linear-gradient(180deg,#3c5a78,#27405c)' : 'linear-gradient(180deg,#5d7a43,#40592e)',
                      border: '2px solid #2a2118', boxShadow: '0 3px 0 #2a2118, 0 6px 12px rgba(0,0,0,.4)',
                      color: '#f5ecd7',
                    }}>
                    <div className="flex items-center gap-1.5">
                      {lock ? <Lock size={14} /> : n.kind === 'defense' ? <Shield size={14} /> : i === CAMPAIGN.length - 1 ? <Crown size={14} color="#f0cf7a" /> : <Swords size={14} />}
                      <span className="font-display font-bold text-[13px] leading-tight">{n.name}</span>
                    </div>
                    <p className="text-[11px] mt-0.5 opacity-90 leading-snug">{lock ? 'Conquer the previous realm.' : n.story}</p>
                    <div className="flex gap-0.5 mt-1">
                      {[1, 2, 3].map(s => <Star key={s} size={13} fill={stars >= s ? '#f0cf7a' : 'rgba(0,0,0,0.3)'} color={stars >= s ? '#f0cf7a' : 'rgba(0,0,0,0.4)'} />)}
                    </div>
                    {/* node peg on the path */}
                    <span className={`absolute top-1/2 -translate-y-1/2 ${left ? '-right-[18%]' : '-left-[18%]'} w-4 h-4 rounded-full`}
                      style={{ background: stars > 0 ? '#e3b23c' : lock ? '#55504a' : '#c96a3a', border: '2px solid #2a2118', boxShadow: '0 0 8px rgba(0,0,0,.5)' }} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-2 p-3" style={{ borderTop: '2px solid #7a5c2e', background: 'rgba(42,33,24,0.14)' }}>
          <button className="btn btn-iron py-2 text-[13px]" onClick={onSkirmish}><Dices size={15} /> Skirmish</button>
          <button className="btn btn-crim py-2 text-[13px]" onClick={onEndless}><InfinityIcon size={15} /> Endless Siege</button>
          <button className="btn btn-moss py-2 text-[13px]" onClick={onCoop}><Users size={15} /> Co-op</button>
        </div>
      </div>
    </div>
  );
}
