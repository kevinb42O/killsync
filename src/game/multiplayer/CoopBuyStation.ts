import { COOP_PASSIVE_BY_ID, type CoopPassiveModuleId } from './CoopPassiveModules';

export type CoopShopItemId = 'selected_ammo' | 'full_ammo' | 'trauma_patch' | 'emergency_reboot' | 'armor_1' | 'armor_2' | CoopPassiveModuleId;

export interface CoopBuyStationSnapshot {
  id: number;
  x: number;
  y: number;
  radius: number;
  active: boolean;
  /** Item identifiers are enough for clients; prices are a shared constant. */
  stock: CoopShopItemId[];
}

export interface CoopShopItemDefinition { id: CoopShopItemId; name: string; description: string; cost: number; }

export const COOP_SHOP_ITEMS: Readonly<Record<CoopShopItemId, CoopShopItemDefinition>> = Object.freeze({
  selected_ammo: { id: 'selected_ammo', name: 'Field Ammo', description: 'Refill 50% reserve ammo for the equipped firearm.', cost: 75 },
  full_ammo: { id: 'full_ammo', name: 'Full Loadout Refill', description: 'Fill reserve ammo for every firearm.', cost: 220 },
  trauma_patch: { id: 'trauma_patch', name: 'Trauma Patch', description: 'Restore 35% of maximum health.', cost: 90 },
  emergency_reboot: { id: 'emergency_reboot', name: 'Emergency Reboot', description: 'One personal six-second self-revive.', cost: 650 },
  armor_1: { id: 'armor_1', name: 'Armor Plating I', description: 'A 50 HP rechargeable protective shield.', cost: 350 },
  armor_2: { id: 'armor_2', name: 'Armor Plating II', description: 'Upgrade your shield to 100 HP.', cost: 700 },
  orbit_drones: { id: 'orbit_drones', name: COOP_PASSIVE_BY_ID.orbit_drones.name, description: COOP_PASSIVE_BY_ID.orbit_drones.description, cost: COOP_PASSIVE_BY_ID.orbit_drones.purchaseCost },
  data_scythe: { id: 'data_scythe', name: COOP_PASSIVE_BY_ID.data_scythe.name, description: COOP_PASSIVE_BY_ID.data_scythe.description, cost: COOP_PASSIVE_BY_ID.data_scythe.purchaseCost },
  void_aura: { id: 'void_aura', name: COOP_PASSIVE_BY_ID.void_aura.name, description: COOP_PASSIVE_BY_ID.void_aura.description, cost: COOP_PASSIVE_BY_ID.void_aura.purchaseCost },
  frost_aura: { id: 'frost_aura', name: COOP_PASSIVE_BY_ID.frost_aura.name, description: COOP_PASSIVE_BY_ID.frost_aura.description, cost: COOP_PASSIVE_BY_ID.frost_aura.purchaseCost },
  neural_pulse: { id: 'neural_pulse', name: COOP_PASSIVE_BY_ID.neural_pulse.name, description: COOP_PASSIVE_BY_ID.neural_pulse.description, cost: COOP_PASSIVE_BY_ID.neural_pulse.purchaseCost },
});

export const COOP_BUY_STATION_STOCK: readonly CoopShopItemId[] = Object.freeze([
  'selected_ammo', 'full_ammo', 'trauma_patch', 'emergency_reboot', 'armor_1', 'armor_2',
  'orbit_drones', 'data_scythe', 'void_aura', 'frost_aura', 'neural_pulse',
]);
