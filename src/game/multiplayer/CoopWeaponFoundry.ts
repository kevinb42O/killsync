import type { CoopFirearmId } from '../combat/coopFirearms';
import { GAME_HEIGHT, GAME_WIDTH } from '../../constants';
import { isWorldPositionClear } from '../world/WorldLayout';
import { GAS_MAX_RADIUS } from './CoopGasZone';
import type { CoopStationState } from './CoopBuyStation';

export const COOP_FOUNDRY_CAPTURE_RADIUS = 180;
export const COOP_FOUNDRY_INTERACTION_RADIUS = 120;
export const COOP_FOUNDRY_CAPTURE_MS = 45_000;
export const COOP_FOUNDRY_MAX_WEAPON_LEVEL = 8;
export const COOP_FOUNDRY_STATION_CLEARANCE = 1_200;
const FOUNDRY_MARGIN = COOP_FOUNDRY_CAPTURE_RADIUS + 50;
const GAS_CLEARANCE = 420;

/** Provisional until run telemetry measures pickup-credit income. Fixed run
 * awards currently provide 450 credits per contract+mini-boss, targeting one
 * guaranteed level or a second level after meaningful coin collection. */
export const COOP_FOUNDRY_PROVISIONAL_LEVEL_PRICES = Object.freeze([225, 300, 400, 525, 675, 850, 1_050] as const);

export interface CoopWeaponFoundrySnapshot {
  id: number;
  x: number;
  y: number;
  radius: number;
  captureRadius: number;
  state: CoopStationState;
  captureProgressMs: number;
  captureRequiredMs: number;
  contested: boolean;
  occupants: number;
  pricingStatus: 'provisional_pending_credit_telemetry';
}

export type CoopFoundryErrorCode = 'foundry_inactive' | 'foundry_range' | 'alive_required' | 'invalid_weapon' | 'weapon_max' | 'credits';
export interface CoopFoundryResult { code: CoopFoundryErrorCode; amount?: number }
export interface CoopFoundryUpgradeResult { playerId: string; weaponId: CoopFirearmId; code: CoopFoundryErrorCode | 'forged'; amount?: number }

export function coopFoundryUpgradeCost(currentLevel: number) {
  const level = Math.max(1, Math.min(COOP_FOUNDRY_MAX_WEAPON_LEVEL - 1, Math.trunc(currentLevel)));
  return COOP_FOUNDRY_PROVISIONAL_LEVEL_PRICES[level - 1];
}

interface Actor { x: number; y: number; radius?: number; lifeState?: string }

export class CoopWeaponFoundry {
  private state: CoopStationState = 'locked';
  private progressMs = 0;
  private contested = false;
  private occupants = 0;
  private vacantForMs = 0;

  constructor(readonly id: number, readonly x: number, readonly y: number) {}

  unlock() { if (this.state === 'locked') this.state = 'available'; }

  update(deltaMs: number, players: readonly Actor[], enemies: readonly Actor[]) {
    if (this.state !== 'available' && this.state !== 'capturing') return false;
    const count = players.filter(player => player.lifeState === 'alive'
      && Math.hypot(player.x - this.x, player.y - this.y) <= COOP_FOUNDRY_CAPTURE_RADIUS + (player.radius || 0) + 12).length;
    this.contested = enemies.some(enemy => Math.hypot(enemy.x - this.x, enemy.y - this.y) <= COOP_FOUNDRY_CAPTURE_RADIUS + (enemy.radius || 0));
    const previous = this.occupants;
    this.vacantForMs = count > 0 ? 0 : this.vacantForMs + Math.max(0, deltaMs);
    const grace = count === 0 && previous > 0 && this.vacantForMs <= 300;
    this.occupants = count > 0 ? count : grace ? previous : 0;
    this.state = count > 0 || grace ? 'capturing' : 'available';
    if (count > 0 && !this.contested) {
      const multiplier = 1 + Math.min(1.5, Math.max(0, count - 1) * .5);
      this.progressMs = Math.min(COOP_FOUNDRY_CAPTURE_MS, this.progressMs + Math.max(0, deltaMs) * multiplier);
    } else if (!grace && count === 0) this.progressMs = Math.max(0, this.progressMs - Math.max(0, deltaMs) * .2);
    if (this.progressMs < COOP_FOUNDRY_CAPTURE_MS) return false;
    this.state = 'active'; this.contested = false; this.occupants = 0;
    return true;
  }

  snapshot(): CoopWeaponFoundrySnapshot {
    return { id: this.id, x: this.x, y: this.y, radius: COOP_FOUNDRY_INTERACTION_RADIUS, captureRadius: COOP_FOUNDRY_CAPTURE_RADIUS, state: this.state, captureProgressMs: this.progressMs, captureRequiredMs: COOP_FOUNDRY_CAPTURE_MS, contested: this.contested, occupants: this.occupants, pricingStatus: 'provisional_pending_credit_telemetry' };
  }
}

export function isCoopFirearmId(value: unknown, ids: readonly CoopFirearmId[]): value is CoopFirearmId {
  return typeof value === 'string' && ids.includes(value as CoopFirearmId);
}

/** Deterministic, collision-safe site selected at match creation. The Foundry
 * is kept viable for the entire run and cannot overlap any Buy Station. */
export function generateCoopWeaponFoundrySite(seed: number, insertion: Actor, gasCentre: Actor, stations: readonly Actor[]) {
  let state = (seed ^ 0xa8c4f31d) >>> 0;
  const random = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };
  const candidates: Array<{ x: number; y: number }> = [];
  for (let attempt = 0; attempt < 768; attempt++) candidates.push({
    x: FOUNDRY_MARGIN + random() * (GAME_WIDTH - FOUNDRY_MARGIN * 2),
    y: FOUNDRY_MARGIN + random() * (GAME_HEIGHT - FOUNDRY_MARGIN * 2),
  });
  const offset = (seed >>> 7) % 311;
  for (let y = FOUNDRY_MARGIN + offset; y <= GAME_HEIGHT - FOUNDRY_MARGIN; y += 360) {
    for (let x = FOUNDRY_MARGIN + ((offset + Math.round(y)) % 337); x <= GAME_WIDTH - FOUNDRY_MARGIN; x += 360) candidates.push({ x, y });
  }
  const valid = candidates.map(point => ({ x: Math.round(point.x), y: Math.round(point.y) })).filter(point => {
    if (!isWorldPositionClear(point.x, point.y, COOP_FOUNDRY_CAPTURE_RADIUS)) return false;
    if (Math.hypot(point.x - insertion.x, point.y - insertion.y) < 2_200) return false;
    if (Math.hypot(point.x - gasCentre.x, point.y - gasCentre.y) < GAS_MAX_RADIUS + GAS_CLEARANCE) return false;
    if (stations.some(site => Math.hypot(point.x - site.x, point.y - site.y) < COOP_FOUNDRY_STATION_CLEARANCE)) return false;
    return hasStreetAccess(point);
  });
  if (!valid.length) throw new Error(`No safe co-op Weapon Foundry site for seed ${seed}`);
  valid.sort((a, b) => foundryScore(b, insertion, gasCentre, stations) - foundryScore(a, insertion, gasCentre, stations) || a.x - b.x || a.y - b.y);
  return valid[0];
}

function hasStreetAccess(site: Actor) {
  return ([[1, 0], [-1, 0], [0, 1], [0, -1]] as const).some(([dx, dy]) => [235, 330].every(distance =>
    isWorldPositionClear(site.x + dx * distance, site.y + dy * distance, 28)));
}

function foundryScore(candidate: Actor, insertion: Actor, gasCentre: Actor, stations: readonly Actor[]) {
  const gas = Math.hypot(candidate.x - gasCentre.x, candidate.y - gasCentre.y);
  const station = stations.length ? Math.min(...stations.map(site => Math.hypot(candidate.x - site.x, candidate.y - site.y))) : COOP_FOUNDRY_STATION_CLEARANCE;
  const insertionDistance = Math.hypot(candidate.x - insertion.x, candidate.y - insertion.y);
  const edge = Math.min(candidate.x, candidate.y, GAME_WIDTH - candidate.x, GAME_HEIGHT - candidate.y);
  return gas * .55 + station * .35 + edge * .2 - Math.abs(insertionDistance - 4_000) * .12;
}
