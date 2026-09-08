import { Coins, ShoppingCart, UserPlus } from 'lucide-react';
import type { CoopPlayerSnapshot } from '../game/multiplayer/CoopSimulation';
import {
  COOP_SHOP_ITEMS,
  COOP_OPERATOR_REDEPLOY_COST,
  coopShopDisabledReason,
  coopShopItemCost,
  type CoopPurchaseError,
  type CoopShopItemId,
} from '../game/multiplayer/CoopBuyStation';
import { coopItemDescriptionKey, coopItemNameKey, type CoopTextKey } from '../game/multiplayer/i18n';

export type CoopShopCategoryId = 'health_armor' | 'ammunition' | 'equipment' | 'support' | 'reinforcements' | 'extraction';

export const COOP_SHOP_CATEGORIES: ReadonlyArray<{
  id: CoopShopCategoryId;
  key: '1' | '2' | '3' | '4' | '5' | '6';
  labelKey: CoopTextKey;
  itemIds: readonly CoopShopItemId[];
}> = [
  { id: 'health_armor', key: '1', labelKey: 'shop.category.healthArmor', itemIds: ['trauma_patch', 'armor_1', 'armor_2'] },
  { id: 'ammunition', key: '2', labelKey: 'shop.category.ammunition', itemIds: ['selected_ammo', 'full_ammo'] },
  { id: 'equipment', key: '3', labelKey: 'shop.category.equipment', itemIds: ['emergency_reboot', 'gas_mask'] },
  { id: 'support', key: '4', labelKey: 'shop.category.support', itemIds: ['orbit_drones', 'data_scythe', 'void_aura', 'frost_aura', 'neural_pulse'] },
  { id: 'reinforcements', key: '5', labelKey: 'shop.category.reinforcements', itemIds: [] },
  { id: 'extraction', key: '6', labelKey: 'shop.category.extraction', itemIds: ['private_exfil'] },
];

export function coopShopCategoryForKey(key: string) {
  return COOP_SHOP_CATEGORIES.find(category => category.key === key);
}

export function coopShopItemsForCategory(categoryId: CoopShopCategoryId, stock: readonly CoopShopItemId[]) {
  const category = COOP_SHOP_CATEGORIES.find(candidate => candidate.id === categoryId);
  return category?.itemIds.filter(itemId => stock.includes(itemId)) || [];
}

export type CoopShopKeyAction =
  | { type: 'close' }
  | { type: 'back' }
  | { type: 'category'; categoryId: CoopShopCategoryId }
  | { type: 'purchase'; itemId: CoopShopItemId }
  | { type: 'redeploy'; targetPlayerId: string }
  | { type: 'none' };

export function resolveCoopShopKey(categoryId: CoopShopCategoryId | null, key: string, stock: readonly CoopShopItemId[], redeployTargetIds: readonly string[] = []): CoopShopKeyAction {
  const normalized = key.toLowerCase();
  if (normalized === 'f') return { type: 'close' };
  if (normalized === 'escape' || normalized === 'backspace') return categoryId ? { type: 'back' } : { type: 'close' };
  if (!/^[0-9]$/.test(normalized)) return { type: 'none' };
  if (normalized === '0') return categoryId ? { type: 'back' } : { type: 'close' };
  if (!categoryId) {
    const category = coopShopCategoryForKey(normalized);
    return category ? { type: 'category', categoryId: category.id } : { type: 'none' };
  }
  if (categoryId === 'reinforcements') {
    const targetPlayerId = redeployTargetIds[Number(normalized) - 1];
    return targetPlayerId ? { type: 'redeploy', targetPlayerId } : { type: 'none' };
  }
  const itemId = coopShopItemsForCategory(categoryId, stock)[Number(normalized) - 1];
  return itemId ? { type: 'purchase', itemId } : { type: 'none' };
}

interface CoopShopMenuProps {
  categoryId: CoopShopCategoryId | null;
  player: CoopPlayerSnapshot;
  players: readonly CoopPlayerSnapshot[];
  stock: readonly CoopShopItemId[];
  message: string | null;
  tr: (key: CoopTextKey, params?: Record<string, string | number>) => string;
  onCategory: (categoryId: CoopShopCategoryId) => void;
  onPurchase: (itemId: CoopShopItemId) => void;
  onRedeploy: (targetPlayerId: string) => void;
  onUnavailable: (issue: CoopPurchaseError) => void;
  onBack: () => void;
  onClose: () => void;
}

function KeyBadge({ children }: { children: string }) {
  return <kbd className="inline-flex h-7 min-w-7 shrink-0 items-center justify-center border border-cyan-100/55 bg-black/45 px-1.5 font-mono text-[11px] font-black text-cyan-50 shadow-[inset_0_0_10px_rgba(34,211,238,.12)]">{children}</kbd>;
}

export function CoopShopMenu({ categoryId, player, players, stock, message, tr, onCategory, onPurchase, onRedeploy, onUnavailable, onBack, onClose }: CoopShopMenuProps) {
  const category = categoryId ? COOP_SHOP_CATEGORIES.find(candidate => candidate.id === categoryId) : undefined;
  const items = category ? coopShopItemsForCategory(category.id, stock) : [];
  const redeployTargets = players.filter(candidate => candidate.id !== player.id && candidate.lifeState === 'eliminated');

  return <div
    role="dialog"
    aria-modal="true"
    aria-label={tr('minimap.station')}
    onMouseDown={event => event.stopPropagation()}
    onPointerDown={event => event.stopPropagation()}
    onWheel={event => { event.preventDefault(); event.stopPropagation(); }}
    className="absolute left-1/2 top-1/2 z-[90] flex h-[min(680px,calc(100vh-2rem))] w-[min(700px,calc(100vw-2rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden border border-cyan-200/55 bg-[#07111b]/98 p-5 shadow-[0_0_70px_rgba(34,211,238,.24)] backdrop-blur-xl"
  >
    <div className="flex shrink-0 items-start justify-between gap-4 border-b border-cyan-200/20 pb-3">
      <div>
        <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.2em] text-cyan-200"><ShoppingCart size={16} /> {tr('shop.title')}</div>
        <div className="mt-1 text-[10px] font-mono uppercase tracking-wider text-white/45">{category ? tr(category.labelKey) : tr('shop.chooseCategory')}</div>
      </div>
      <div className="ml-auto shrink-0 text-right"><div className="text-[9px] font-black uppercase tracking-wider text-white/45">{tr('shop.credits')}</div><div className="mt-0.5 font-mono text-sm text-amber-200"><Coins className="mr-1 inline" size={13} />{player.coins}</div></div>
      <button autoFocus onClick={onClose} className="flex items-center gap-2 border border-cyan-300/40 bg-cyan-400/10 px-3 py-1.5 text-[10px] font-black uppercase text-cyan-100 transition hover:bg-cyan-400/20"><KeyBadge>F</KeyBadge>{tr('shop.closeLabel')}</button>
    </div>

    {!category && <div className="mt-5 grid min-h-0 flex-1 content-start gap-3 sm:grid-cols-2">
      {COOP_SHOP_CATEGORIES.map(option => <button key={option.id} onClick={() => onCategory(option.id)} className="flex min-h-20 items-center gap-4 border border-white/10 bg-white/[0.035] px-4 py-4 text-left transition hover:border-cyan-200/60 hover:bg-cyan-300/10 focus-visible:border-cyan-100 focus-visible:outline-none">
        <KeyBadge>{option.key}</KeyBadge><span className="text-sm font-black uppercase tracking-wide text-white">{tr(option.labelKey)}</span>
      </button>)}
      <button onClick={onClose} className="flex min-h-16 items-center gap-4 border border-white/10 bg-white/[0.02] px-4 py-3 text-left transition hover:border-cyan-200/60 hover:bg-cyan-300/10 focus-visible:border-cyan-100 focus-visible:outline-none sm:col-span-2">
        <KeyBadge>0</KeyBadge><span className="text-xs font-black uppercase tracking-wide text-white/75">{tr('shop.closeLabel')}</span>
      </button>
    </div>}

    {category && <div className="mt-4 min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain pr-2">
      {category.id === 'reinforcements' && redeployTargets.length === 0 && <div className="border border-emerald-300/20 bg-emerald-400/5 px-4 py-8 text-center text-xs uppercase tracking-wider text-emerald-100/65">{tr('shop.redeploy.none')}</div>}
      {category.id === 'reinforcements' && redeployTargets.map((target, index) => {
        const issue: CoopPurchaseError | undefined = player.coins < COOP_OPERATOR_REDEPLOY_COST
          ? { code: 'credits', amount: COOP_OPERATOR_REDEPLOY_COST - player.coins }
          : undefined;
        return <button
          key={target.id}
          aria-disabled={Boolean(issue)}
          onClick={() => issue ? onUnavailable(issue) : onRedeploy(target.id)}
          className={`flex w-full items-center gap-3 border px-4 py-3 text-left transition focus-visible:outline-none ${issue ? 'border-rose-300/20 bg-rose-950/15 hover:border-rose-300/40' : 'border-white/10 bg-white/[0.035] hover:border-emerald-200/50 hover:bg-emerald-300/10 focus-visible:border-emerald-100'}`}
        >
          <KeyBadge>{String(index + 1)}</KeyBadge>
          <UserPlus size={20} className="shrink-0 text-emerald-300" />
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-white">{tr('shop.redeploy.name', { name: target.label })}</span>
            <span className="mt-1 block text-[10px] leading-relaxed text-white/45">{tr('shop.redeploy.description')}</span>
            {issue && <span className="mt-1.5 block text-[10px] font-black uppercase tracking-wide text-rose-200">{tr(`purchase.${issue.code}` as CoopTextKey, { amount: issue.amount || 0 })}</span>}
          </span>
          <span className={`shrink-0 text-xs font-mono ${issue ? 'text-rose-300' : 'text-amber-200'}`}><Coins className="mr-1 inline" size={12} />{COOP_OPERATOR_REDEPLOY_COST}</span>
        </button>;
      })}
      {items.map((itemId, index) => {
        const item = COOP_SHOP_ITEMS[itemId];
        const issue = coopShopDisabledReason(player, itemId);
        const cost = coopShopItemCost(player, itemId);
        return <button
          key={itemId}
          aria-disabled={Boolean(issue)}
          onClick={() => issue ? onUnavailable(issue) : onPurchase(itemId)}
          className={`flex w-full items-center gap-3 border px-4 py-3 text-left transition focus-visible:outline-none ${issue ? 'border-rose-300/20 bg-rose-950/15 hover:border-rose-300/40' : 'border-white/10 bg-white/[0.035] hover:border-cyan-200/50 hover:bg-cyan-300/10 focus-visible:border-cyan-100'}`}
        >
          <KeyBadge>{String(index + 1)}</KeyBadge>
          <span className="min-w-0 flex-1">
            <span className="block text-xs font-bold text-white">{tr(coopItemNameKey(itemId))}</span>
            <span className="mt-1 block text-[10px] leading-relaxed text-white/45">{tr(coopItemDescriptionKey(itemId))}</span>
            {issue && <span className="mt-1.5 block text-[10px] font-black uppercase tracking-wide text-rose-200">{tr(`purchase.${issue.code}` as CoopTextKey, { amount: issue.amount || 0 })}</span>}
          </span>
          <span className={`shrink-0 text-xs font-mono ${issue?.code === 'credits' ? 'text-rose-300' : 'text-amber-200'}`}><Coins className="mr-1 inline" size={12} />{cost}</span>
        </button>;
      })}
      <button onClick={onBack} className="flex w-full items-center gap-3 border border-white/10 bg-white/[0.02] px-4 py-3 text-left transition hover:border-cyan-200/50 hover:bg-cyan-300/10 focus-visible:border-cyan-100 focus-visible:outline-none">
        <KeyBadge>0</KeyBadge><span className="text-xs font-black uppercase tracking-wide text-white/75">{tr('shop.back')}</span>
      </button>
    </div>}

    {message && <div aria-live="polite" className="mt-3 shrink-0 border border-cyan-200/20 bg-cyan-400/10 px-3 py-2 text-[10px] text-cyan-100">{message}</div>}
    <div className="mt-3 shrink-0 text-center text-[10px] text-white/40">{tr(category ? 'shop.submenuHelp' : 'shop.rootHelp')}</div>
  </div>;
}
