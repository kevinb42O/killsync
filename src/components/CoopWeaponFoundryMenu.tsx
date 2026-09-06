import { Coins, Hammer, X } from 'lucide-react';
import { COOP_FIREARM_BY_ID, COOP_WEAPON_SLOTS, type CoopFirearmId } from '../game/combat/coopFirearms';
import { coopFoundryUpgradeCost, COOP_FOUNDRY_MAX_WEAPON_LEVEL } from '../game/multiplayer/CoopWeaponFoundry';
import type { CoopPlayerSnapshot } from '../game/multiplayer/CoopSimulation';
import { coopAmmoTypeKey, coopWeaponNameKey, type CoopTextKey } from '../game/multiplayer/i18n';

export function CoopWeaponFoundryMenu({ player, message, tr, onForge, onClose }: {
  player: CoopPlayerSnapshot;
  message: string | null;
  tr: (key: CoopTextKey, params?: Record<string, string | number>) => string;
  onForge: (weaponId: CoopFirearmId) => void;
  onClose: () => void;
}) {
  return <div className="absolute inset-0 z-[90] flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm" onMouseDown={event => event.stopPropagation()}>
    <section role="dialog" aria-modal="true" aria-label={tr('foundry.title')} className="w-[min(760px,calc(100vw-2rem))] border border-amber-300/45 bg-[#160f08]/95 p-5 shadow-[0_0_48px_rgba(245,158,11,.22)]">
      <header className="flex items-start justify-between gap-4 border-b border-amber-200/20 pb-4">
        <div><div className="flex items-center gap-2 text-sm font-black uppercase tracking-[.22em] text-amber-200"><Hammer size={18} />{tr('foundry.title')}</div><p className="mt-1 text-[10px] uppercase tracking-wider text-amber-100/55">{tr('foundry.subtitle')}</p></div>
        <div className="flex items-center gap-4"><span className="font-mono text-amber-200"><Coins className="mr-1 inline" size={14} />{player.coins}</span><button autoFocus onClick={onClose} aria-label={tr('foundry.close')} className="border border-amber-200/30 p-1.5 text-amber-100 hover:bg-amber-300/10"><X size={16} /></button></div>
      </header>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        {COOP_WEAPON_SLOTS.map(weaponId => {
          const runtime = player.weaponStates.find(weapon => weapon.weaponId === weaponId)!;
          const maxed = runtime.level >= COOP_FOUNDRY_MAX_WEAPON_LEVEL;
          const cost = maxed ? 0 : coopFoundryUpgradeCost(runtime.level);
          const disabled = maxed || player.coins < cost;
          return <button key={weaponId} disabled={disabled} onClick={() => onForge(weaponId)} className="flex items-center justify-between border border-amber-300/25 bg-amber-400/[.06] px-4 py-3 text-left transition enabled:hover:border-amber-200/60 enabled:hover:bg-amber-400/[.13] disabled:opacity-45">
            <span><b className="block text-xs uppercase tracking-wider text-white">{tr(coopWeaponNameKey(weaponId))}</b><small className="font-mono text-amber-100/60">{tr('hud.weaponLevel', { level: runtime.level })} · {tr(coopAmmoTypeKey(COOP_FIREARM_BY_ID[weaponId].ammoType))}</small></span>
            <span className="text-right text-[10px] font-black uppercase text-amber-200">{maxed ? tr('foundry.maxLevel') : <>{tr('foundry.nextLevel', { level: runtime.level + 1 })}<small className="mt-1 block font-mono text-white/65">{tr('unit.credits', { value: cost })}</small></>}</span>
          </button>;
        })}
      </div>
      <footer className="mt-4 flex items-center justify-between gap-3 border-t border-amber-200/15 pt-3 text-[10px]"><span className="text-amber-100/45">{tr('foundry.provisional')}</span><span className="font-mono text-amber-100">{message}</span></footer>
    </section>
  </div>;
}
