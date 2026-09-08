import { COOP_PASSIVE_BY_ID, passiveRankCost, type CoopPassiveModuleId } from './CoopPassiveModules';
import { COOP_FIREARM_BY_ID, type CoopWeaponRuntime } from '../combat/coopFirearms';

export type CoopShopItemId = 'selected_ammo' | 'full_ammo' | 'trauma_patch' | 'emergency_reboot' | 'armor_1' | 'armor_2' | 'gas_mask' | 'private_exfil' | CoopPassiveModuleId;

export type CoopStationState = 'locked' | 'available' | 'capturing' | 'active' | 'disabled';

export interface CoopBuyStationSnapshot {
  id: number;
  x: number;
  y: number;
  /** Interaction radius of the transformed Buy Station. */
  radius: number;
  /** Capture ring used before the terminal transforms into a Buy Station. */
  captureRadius: number;
  state: CoopStationState;
  captureProgressMs: number;
  captureRequiredMs: number;
  contested: boolean;
  occupants: number;
  /** Item identifiers are enough for clients; prices are a shared constant. */
  stock: CoopShopItemId[];
}

export interface CoopShopItemDefinition { id: CoopShopItemId; name: string; description: string; cost: number; }

export type CoopPurchaseErrorCode =
  | 'alive_required'
  | 'station_range'
  | 'not_stocked'
  | 'passive_max'
  | 'passive_slots'
  | 'credits'
  | 'selected_ammo_full'
  | 'loadout_ammo_full'
  | 'health_full'
  | 'reboot_owned'
  | 'armor_1_owned'
  | 'armor_1_required'
  | 'armor_2_owned'
  | 'mask_full'
  | 'exfil_locked'
  | 'exfil_called';

export interface CoopPurchaseError {
  code: CoopPurchaseErrorCode;
  amount?: number;
}

export type CoopPurchaseResultCode = 'purchased' | CoopPurchaseErrorCode;

export interface CoopPurchaseResult {
  playerId: string;
  itemId: CoopShopItemId;
  code: CoopPurchaseResultCode;
  amount?: number;
}

export const COOP_OPERATOR_REDEPLOY_COST = 900;
export type CoopRedeployErrorCode = 'alive_required' | 'station_range' | 'redeploy_self' | 'target_not_eliminated' | 'credits';
export type CoopRedeployResultCode = 'redeployed' | CoopRedeployErrorCode;

export interface CoopRedeployResult {
  buyerId: string;
  targetPlayerId: string;
  code: CoopRedeployResultCode;
  amount?: number;
}

/** The client mirrors authoritative validation only to explain disabled rows.
 * The host remains the source of truth and repeats every check on purchase. */
export interface CoopShopBuyerState {
  coins: number;
  health: number;
  maxHealth: number;
  selectedSlot: number;
  weaponStates: CoopWeaponRuntime[];
  selfRevives: number;
  armorTier: number;
  gasMaskHp: number;
  gasMaskMaxHp: number;
  passiveModules: Array<{ id: CoopPassiveModuleId; rank: number }>;
  privateExfilAvailable?: boolean;
  privateExfilCalled?: boolean;
}

export const COOP_SHOP_ITEMS: Readonly<Record<CoopShopItemId, CoopShopItemDefinition>> = Object.freeze({
  selected_ammo: { id: 'selected_ammo', name: 'Field Ammo', description: 'Refill 50% reserve ammo for the equipped firearm.', cost: 75 },
  full_ammo: { id: 'full_ammo', name: 'Full Loadout Refill', description: 'Fill reserve ammo for every firearm.', cost: 220 },
  trauma_patch: { id: 'trauma_patch', name: 'Trauma Patch', description: 'Restore 35% of maximum health.', cost: 90 },
  emergency_reboot: { id: 'emergency_reboot', name: 'Emergency Reboot', description: 'One personal six-second self-revive.', cost: 650 },
  armor_1: { id: 'armor_1', name: 'Armor Plating I', description: 'A 50 HP rechargeable protective shield.', cost: 350 },
  armor_2: { id: 'armor_2', name: 'Armor Plating II', description: 'Upgrade your shield to 100 HP.', cost: 700 },
  gas_mask: { id: 'gas_mask', name: 'Tactical Gas Mask', description: 'CBRN respirator. Takes 100% of toxic gas damage until destroyed.', cost: 350 },
  private_exfil: { id: 'private_exfil', name: 'Private Exfil', description: 'Call a one-use extraction reserved for your squad.', cost: 1_500 },
  orbit_drones: { id: 'orbit_drones', name: COOP_PASSIVE_BY_ID.orbit_drones.name, description: COOP_PASSIVE_BY_ID.orbit_drones.description, cost: COOP_PASSIVE_BY_ID.orbit_drones.purchaseCost },
  data_scythe: { id: 'data_scythe', name: COOP_PASSIVE_BY_ID.data_scythe.name, description: COOP_PASSIVE_BY_ID.data_scythe.description, cost: COOP_PASSIVE_BY_ID.data_scythe.purchaseCost },
  void_aura: { id: 'void_aura', name: COOP_PASSIVE_BY_ID.void_aura.name, description: COOP_PASSIVE_BY_ID.void_aura.description, cost: COOP_PASSIVE_BY_ID.void_aura.purchaseCost },
  frost_aura: { id: 'frost_aura', name: COOP_PASSIVE_BY_ID.frost_aura.name, description: COOP_PASSIVE_BY_ID.frost_aura.description, cost: COOP_PASSIVE_BY_ID.frost_aura.purchaseCost },
  neural_pulse: { id: 'neural_pulse', name: COOP_PASSIVE_BY_ID.neural_pulse.name, description: COOP_PASSIVE_BY_ID.neural_pulse.description, cost: COOP_PASSIVE_BY_ID.neural_pulse.purchaseCost },
});

export const COOP_BUY_STATION_STOCK: readonly CoopShopItemId[] = Object.freeze([
  'selected_ammo', 'full_ammo', 'trauma_patch', 'emergency_reboot', 'armor_1', 'armor_2', 'gas_mask', 'private_exfil',
  'orbit_drones', 'data_scythe', 'void_aura', 'frost_aura', 'neural_pulse',
]);

export function coopShopItemCost(player: CoopShopBuyerState, itemId: CoopShopItemId): number {
  const owned = itemId in COOP_PASSIVE_BY_ID
    ? player.passiveModules.find(module => module.id === itemId)
    : undefined;
  return owned ? passiveRankCost(itemId as CoopPassiveModuleId, owned.rank) : COOP_SHOP_ITEMS[itemId].cost;
}

export function coopShopDisabledReason(player: CoopShopBuyerState, itemId: CoopShopItemId): CoopPurchaseError | undefined {
  if (itemId in COOP_PASSIVE_BY_ID) {
    const passiveId = itemId as CoopPassiveModuleId;
    const owned = player.passiveModules.find(module => module.id === passiveId);
    if (owned?.rank === COOP_PASSIVE_BY_ID[passiveId].maxRank) return { code: 'passive_max' };
    if (!owned && player.passiveModules.length >= 2) return { code: 'passive_slots' };
  } else if (itemId === 'selected_ammo') {
    const selected = player.weaponStates[player.selectedSlot];
    if (selected && selected.reserveAmmo >= COOP_FIREARM_BY_ID[selected.weaponId].maxReserve) return { code: 'selected_ammo_full' };
  } else if (itemId === 'full_ammo') {
    if (player.weaponStates.every(weapon => weapon.reserveAmmo >= COOP_FIREARM_BY_ID[weapon.weaponId].maxReserve)) return { code: 'loadout_ammo_full' };
  } else if (itemId === 'trauma_patch' && player.health >= player.maxHealth) return { code: 'health_full' };
  else if (itemId === 'emergency_reboot' && player.selfRevives > 0) return { code: 'reboot_owned' };
  else if (itemId === 'armor_1' && player.armorTier >= 1) return { code: 'armor_1_owned' };
  else if (itemId === 'armor_2') {
    if (player.armorTier < 1) return { code: 'armor_1_required' };
    if (player.armorTier >= 2) return { code: 'armor_2_owned' };
  } else if (itemId === 'gas_mask' && player.gasMaskHp > 0 && player.gasMaskHp >= player.gasMaskMaxHp) return { code: 'mask_full' };
  else if (itemId === 'private_exfil' && !player.privateExfilAvailable) return { code: 'exfil_locked' };
  else if (itemId === 'private_exfil' && player.privateExfilCalled) return { code: 'exfil_called' };

  const cost = coopShopItemCost(player, itemId);
  return player.coins < cost ? { code: 'credits', amount: cost - player.coins } : undefined;
}
