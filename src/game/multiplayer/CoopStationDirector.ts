import { GAME_HEIGHT, GAME_WIDTH } from '../../constants';
import { isWorldPositionClear } from '../world/WorldLayout';
import { COOP_BUY_STATION_STOCK, type CoopBuyStationSnapshot } from './CoopBuyStation';

export const COOP_STATION_COUNT = 3;
export const COOP_STATION_SEPARATION = 1_800;
export const COOP_STATION_CAPTURE_RADIUS = 155;
export const COOP_STATION_CAPTURE_MS = 30_000;
export const COOP_STATION_SHOP_RADIUS = 105;
export const COOP_FIRST_STATION_MIN_DISTANCE = 900;
export const COOP_FIRST_STATION_MAX_DISTANCE = 1_200;
export const COOP_SECOND_STATION_MIN_INSERTION_DISTANCE = 2_400;
export const COOP_THIRD_STATION_MIN_INSERTION_DISTANCE = 3_600;

interface StationSite extends Omit<CoopBuyStationSnapshot, 'stock'> {}
interface Point { x: number; y: number }
interface CaptureActor extends Point { id?: string | number; lifeState?: string; radius?: number }

const SITE_MARGIN = COOP_STATION_CAPTURE_RADIUS + 40;
const GAS_REVEAL_ESTIMATES_MS = [0, 180_000, 330_000] as const;
const GAS_INITIAL_RADIUS = 750;
const GAS_SPREAD_AT_MS = 140_000;
const GAS_SURGE_AT_MS = 300_000;
const GAS_BASE_RATE = 12;
const GAS_SURGE_RATE = 16;
const GAS_MAX_RADIUS = 7_000;
const GAS_REVEAL_BUFFER = 360;
/** Body-overlap allowance plus a short empty grace prevents edge flicker while
 * an operator strafes, slides, or receives a corrected host position. */
export const COOP_STATION_BOUNDARY_TOLERANCE = 12;
export const COOP_STATION_EMPTY_GRACE_MS = 300;

/**
 * Host-only station lifecycle and placement. Clients receive immutable
 * snapshots; they never choose sites or contribute capture time locally.
 */
export class CoopStationDirector {
  private readonly sites: StationSite[];
  private readonly vacantForMs = new Map<number, number>();

  constructor(seed: number, insertion: Point, gasCentre: Point) {
    this.sites = generateCoopStationSites(seed, insertion, gasCentre).map((position, index) => ({
      id: index + 1,
      ...position,
      radius: COOP_STATION_SHOP_RADIUS,
      captureRadius: COOP_STATION_CAPTURE_RADIUS,
      state: 'locked',
      captureProgressMs: 0,
      captureRequiredMs: COOP_STATION_CAPTURE_MS,
      contested: false,
      occupants: 0,
    }));
    this.unlock(0);
  }

  get positions(): readonly Point[] { return this.sites; }

  unlock(index: number) {
    const site = this.sites[index];
    if (site?.state === 'locked') site.state = 'available';
  }

  update(deltaMs: number, players: readonly CaptureActor[], enemies: readonly CaptureActor[]): CoopBuyStationSnapshot[] {
    const activated: CoopBuyStationSnapshot[] = [];
    for (const site of this.sites) {
      if (site.state !== 'available' && site.state !== 'capturing') continue;
      const occupants = players.filter(player => player.lifeState === 'alive'
        && Math.hypot(player.x - site.x, player.y - site.y) <= site.captureRadius + (player.radius || 0) + COOP_STATION_BOUNDARY_TOLERANCE).length;
      const contested = enemies.some(enemy => Math.hypot(enemy.x - site.x, enemy.y - site.y) <= site.captureRadius + (enemy.radius || 0));
      const previousOccupants = site.occupants;
      const vacantMs = occupants > 0 ? 0 : (this.vacantForMs.get(site.id) || 0) + Math.max(0, deltaMs);
      this.vacantForMs.set(site.id, vacantMs);
      const captureHeldThroughJitter = occupants === 0 && previousOccupants > 0 && vacantMs <= COOP_STATION_EMPTY_GRACE_MS;
      site.occupants = occupants > 0 ? occupants : captureHeldThroughJitter ? previousOccupants : 0;
      site.contested = contested;
      site.state = occupants > 0 || captureHeldThroughJitter ? 'capturing' : 'available';

      if (occupants > 0 && !contested) {
        // Each additional operator contributes 50%, capped at 2.5x total.
        const multiplier = 1 + Math.min(1.5, Math.max(0, occupants - 1) * .5);
        site.captureProgressMs = Math.min(site.captureRequiredMs, site.captureProgressMs + Math.max(0, deltaMs) * multiplier);
      } else if (!captureHeldThroughJitter && occupants === 0) {
        site.captureProgressMs = Math.max(0, site.captureProgressMs - Math.max(0, deltaMs) * .2);
      }

      if (site.captureProgressMs >= site.captureRequiredMs) {
        site.state = 'active';
        site.contested = false;
        site.occupants = 0;
        activated.push(this.snapshotSite(site));
      }
    }
    return activated;
  }

  snapshot(): CoopBuyStationSnapshot[] {
    return this.sites.map(site => this.snapshotSite(site));
  }

  private snapshotSite(site: StationSite): CoopBuyStationSnapshot {
    return { ...site, stock: site.state === 'active' ? [...COOP_BUY_STATION_STOCK] : [] };
  }
}

/** Exported for seed/property tests without constructing a combat simulation. */
export function generateCoopStationSites(seed: number, insertion: Point, gasCentre: Point): Point[] {
  const sites: Point[] = [];
  let state = (seed ^ 0x51a7105) >>> 0;
  const random = () => {
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5;
    return (state >>> 0) / 0x1_0000_0000;
  };

  for (let index = 0; index < COOP_STATION_COUNT; index++) {
    const candidates: Point[] = [];
    const count = index === 0 ? 128 : 384;
    for (let attempt = 0; attempt < count; attempt++) {
      if (index === 0) {
        const angle = random() * Math.PI * 2;
        const distance = COOP_FIRST_STATION_MIN_DISTANCE + random() * (COOP_FIRST_STATION_MAX_DISTANCE - COOP_FIRST_STATION_MIN_DISTANCE);
        candidates.push({ x: insertion.x + Math.cos(angle) * distance, y: insertion.y + Math.sin(angle) * distance });
      } else {
        candidates.push({ x: SITE_MARGIN + random() * (GAME_WIDTH - SITE_MARGIN * 2), y: SITE_MARGIN + random() * (GAME_HEIGHT - SITE_MARGIN * 2) });
      }
    }

    // The deterministic lattice is the scored fallback pool. It ensures a
    // valid separated site is preferred over ever returning map centre.
    const latticeOffset = ((seed >>> (index * 5)) & 0xff) % 280;
    for (let y = SITE_MARGIN + latticeOffset; y <= GAME_HEIGHT - SITE_MARGIN; y += 420) {
      for (let x = SITE_MARGIN + ((latticeOffset + Math.round(y)) % 310); x <= GAME_WIDTH - SITE_MARGIN; x += 420) candidates.push({ x, y });
    }

    // Validate the exact integer coordinates that will be replicated. This
    // avoids rounding a barely-valid candidate across a clearance boundary.
    const valid = candidates
      .map(candidate => ({ x: Math.round(candidate.x), y: Math.round(candidate.y) }))
      .filter(candidate => validSite(candidate, index, insertion, gasCentre, sites));
    if (valid.length === 0) throw new Error(`No separated co-op station site for seed ${seed} at index ${index}`);
    const scored = valid.map(candidate => ({ candidate, score: scoreSite(candidate, index, insertion, gasCentre, sites) }));
    scored.sort((a, b) => b.score - a.score || a.candidate.x - b.candidate.x || a.candidate.y - b.candidate.y);
    sites.push(scored[0].candidate);
  }
  return sites;
}

function validSite(candidate: Point, index: number, insertion: Point, gasCentre: Point, sites: readonly Point[]) {
  if (candidate.x < SITE_MARGIN || candidate.y < SITE_MARGIN || candidate.x > GAME_WIDTH - SITE_MARGIN || candidate.y > GAME_HEIGHT - SITE_MARGIN) return false;
  if (!isWorldPositionClear(candidate.x, candidate.y, COOP_STATION_CAPTURE_RADIUS)) return false;
  if (!hasNearbyStreetAccess(candidate)) return false;
  const insertionDistance = Math.hypot(candidate.x - insertion.x, candidate.y - insertion.y);
  if (index === 0 && (insertionDistance < COOP_FIRST_STATION_MIN_DISTANCE || insertionDistance > COOP_FIRST_STATION_MAX_DISTANCE)) return false;
  const laterInsertionMinimum = index === 1 ? COOP_SECOND_STATION_MIN_INSERTION_DISTANCE : COOP_THIRD_STATION_MIN_INSERTION_DISTANCE;
  if (index > 0 && insertionDistance < laterInsertionMinimum) return false;
  if (sites.some(site => Math.hypot(candidate.x - site.x, candidate.y - site.y) < COOP_STATION_SEPARATION)) return false;
  const gasDistance = Math.hypot(candidate.x - gasCentre.x, candidate.y - gasCentre.y);
  // Boss timing is player-dependent. Later sites must remain viable even on
  // a slow run, so they sit beyond the gas zone's maximum possible extent.
  const relevantGasRadius = index === 0 ? predictedGasRadius(GAS_REVEAL_ESTIMATES_MS[0]) : GAS_MAX_RADIUS;
  return gasDistance >= relevantGasRadius + GAS_REVEAL_BUFFER;
}

function hasNearbyStreetAccess(site: Point) {
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]] as const;
  return directions.some(([dx, dy]) => [COOP_STATION_CAPTURE_RADIUS + 45, COOP_STATION_CAPTURE_RADIUS + 145]
    .every(distance => {
      const x = site.x + dx * distance, y = site.y + dy * distance;
      return x >= 28 && y >= 28 && x <= GAME_WIDTH - 28 && y <= GAME_HEIGHT - 28 && isWorldPositionClear(x, y, 28);
    }));
}

function predictedGasRadius(elapsedMs: number) {
  if (elapsedMs <= GAS_SPREAD_AT_MS) return GAS_INITIAL_RADIUS;
  const normalSeconds = Math.max(0, Math.min(elapsedMs, GAS_SURGE_AT_MS) - GAS_SPREAD_AT_MS) / 1000;
  const surgeSeconds = Math.max(0, elapsedMs - GAS_SURGE_AT_MS) / 1000;
  return Math.min(GAS_MAX_RADIUS, GAS_INITIAL_RADIUS + normalSeconds * GAS_BASE_RATE + surgeSeconds * GAS_SURGE_RATE);
}

function scoreSite(candidate: Point, index: number, insertion: Point, gasCentre: Point, sites: readonly Point[]) {
  const nearestStation = sites.length ? Math.min(...sites.map(site => Math.hypot(candidate.x - site.x, candidate.y - site.y))) : 0;
  const gasClearance = Math.hypot(candidate.x - gasCentre.x, candidate.y - gasCentre.y) - (index === 0 ? predictedGasRadius(GAS_REVEAL_ESTIMATES_MS[0]) : GAS_MAX_RADIUS);
  const edgeClearance = Math.min(candidate.x, candidate.y, GAME_WIDTH - candidate.x, GAME_HEIGHT - candidate.y);
  const insertionDistance = Math.hypot(candidate.x - insertion.x, candidate.y - insertion.y);
  if (index === 0) return -Math.abs(insertionDistance - 1_050) + gasClearance * .12 + edgeClearance * .05;
  // Later sites favor broad run coverage while retaining meaningful gas and
  // edge margins. All hard separation constraints were already applied.
  return nearestStation * 1.8 + gasClearance * .65 + edgeClearance * .15 - Math.abs(insertionDistance - (index === 1 ? 3_000 : 4_600)) * .18;
}
