import { getWorldDefinition, WORLD_IDS, type WorldId } from '../game/world/WorldDefinitions';

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
  return (
    <div>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <div className="text-xs font-black uppercase tracking-[0.18em] text-white">Deployment world</div>
          <div className="mt-1 text-[10px] uppercase tracking-wider text-white/45">{description}</div>
        </div>
        <div className="shrink-0 font-mono text-[9px] font-black text-cyan-300">
          {unlockedWorldIds.length}/{WORLD_IDS.length} LINKED
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
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
              onClick={() => onChange(worldId)}
              style={{ borderColor: selected ? `#${world.theme.accentColor.toString(16).padStart(6, '0')}` : undefined }}
              className={`min-h-28 border bg-black/35 p-3 text-left transition ${selected ? 'bg-cyan-500/[.07] shadow-[0_0_22px_rgba(34,211,238,.18)]' : 'border-white/10 hover:border-white/30'} disabled:cursor-not-allowed disabled:opacity-35`}
            >
              <div className="flex items-center justify-between text-[9px] font-black uppercase tracking-widest text-white/45">
                <span>World {world.tier}</span>
                <span className={selected ? 'text-cyan-200' : undefined}>
                  {selected ? 'SELECTED' : unlocked ? 'AVAILABLE' : 'LOCKED'}
                </span>
              </div>
              <div className="mt-2 text-[11px] font-black tracking-[.12em] text-white">{world.name}</div>
              <div className="mt-1 text-[9px] font-bold uppercase tracking-wider text-white/50">{world.subtitle}</div>
              <div className="mt-2 font-mono text-[8px] text-white/35">
                THREAT ×{world.difficulty.threatMultiplier.toFixed(2)} · LOOT ×{world.difficulty.rewardMultiplier.toFixed(2)}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
