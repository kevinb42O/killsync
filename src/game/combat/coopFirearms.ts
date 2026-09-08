/**
 * Authoritative co-op firearm rules. This module deliberately has no renderer
 * or transport dependencies, so balance can be tested without a browser.
 */
export type CoopFirearmId = 'plasma_gun' | 'assault_rifle' | 'combat_shotgun' | 'arc_launcher' | 'smg'
  | 'goreline_repeater' | 'riftspike_array' | 'dawnwall_cannon' | 'winterglass_projector' | 'cinderhex_engine';
export type AmmoType = 'pistol' | 'rifle' | 'shell' | 'prototype_cell' | 'smg';
export type FireMode = 'semi' | 'auto';
export type ReloadStyle = 'magazine' | 'shell_by_shell';

export interface CoopFirearmDefinition {
  id: CoopFirearmId;
  name: string;
  shortName: string;
  slot: 0 | 1 | 2 | 3 | 4;
  ammoType: AmmoType;
  fireMode: FireMode;
  magazineSize: number;
  startingReserve: number;
  maxReserve: number;
  baseDamage: number;
  fireIntervalMs: number;
  reloadStyle: ReloadStyle;
  reloadDurationMs?: number;
  shellInsertMs?: number;
  projectileVelocity: number;
  projectileRadius: number;
  pelletCount?: number;
  spreadRadians?: number;
  penetration: number;
  adsProfile: 'none' | 'reflex';
  hipSpreadRadians: number;
  adsSpreadRadians: number;
  recoil: { kick: number; recoveryMs: number };
  visual: { model: string; muzzleColor: string };
}

const firearm = (definition: CoopFirearmDefinition) => definition;

export const COOP_FIREARM_DEFINITIONS: readonly CoopFirearmDefinition[] = Object.freeze([
  firearm({ id: 'plasma_gun', name: 'Neon Handgun', shortName: 'HANDGUN', slot: 0, ammoType: 'pistol', fireMode: 'semi', magazineSize: 12, startingReserve: 72, maxReserve: 144, baseDamage: 28, fireIntervalMs: 175, reloadStyle: 'magazine', reloadDurationMs: 1350, projectileVelocity: 1300, projectileRadius: 4, penetration: 1, adsProfile: 'reflex', hipSpreadRadians: 0.018, adsSpreadRadians: 0.004, recoil: { kick: 0.75, recoveryMs: 135 }, visual: { model: 'handgun', muzzleColor: '#67e8f9' } }),
  firearm({ id: 'assault_rifle', name: 'Assault Rifle', shortName: 'AR', slot: 1, ammoType: 'rifle', fireMode: 'auto', magazineSize: 60, startingReserve: 240, maxReserve: 480, baseDamage: 15, fireIntervalMs: 125, reloadStyle: 'magazine', reloadDurationMs: 1900, projectileVelocity: 1550, projectileRadius: 3.5, penetration: 1, adsProfile: 'reflex', hipSpreadRadians: 0.045, adsSpreadRadians: 0.011, recoil: { kick: 0.42, recoveryMs: 100 }, visual: { model: 'assault_rifle', muzzleColor: '#34d399' } }),
  firearm({ id: 'combat_shotgun', name: 'Combat Shotgun', shortName: 'SHOTGUN', slot: 2, ammoType: 'shell', fireMode: 'semi', magazineSize: 8, startingReserve: 40, maxReserve: 80, baseDamage: 9, fireIntervalMs: 800, reloadStyle: 'shell_by_shell', shellInsertMs: 460, projectileVelocity: 1120, projectileRadius: 3, pelletCount: 8, spreadRadians: 0.17, penetration: 1, adsProfile: 'none', hipSpreadRadians: 0.17, adsSpreadRadians: 0.13, recoil: { kick: 1.28, recoveryMs: 330 }, visual: { model: 'shotgun', muzzleColor: '#fb923c' } }),
  firearm({ id: 'arc_launcher', name: 'Tempest Conductor', shortName: 'TEMPEST', slot: 3, ammoType: 'prototype_cell', fireMode: 'semi', magazineSize: 8, startingReserve: 40, maxReserve: 88, baseDamage: 42, fireIntervalMs: 650, reloadStyle: 'magazine', reloadDurationMs: 1950, projectileVelocity: 1750, projectileRadius: 5, penetration: 1, adsProfile: 'none', hipSpreadRadians: 0.038, adsSpreadRadians: 0.008, recoil: { kick: 0.88, recoveryMs: 240 }, visual: { model: 'arc_launcher', muzzleColor: '#60a5fa' } }),
  firearm({ id: 'smg', name: 'SMG', shortName: 'SMG', slot: 4, ammoType: 'smg', fireMode: 'auto', magazineSize: 60, startingReserve: 240, maxReserve: 480, baseDamage: 8, fireIntervalMs: 100, reloadStyle: 'magazine', reloadDurationMs: 2100, projectileVelocity: 1420, projectileRadius: 3, penetration: 1, adsProfile: 'reflex', hipSpreadRadians: 0.065, adsSpreadRadians: 0.018, recoil: { kick: 0.33, recoveryMs: 80 }, visual: { model: 'smg', muzzleColor: '#a3e635' } }),
  firearm({ id: 'goreline_repeater', name: 'Goreline Repeater', shortName: 'GORELINE', slot: 3, ammoType: 'prototype_cell', fireMode: 'auto', magazineSize: 30, startingReserve: 120, maxReserve: 240, baseDamage: 15, fireIntervalMs: 160, reloadStyle: 'magazine', reloadDurationMs: 1900, projectileVelocity: 1550, projectileRadius: 4, penetration: 1, adsProfile: 'none', hipSpreadRadians: .035, adsSpreadRadians: .012, recoil: { kick: .58, recoveryMs: 125 }, visual: { model: 'goreline_repeater', muzzleColor: '#fb7185' } }),
  firearm({ id: 'riftspike_array', name: 'Riftspike Array', shortName: 'RIFTSPIKE', slot: 3, ammoType: 'prototype_cell', fireMode: 'semi', magazineSize: 12, startingReserve: 60, maxReserve: 120, baseDamage: 24, fireIntervalMs: 250, reloadStyle: 'magazine', reloadDurationMs: 1700, projectileVelocity: 1900, projectileRadius: 3.5, penetration: 1, adsProfile: 'none', hipSpreadRadians: .012, adsSpreadRadians: .004, recoil: { kick: .44, recoveryMs: 100 }, visual: { model: 'riftspike_array', muzzleColor: '#c084fc' } }),
  firearm({ id: 'dawnwall_cannon', name: 'Dawnwall Cannon', shortName: 'DAWNWALL', slot: 3, ammoType: 'prototype_cell', fireMode: 'auto', magazineSize: 18, startingReserve: 72, maxReserve: 144, baseDamage: 16, fireIntervalMs: 180, reloadStyle: 'magazine', reloadDurationMs: 2000, projectileVelocity: 1450, projectileRadius: 5, penetration: 1, adsProfile: 'none', hipSpreadRadians: .028, adsSpreadRadians: .009, recoil: { kick: .68, recoveryMs: 150 }, visual: { model: 'dawnwall_cannon', muzzleColor: '#fbbf24' } }),
  firearm({ id: 'winterglass_projector', name: 'Winterglass Projector', shortName: 'WINTERGLASS', slot: 3, ammoType: 'prototype_cell', fireMode: 'auto', magazineSize: 40, startingReserve: 160, maxReserve: 280, baseDamage: 4, fireIntervalMs: 100, reloadStyle: 'magazine', reloadDurationMs: 2200, projectileVelocity: 900, projectileRadius: 7, penetration: 999, adsProfile: 'none', hipSpreadRadians: .17, adsSpreadRadians: .17, recoil: { kick: .18, recoveryMs: 70 }, visual: { model: 'winterglass_projector', muzzleColor: '#7dd3fc' } }),
  firearm({ id: 'cinderhex_engine', name: 'Cinderhex Engine', shortName: 'CINDERHEX', slot: 3, ammoType: 'prototype_cell', fireMode: 'auto', magazineSize: 24, startingReserve: 96, maxReserve: 192, baseDamage: 12, fireIntervalMs: 200, reloadStyle: 'magazine', reloadDurationMs: 2000, projectileVelocity: 1250, projectileRadius: 5, penetration: 1, adsProfile: 'none', hipSpreadRadians: .03, adsSpreadRadians: .012, recoil: { kick: .48, recoveryMs: 115 }, visual: { model: 'cinderhex_engine', muzzleColor: '#fb923c' } }),
]);

export const COOP_FIREARM_BY_ID: Readonly<Record<CoopFirearmId, CoopFirearmDefinition>> = Object.freeze(
  Object.fromEntries(COOP_FIREARM_DEFINITIONS.map(definition => [definition.id, definition])) as Record<CoopFirearmId, CoopFirearmDefinition>,
);
export const COOP_WEAPON_SLOTS = ['plasma_gun', 'assault_rifle', 'combat_shotgun', 'arc_launcher', 'smg'] as const satisfies readonly CoopFirearmId[];
export const COOP_FIREARM_IDS = COOP_FIREARM_DEFINITIONS.map(definition => definition.id) as readonly CoopFirearmId[];

export function coopWeaponSlotsForSignature(signatureWeaponId: CoopFirearmId): readonly CoopFirearmId[] {
  return ['plasma_gun', 'assault_rifle', 'combat_shotgun', signatureWeaponId, 'smg'];
}

export interface CoopWeaponRuntime {
  weaponId: CoopFirearmId;
  level: number;
  magazineAmmo: number;
  reserveAmmo: number;
  nextFireAtMs: number;
  state: 'ready' | 'reloading' | 'switching';
  reloadStartedAtMs?: number;
  reloadEndsAtMs?: number;
  shellsLoaded?: number;
  switchEndsAtMs?: number;
}

export function createCoopWeaponRuntime(weaponId: CoopFirearmId): CoopWeaponRuntime {
  const firearm = COOP_FIREARM_BY_ID[weaponId];
  return { weaponId, level: 1, magazineAmmo: firearm.magazineSize, reserveAmmo: firearm.startingReserve, nextFireAtMs: 0, state: 'ready' };
}

export function firearmDamage(definition: CoopFirearmDefinition, level: number) {
  return definition.baseDamage * (1 + 0.10 * Math.max(0, level - 1));
}
export function firearmFireInterval(definition: CoopFirearmDefinition, level: number) {
  return Math.max(50, definition.fireIntervalMs * Math.pow(0.94, Math.max(0, level - 1)));
}
export function firearmSpread(definition: CoopFirearmDefinition, aiming: boolean) {
  return aiming ? definition.adsSpreadRadians : definition.hipSpreadRadians;
}
export function ammoCacheAmount(definition: CoopFirearmDefinition, elite: boolean) {
  return elite ? definition.magazineSize * (definition.ammoType === 'prototype_cell' ? 1 : 1.5) : Math.max(1, Math.ceil(definition.magazineSize * 0.30));
}
