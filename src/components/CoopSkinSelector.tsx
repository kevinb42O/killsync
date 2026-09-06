import type { CSSProperties } from 'react';
import { Check, Crown } from 'lucide-react';
import { COOP_SKINS, type CoopSkinId } from '../game/multiplayer/CoopSkins';
import { coopSkinDescriptionKey, coopText, type CoopLanguage } from '../game/multiplayer/i18n';

export function CoopSkinSelector({ value, language, disabled = false, onChange }: {
  value: CoopSkinId;
  language: CoopLanguage;
  disabled?: boolean;
  onChange: (skinId: CoopSkinId) => void;
}) {
  const tr = (key: Parameters<typeof coopText>[1]) => coopText(language, key);
  return (
    <section aria-labelledby="coop-skin-heading" className="mb-6 border border-cyan-400/20 bg-black/20 p-3.5">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h3 id="coop-skin-heading" className="text-[10px] font-black uppercase tracking-[0.2em] text-cyan-300">{tr('skin.heading')}</h3>
          <p className="mt-1 text-[10px] text-white/45">{tr('skin.help')}</p>
        </div>
        <span className="text-[8px] font-black uppercase tracking-widest text-emerald-300">{tr('skin.allUnlocked')}</span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {COOP_SKINS.map(skin => {
          const selected = skin.id === value;
          return (
            <button
              key={skin.id}
              type="button"
              aria-pressed={selected}
              disabled={disabled}
              onClick={() => onChange(skin.id)}
              title={tr(coopSkinDescriptionKey(skin.id))}
              className={`group relative min-h-32 overflow-hidden border p-2 text-left transition ${selected ? 'border-cyan-200 bg-cyan-400/15 shadow-[0_0_18px_rgba(34,211,238,.22)]' : 'border-white/10 bg-white/[0.025] hover:-translate-y-0.5 hover:border-white/35'} disabled:cursor-not-allowed disabled:opacity-50`}
              style={{ '--skin-armor': skin.palette.armor, '--skin-glow': skin.palette.glow, '--skin-suit': skin.palette.undersuit, '--skin-trim': skin.palette.trim } as CSSProperties}
            >
              {skin.tier === 'premium' && <span className="absolute right-1.5 top-1.5 z-10 flex items-center gap-0.5 bg-amber-300 px-1 py-0.5 text-[6px] font-black uppercase tracking-wider text-black"><Crown size={7} /> {tr('skin.premium')}</span>}
              {selected && <span className="absolute left-1.5 top-1.5 z-10 grid h-4 w-4 place-items-center rounded-full bg-cyan-200 text-black"><Check size={10} strokeWidth={4} /></span>}
              <div className={`coop-skin-preview ${skin.tier === 'premium' ? 'coop-skin-preview--premium' : ''}`} aria-hidden="true">
                <span className="coop-skin-preview__head"><i /><i /></span>
                <span className="coop-skin-preview__body" />
              </div>
              <div className="mt-1 truncate text-[8px] font-black uppercase tracking-wide text-white">{skin.name}</div>
              <div className="mt-1 flex gap-1" aria-hidden="true">
                {[skin.palette.undersuit, skin.palette.armor, skin.palette.trim, skin.palette.glow].map(color => <span key={color} className="h-1 flex-1" style={{ background: color }} />)}
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function CoopSkinBadge({ skinId }: { skinId?: CoopSkinId }) {
  const skin = COOP_SKINS.find(candidate => candidate.id === skinId) || COOP_SKINS[0];
  return <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-wider" style={{ color: skin.palette.glow }}><i className="h-1.5 w-1.5 rounded-full" style={{ background: skin.palette.armor, boxShadow: `0 0 7px ${skin.palette.glow}` }} />{skin.name}</span>;
}
