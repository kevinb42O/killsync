import { useState, type CSSProperties, type MouseEvent } from 'react';
import { Check, Crown, Crosshair, Zap } from 'lucide-react';
import { COOP_SKINS, type CoopSkinId } from '../game/multiplayer/CoopSkins';
import { COOP_OPERATOR_BY_ID } from '../game/multiplayer/CoopOperators';
import { COOP_FIREARM_BY_ID } from '../game/combat/coopFirearms';
import { coopOperatorClassKey, coopOperatorRoleKey, coopText, coopWeaponNameKey, type CoopLanguage } from '../game/multiplayer/i18n';
import { soundManager } from '../game/SoundManager';

type SkinTooltip = { skinId: CoopSkinId; x: number; y: number };

export function CoopSkinSelector({ value, language, disabled = false, onChange }: {
  value: CoopSkinId;
  language: CoopLanguage;
  disabled?: boolean;
  onChange: (skinId: CoopSkinId) => void;
}) {
  const tr = (key: Parameters<typeof coopText>[1]) => coopText(language, key);
  const [tooltip, setTooltip] = useState<SkinTooltip | null>(null);

  const positionTooltip = (skinId: CoopSkinId, pointer: { clientX: number; clientY: number }) => {
    const gutter = 16;
    const tooltipWidth = 280;
    const tooltipHeight = 112;
    setTooltip({
      skinId,
      x: Math.max(gutter, Math.min(pointer.clientX + gutter, window.innerWidth - tooltipWidth - gutter)),
      y: Math.max(gutter, Math.min(pointer.clientY + gutter, window.innerHeight - tooltipHeight - gutter)),
    });
  };

  const showKeyboardTooltip = (skinId: CoopSkinId, target: HTMLButtonElement) => {
    const bounds = target.getBoundingClientRect();
    positionTooltip(skinId, { clientX: bounds.right, clientY: bounds.top + bounds.height / 2 });
  };

  const handleSelect = (skinId: CoopSkinId) => {
    soundManager.playUIClick();
    onChange(skinId);
  };

  const handleHover = (skinId: CoopSkinId, event: MouseEvent<HTMLButtonElement>) => {
    soundManager.playUIHover();
    positionTooltip(skinId, event);
  };

  const tooltipOperator = tooltip ? COOP_OPERATOR_BY_ID[tooltip.skinId] : null;

  return (
    <section aria-labelledby="coop-skin-heading" className="coop-class-deck">
      <div className="coop-class-deck__header">
        <div>
          <div className="coop-section-kicker">Loadout // 01</div>
          <h3 id="coop-skin-heading" className="coop-class-deck__title">{tr('skin.heading')}</h3>
          <p className="coop-class-deck__help">{tr('skin.help')}</p>
        </div>
        <span className="coop-class-deck__availability"><i />{tr('skin.allUnlocked')}</span>
      </div>

      <div className="coop-class-deck__grid">
        {COOP_SKINS.map((skin, idx) => {
          const selected = skin.id === value;
          const operator = COOP_OPERATOR_BY_ID[skin.id];
          const signature = COOP_FIREARM_BY_ID[operator.signatureWeaponId];

          return (
            <button
              key={skin.id}
              type="button"
              aria-pressed={selected}
              aria-describedby={tooltip?.skinId === skin.id ? 'coop-skin-tooltip' : undefined}
              disabled={disabled}
              onClick={() => handleSelect(skin.id)}
              onMouseEnter={event => handleHover(skin.id, event)}
              onMouseMove={event => positionTooltip(skin.id, event)}
              onMouseLeave={() => setTooltip(null)}
              onFocus={event => { soundManager.playUIHover(); showKeyboardTooltip(skin.id, event.currentTarget); }}
              onBlur={() => setTooltip(null)}
              className={`coop-class-card ${selected ? 'is-selected' : ''} ${skin.tier === 'premium' ? 'is-premium' : ''}`}
              style={{
                '--skin-armor': skin.palette.armor,
                '--skin-glow': skin.palette.glow,
                '--skin-suit': skin.palette.undersuit,
                '--skin-trim': skin.palette.trim,
                '--operator-color': operator.color,
              } as CSSProperties}
            >
              {/* Top Meta Line */}
              <div className="coop-class-card__topline">
                <span className="coop-class-card__class-tag">Class // {String(idx + 1).padStart(2, '0')}</span>
                {skin.tier === 'premium' && (
                  <span className="coop-class-card__elite">
                    <Crown size={9} /> {tr('skin.premium')}
                  </span>
                )}
              </div>

              {/* Equipped Status Badge */}
              {selected && (
                <div className="coop-class-card__selected">
                  <Check size={12} strokeWidth={3.5} /> Equipped
                </div>
              )}

              {/* Holographic Projection Chamber */}
              <div className="coop-class-card__hologram">
                <div className="coop-class-card__hologram-halo" aria-hidden="true" />
                <div className={`coop-skin-preview ${skin.tier === 'premium' ? 'coop-skin-preview--premium' : ''}`} aria-hidden="true">
                  <img className="coop-skin-preview__portrait" src={skin.portraitSrc} alt="" />
                  <div className="coop-skin-preview__scanlines" />
                  <div className="coop-skin-preview__tint" />
                </div>
                <div className="coop-class-card__hologram-base" aria-hidden="true" />
              </div>

              {/* Operative Details */}
              <div className="coop-class-card__details">
                <div className="coop-class-card__name-row">
                  <span className="coop-class-card__name">{tr(coopOperatorClassKey(operator.id))}</span>
                  <span className="coop-class-card__chassis">{skin.name}</span>
                </div>

                <div className="coop-class-card__role">{tr(coopOperatorRoleKey(operator.id))}</div>

                {/* Signature Weapon Loadout Chip */}
                <div className="coop-class-card__weapon-chip">
                  <Crosshair size={11} className="coop-class-card__weapon-icon" />
                  <span className="coop-class-card__weapon-name">{tr(coopWeaponNameKey(signature.id))}</span>
                  <span className="coop-class-card__weapon-type">{signature.shortName}</span>
                </div>

                {/* Passive Protocol Pill */}
                <div className="coop-class-card__passive-chip">
                  <Zap size={10} className="text-amber-300" />
                  <span className="coop-class-card__passive-name">{operator.passiveName}</span>
                  <span className="coop-class-card__resource-tag">{operator.resourceLabel}</span>
                </div>
              </div>

              {/* Armor & Glow Telemetry Swatches */}
              <div className="coop-class-card__swatches" aria-hidden="true">
                {[skin.palette.undersuit, skin.palette.armor, skin.palette.trim, skin.palette.glow].map(color => (
                  <span key={color} style={{ background: color }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Floating Tactical Telemetry Tooltip */}
      {tooltip && tooltipOperator && (
        <div
          id="coop-skin-tooltip"
          role="tooltip"
          className="coop-skin-tooltip"
          style={{ left: tooltip.x, top: tooltip.y, '--tooltip-accent': tooltipOperator.color } as CSSProperties}
        >
          <div className="coop-skin-tooltip__eyebrow">
            Tactical Protocol // {tooltipOperator.className}
          </div>
          <div className="coop-skin-tooltip__title">{tooltipOperator.passiveName}</div>
          <p>{tooltipOperator.passiveDescription}</p>
          <div className="coop-skin-tooltip__spender">
            <b>{tooltipOperator.spenderName}:</b> {tooltipOperator.spenderDescription}
          </div>
        </div>
      )}
    </section>
  );
}

export function CoopSkinBadge({ skinId }: { skinId?: CoopSkinId }) {
  const skin = COOP_SKINS.find(candidate => candidate.id === skinId) || COOP_SKINS[0];
  return (
    <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider" style={{ color: skin.palette.glow }}>
      <i className="h-1.5 w-1.5 rounded-full" style={{ background: skin.palette.armor, boxShadow: `0 0 7px ${skin.palette.glow}` }} />
      {skin.name}
    </span>
  );
}
