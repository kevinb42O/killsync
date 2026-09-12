import type { CSSProperties } from 'react';
import { Lock, Compass, ShieldAlert, Sparkles } from 'lucide-react';
import { getWorldDefinition, WORLD_IDS, type WorldId } from '../game/world/WorldDefinitions';
import { soundManager } from '../game/SoundManager';

export function CoopWorldSelector({
  unlockedWorldIds,
  selectedWorldId,
  onChange,
  disabled = false,
  description = 'Choose any world you have discovered.',
}: {
  unlockedWorldIds: readonly WorldId[];
  selectedWorldId: WorldId;
  onChange: (worldId: WorldId) => void;
  disabled?: boolean;
  description?: string;
}) {
  const handleSelect = (worldId: WorldId) => {
    soundManager.playUIClick();
    onChange(worldId);
  };

  return (
    <section className="coop-world-selector" aria-labelledby="coop-world-heading">
      <div className="coop-world-selector__header">
        <div>
          <div className="coop-section-kicker">Level Selection // Sector Route</div>
          <h3 id="coop-world-heading" className="coop-world-selector__title">
            Deployment world <span className="coop-world-selector__level-tag">// LEVEL SELECT</span>
          </h3>
          <div className="coop-world-selector__description">{description}</div>
        </div>
        <div className="coop-world-selector__linked">
          <b>{unlockedWorldIds.length}/{WORLD_IDS.length}</b> Linked
        </div>
      </div>

      <div className="coop-world-selector__grid">
        {WORLD_IDS.map(worldId => {
          const world = getWorldDefinition(worldId);
          const unlocked = unlockedWorldIds.includes(worldId);
          const selected = selectedWorldId === worldId;

          return (
            <button
              key={worldId}
              type="button"
              disabled={disabled || !unlocked}
              aria-label={`${unlocked ? 'Select' : 'Locked'} World ${world.tier}: ${world.name}`}
              aria-pressed={selected}
              onClick={() => handleSelect(worldId)}
              onMouseEnter={() => unlocked && !disabled && soundManager.playUIHover()}
              style={{ '--world-accent': `#${world.theme.accentColor.toString(16).padStart(6, '0')}` } as CSSProperties}
              className={`coop-world-card ${selected ? 'is-selected' : ''} ${!unlocked ? 'is-locked' : ''}`}
            >
              <div className="coop-world-card__topline">
                <span className="flex items-center gap-1.5 font-mono">
                  {!unlocked && <Lock size={10} className="text-white/40" />}
                  Level {world.tier}
                </span>
                <span className={selected ? 'text-cyan-200 font-black' : undefined}>
                  {selected ? 'SELECTED' : unlocked ? 'AVAILABLE' : 'LOCKED'}
                </span>
              </div>

              <div className="coop-world-card__name">{world.name}</div>
              <div className="coop-world-card__subtitle">{world.subtitle}</div>

              <div className="coop-world-card__stats">
                <span>THREAT ×{world.difficulty.threatMultiplier.toFixed(2)}</span>
                <span className="coop-world-card__stats-divider">·</span>
                <span>LOOT ×{world.difficulty.rewardMultiplier.toFixed(2)}</span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
}
