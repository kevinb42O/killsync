import { describe, expect, it } from 'vitest';
import { createCoopWeaponRuntime } from '../combat/coopFirearms';
import { coopShopDisabledReason, coopShopItemCost, type CoopShopBuyerState } from './CoopBuyStation';

function buyer(overrides: Partial<CoopShopBuyerState> = {}): CoopShopBuyerState {
  return {
    coins: 10_000,
    health: 50,
    maxHealth: 100,
    selectedSlot: 0,
    weaponStates: [createCoopWeaponRuntime('plasma_gun'), createCoopWeaponRuntime('assault_rifle')],
    selfRevives: 0,
    armorTier: 0,
    gasMaskHp: 0,
    gasMaskMaxHp: 150,
    passiveModules: [],
    ...overrides,
  };
}

describe('co-op shop row availability', () => {
  it('shows specific ownership and prerequisite reasons before affordability', () => {
    expect(coopShopDisabledReason(buyer({ coins: 0, health: 100 }), 'trauma_patch')).toEqual({ code: 'health_full' });
    expect(coopShopDisabledReason(buyer({ coins: 0 }), 'armor_2')).toEqual({ code: 'armor_1_required' });
    expect(coopShopDisabledReason(buyer({ coins: 0, armorTier: 2 }), 'armor_2')).toEqual({ code: 'armor_2_owned' });
  });

  it('explains full ammunition and filter states', () => {
    const fullWeapons = buyer().weaponStates.map(weapon => ({ ...weapon, reserveAmmo: 9999 }));
    expect(coopShopDisabledReason(buyer({ weaponStates: fullWeapons }), 'selected_ammo')).toEqual({ code: 'selected_ammo_full' });
    expect(coopShopDisabledReason(buyer({ weaponStates: fullWeapons }), 'full_ammo')).toEqual({ code: 'loadout_ammo_full' });
    expect(coopShopDisabledReason(buyer({ gasMaskHp: 150 }), 'gas_mask')).toEqual({ code: 'mask_full' });
  });

  it('reports module rank, slot, and credit constraints with the current rank price', () => {
    expect(coopShopDisabledReason(buyer({ passiveModules: [{ id: 'orbit_drones', rank: 3 }] }), 'orbit_drones')).toEqual({ code: 'passive_max' });
    expect(coopShopDisabledReason(buyer({ passiveModules: [{ id: 'orbit_drones', rank: 1 }, { id: 'void_aura', rank: 1 }] }), 'neural_pulse')).toEqual({ code: 'passive_slots' });
    const ranked = buyer({ coins: 0, passiveModules: [{ id: 'orbit_drones', rank: 1 }] });
    expect(coopShopDisabledReason(ranked, 'orbit_drones')).toEqual({ code: 'credits', amount: coopShopItemCost(ranked, 'orbit_drones') });
  });
});
