import { AlertTriangle, Dna } from 'lucide-react';
import { COOP_IMPRINT_STATS, coopImprintRankCost, coopImprintRating, type CoopImprintStatId, type CoopOperatorImprint } from '../game/multiplayer/CoopImprint';
import { coopImprintStatDescriptionKey, coopImprintStatEffectKey, coopImprintStatNameKey, coopText, type CoopLanguage, type CoopTextKey } from '../game/multiplayer/i18n';

export function CoopImprintSummary({ imprint, language, locked = false, onUpgrade }: {
  imprint: CoopOperatorImprint;
  language: CoopLanguage;
  locked?: boolean;
  onUpgrade?: (statId: CoopImprintStatId) => void;
}) {
  const tr = (key: CoopTextKey, params?: Record<string, string | number>) => coopText(language, key, params);
  return <section aria-label={tr('imprint.label')} className="mb-6 border border-cyan-300/25 bg-gradient-to-r from-cyan-400/[.07] via-[#07111b] to-fuchsia-400/[.05] p-4 shadow-[inset_0_0_32px_rgba(34,211,238,.035)]">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.22em] text-cyan-200"><Dna size={15} />{tr('imprint.label')}</div>
        <div className="mt-1 text-lg font-black uppercase text-white">{imprint.operatorId} // {tr('imprint.generation')} {String(imprint.generation).padStart(2, '0')}</div>
      </div>
      <div className="flex gap-5 text-right">
        <Metric label={tr('imprint.rating')} value={coopImprintRating(imprint.ranks)} />
        <Metric label={tr('imprint.unspent')} value={imprint.unspentPoints} accent />
        <Metric label={tr('imprint.bestDepth')} value={imprint.highestDepth} />
      </div>
    </div>
    <div className={`mt-3 border px-3 py-2 text-[9px] font-black uppercase tracking-[.14em] ${locked ? 'border-white/10 bg-white/[.025] text-white/35' : imprint.unspentPoints > 0 ? 'border-amber-300/30 bg-amber-400/[.07] text-amber-100' : 'border-cyan-300/15 bg-cyan-400/[.035] text-cyan-100/55'}`}>
      {locked
        ? tr('imprint.allocationLocked')
        : imprint.unspentPoints > 0
          ? <>{tr('imprint.chooseSpecialization')} · {tr('imprint.calibrationAvailable', { count: imprint.unspentPoints })}</>
          : tr('imprint.noCalibration')}
    </div>
    <div className="mt-3 grid gap-1.5 sm:grid-cols-5">
      {COOP_IMPRINT_STATS.map(stat => {
        const rank = imprint.ranks[stat.id];
        const cost = coopImprintRankCost(rank);
        const maxed = rank >= stat.maxRank;
        const disabled = locked || !onUpgrade || maxed || imprint.unspentPoints < cost;
        return <button
          key={stat.id}
          type="button"
          disabled={disabled}
          onClick={() => onUpgrade?.(stat.id)}
          aria-label={`${tr(coopImprintStatNameKey(stat.id))} ${rank}/${stat.maxRank}`}
          className="flex min-h-32 flex-col border border-white/10 bg-black/20 px-2 py-2 text-left transition enabled:hover:border-cyan-200/60 enabled:hover:bg-cyan-300/10 enabled:focus-visible:border-cyan-100 enabled:focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-55"
        >
          <span className="flex w-full items-start justify-between gap-1"><b className="text-[8px] font-black uppercase tracking-wider text-white/60">{tr(coopImprintStatNameKey(stat.id))}</b><span className="font-mono text-[10px] text-cyan-100">{rank}/{stat.maxRank}</span></span>
          <span className="mt-2 text-[9px] leading-relaxed text-white/40">{tr(coopImprintStatDescriptionKey(stat.id))}</span>
          <span className="mt-auto pt-2 font-mono text-[9px] font-black text-cyan-200">{tr(coopImprintStatEffectKey(stat.id))}</span>
          <span className={`mt-1 text-[8px] font-black uppercase tracking-wider ${maxed ? 'text-white/35' : imprint.unspentPoints >= cost ? 'text-amber-200' : 'text-rose-200/55'}`}>{maxed ? tr('imprint.max') : tr('imprint.rankCost', { cost })}</span>
        </button>;
      })}
    </div>
    <div className="mt-3 flex items-center gap-2 border-t border-rose-300/15 pt-3 text-[9px] font-black uppercase tracking-[.14em] text-rose-200/80">
      <AlertTriangle size={12} />{tr('imprint.wipeWarning')}
    </div>
  </section>;
}

function Metric({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return <div><div className="text-[8px] font-black uppercase tracking-wider text-white/35">{label}</div><div className={`mt-0.5 font-mono text-base ${accent ? 'text-amber-200' : 'text-white'}`}>{value}</div></div>;
}
