import { AlertTriangle, Dna, Zap, Shield, Wind, Crosshair, Target } from 'lucide-react';
import { COOP_IMPRINT_STATS, coopImprintRankCost, coopImprintRating, type CoopImprintStatId, type CoopOperatorImprint } from '../game/multiplayer/CoopImprint';
import { coopImprintStatDescriptionKey, coopImprintStatEffectKey, coopImprintStatNameKey, coopText, type CoopLanguage, type CoopTextKey } from '../game/multiplayer/i18n';
import { soundManager } from '../game/SoundManager';

const STAT_ICONS: Record<CoopImprintStatId, typeof Zap> = {
  power: Zap,
  vitality: Shield,
  mobility: Wind,
  handling: Crosshair,
  reach: Target,
};

export function CoopImprintSummary({ imprint, language, locked = false, onUpgrade }: {
  imprint: CoopOperatorImprint;
  language: CoopLanguage;
  locked?: boolean;
  onUpgrade?: (statId: CoopImprintStatId) => void;
}) {
  const tr = (key: CoopTextKey, params?: Record<string, string | number>) => coopText(language, key, params);

  const handleUpgrade = (statId: CoopImprintStatId) => {
    soundManager.playUIClick();
    onUpgrade?.(statId);
  };

  return (
    <section aria-label={tr('imprint.label')} className="coop-imprint-panel">
      <div className="coop-imprint-panel__header">
        <div>
          <div className="coop-section-kicker">Neural archive // 02</div>
          <div className="coop-imprint-panel__label">
            <Dna size={16} />
            {tr('imprint.label')}
          </div>
          <div className="coop-imprint-panel__identity">
            {imprint.operatorId} <span>//</span> {tr('imprint.generation')} {String(imprint.generation).padStart(2, '0')}
          </div>
        </div>
        <div className="coop-imprint-panel__metrics">
          <Metric label={tr('imprint.rating')} value={coopImprintRating(imprint.ranks)} />
          <Metric label={tr('imprint.unspent')} value={imprint.unspentPoints} accent />
          <Metric label={tr('imprint.bestDepth')} value={imprint.highestDepth} />
        </div>
      </div>

      <div className={`coop-imprint-panel__notice ${locked ? 'is-locked' : imprint.unspentPoints > 0 ? 'is-ready' : ''}`}>
        {locked
          ? tr('imprint.allocationLocked')
          : imprint.unspentPoints > 0
            ? <>{tr('imprint.chooseSpecialization')} · {tr('imprint.calibrationAvailable', { count: imprint.unspentPoints })}</>
            : tr('imprint.noCalibration')}
      </div>

      <div className="coop-imprint-panel__stats">
        {COOP_IMPRINT_STATS.map(stat => {
          const rank = imprint.ranks[stat.id];
          const cost = coopImprintRankCost(rank);
          const maxed = rank >= stat.maxRank;
          const disabled = locked || !onUpgrade || maxed || imprint.unspentPoints < cost;
          const Icon = STAT_ICONS[stat.id] || Zap;

          return (
            <button
              key={stat.id}
              type="button"
              disabled={disabled}
              onClick={() => handleUpgrade(stat.id)}
              onMouseEnter={() => !disabled && soundManager.playUIHover()}
              aria-label={`${tr(coopImprintStatNameKey(stat.id))} ${rank}/${stat.maxRank}`}
              className="coop-imprint-stat"
            >
              <div className="coop-imprint-stat__top">
                <div className="flex items-center gap-1.5">
                  <Icon size={12} className="text-purple-300 opacity-80" />
                  <b className="coop-imprint-stat__name">{tr(coopImprintStatNameKey(stat.id))}</b>
                </div>
                <span className="coop-imprint-stat__rank-fraction">{rank}/{stat.maxRank}</span>
              </div>

              {/* Visual Segment Pips */}
              <div className="coop-imprint-stat__pips" aria-hidden="true">
                {Array.from({ length: stat.maxRank }, (_, pipIdx) => (
                  <span
                    key={pipIdx}
                    className={`coop-imprint-stat__pip ${pipIdx < rank ? 'is-active' : ''}`}
                  />
                ))}
              </div>

              <span className="coop-imprint-stat__desc">{tr(coopImprintStatDescriptionKey(stat.id))}</span>
              <span className="coop-imprint-stat__effect">{tr(coopImprintStatEffectKey(stat.id))}</span>

              <span className={`coop-imprint-stat__cost ${maxed ? 'text-white/35' : imprint.unspentPoints >= cost ? 'is-affordable' : 'is-unaffordable'}`}>
                {maxed ? tr('imprint.max') : tr('imprint.rankCost', { cost })}
              </span>
            </button>
          );
        })}
      </div>

      <div className="coop-imprint-panel__warning">
        <AlertTriangle size={12} />
        {tr('imprint.wipeWarning')}
      </div>
    </section>
  );
}

function Metric({ label, value, accent = false }: { label: string; value: number; accent?: boolean }) {
  return (
    <div className="coop-imprint-metric">
      <div className="coop-imprint-metric__label">{label}</div>
      <div className={`coop-imprint-metric__value ${accent ? 'is-accent' : ''}`}>{value}</div>
    </div>
  );
}
