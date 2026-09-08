import { GAME_HEIGHT, GAME_WIDTH } from '../../constants';
import { isWorldPositionClear } from '../world/WorldLayout';
import type { WorldId } from '../world/WorldDefinitions';

export type CoopGasZoneState = 'stationary' | 'warning' | 'moving' | 'settling';

export interface CoopGasZoneSnapshot {
  x: number;
  y: number;
  radius: number;
  initialRadius: number;
  state: CoopGasZoneState;
  damagePerSecond: number;
  warningRemainingMs?: number;
  phaseRemainingMs: number;
  targetX?: number;
  targetY?: number;
}

export const GAS_INITIAL_RADIUS = 750;
/** Compatibility alias for placement code. The mobile cloud never expands. */
export const GAS_MAX_RADIUS = GAS_INITIAL_RADIUS;
export const GAS_DPS = 3;
export const GAS_WARNING_DURATION_MS = 12_000;
export const GAS_SETTLING_DURATION_MS = 5_000;
export const GAS_MIN_STATIONARY_MS = 75_000;
export const GAS_MAX_STATIONARY_MS = 110_000;
export const GAS_MIN_MOVE_MS = 22_000;
export const GAS_MAX_MOVE_MS = 30_000;
export const GAS_MIN_MOVE_DISTANCE = 900;
export const GAS_MAX_MOVE_DISTANCE = 1_500;

/** Legacy timing exports retained for older consumers. They no longer drive
 * radius growth. */
export const GAS_WARNING_AT_MS = GAS_MIN_STATIONARY_MS;
export const GAS_SPREAD_AT_MS = GAS_WARNING_AT_MS + GAS_WARNING_DURATION_MS;
export const GAS_SURGE_AT_MS = Number.POSITIVE_INFINITY;
export const GAS_BASE_SPREAD_RATE = 0;
export const GAS_SURGE_SPREAD_RATE = 0;

export class CoopGasZone {
  x: number;
  y: number;
  private state: CoopGasZoneState = 'stationary';
  private phaseRemainingMs: number;
  private moveDurationMs = 0;
  private moveElapsedMs = 0;
  private moveStartX = 0;
  private moveStartY = 0;
  private targetX?: number;
  private targetY?: number;
  private randomState: number;
  private readonly worldId: WorldId;

  constructor(spawnOrigin: { x: number; y: number } = { x: 6000, y: 6000 }, seed = 0xdecafbad, worldId: WorldId = 'neon_bastion') {
    this.worldId = worldId;
    this.randomState = (seed ^ 0x5a17e0) >>> 0;
    const initial = this.pickInitialPosition(spawnOrigin);
    this.x = initial.x;
    this.y = initial.y;
    this.phaseRemainingMs = this.randomDuration(GAS_MIN_STATIONARY_MS, GAS_MAX_STATIONARY_MS);
  }

  get radius() { return GAS_INITIAL_RADIUS; }
  get currentState() { return this.state; }

  isInsideGas(px: number, py: number, playerRadius = 0): boolean {
    return Math.hypot(px - this.x, py - this.y) <= GAS_INITIAL_RADIUS + playerRadius;
  }

  distanceFromCenter(px: number, py: number): number { return Math.hypot(px - this.x, py - this.y); }

  tick(deltaMs: number, _elapsedMs = 0): {
    warningTriggered: boolean;
    moveTriggered: boolean;
    settledTriggered: boolean;
    spreadTriggered: boolean;
    stateChanged: boolean;
  } {
    const dt = Math.max(0, deltaMs);
    const previous = this.state;
    let warningTriggered = false;
    let moveTriggered = false;
    let settledTriggered = false;
    this.phaseRemainingMs = Math.max(0, this.phaseRemainingMs - dt);

    if (this.state === 'stationary' && this.phaseRemainingMs <= 0) {
      const target = this.pickDestination();
      this.targetX = target.x; this.targetY = target.y;
      this.state = 'warning';
      this.phaseRemainingMs = GAS_WARNING_DURATION_MS;
      warningTriggered = true;
    } else if (this.state === 'warning' && this.phaseRemainingMs <= 0) {
      this.state = 'moving';
      this.moveDurationMs = this.randomDuration(GAS_MIN_MOVE_MS, GAS_MAX_MOVE_MS);
      this.phaseRemainingMs = this.moveDurationMs;
      this.moveElapsedMs = 0;
      this.moveStartX = this.x; this.moveStartY = this.y;
      moveTriggered = true;
    } else if (this.state === 'moving') {
      this.moveElapsedMs = Math.min(this.moveDurationMs, this.moveElapsedMs + dt);
      const raw = this.moveDurationMs > 0 ? this.moveElapsedMs / this.moveDurationMs : 1;
      const eased = raw * raw * (3 - 2 * raw);
      this.x = this.moveStartX + ((this.targetX ?? this.x) - this.moveStartX) * eased;
      this.y = this.moveStartY + ((this.targetY ?? this.y) - this.moveStartY) * eased;
      if (this.phaseRemainingMs <= 0) {
        this.x = this.targetX ?? this.x; this.y = this.targetY ?? this.y;
        this.state = 'settling';
        this.phaseRemainingMs = GAS_SETTLING_DURATION_MS;
        settledTriggered = true;
      }
    } else if (this.state === 'settling' && this.phaseRemainingMs <= 0) {
      this.state = 'stationary';
      this.phaseRemainingMs = this.randomDuration(GAS_MIN_STATIONARY_MS, GAS_MAX_STATIONARY_MS);
      this.targetX = undefined; this.targetY = undefined;
    }

    return { warningTriggered, moveTriggered, settledTriggered, spreadTriggered: moveTriggered, stateChanged: previous !== this.state };
  }

  snapshot(_elapsedMs = 0): CoopGasZoneSnapshot {
    return {
      x: Math.round(this.x), y: Math.round(this.y), radius: GAS_INITIAL_RADIUS, initialRadius: GAS_INITIAL_RADIUS,
      state: this.state, damagePerSecond: GAS_DPS, phaseRemainingMs: Math.round(this.phaseRemainingMs),
      warningRemainingMs: this.state === 'warning' ? Math.round(this.phaseRemainingMs) : undefined,
      targetX: this.targetX === undefined ? undefined : Math.round(this.targetX),
      targetY: this.targetY === undefined ? undefined : Math.round(this.targetY),
    };
  }

  private pickInitialPosition(spawnOrigin: { x: number; y: number }) {
    const margin = GAS_INITIAL_RADIUS + 150;
    for (let attempt = 0; attempt < 96; attempt++) {
      const point = { x: Math.round(margin + this.random() * (GAME_WIDTH - margin * 2)), y: Math.round(margin + this.random() * (GAME_HEIGHT - margin * 2)) };
      if (Math.hypot(point.x - spawnOrigin.x, point.y - spawnOrigin.y) >= 1_400 && isWorldPositionClear(point.x, point.y, 80, this.worldId)) return point;
    }
    return { x: margin, y: margin };
  }

  private pickDestination() {
    const margin = GAS_INITIAL_RADIUS + 150;
    for (let attempt = 0; attempt < 64; attempt++) {
      const angle = this.random() * Math.PI * 2;
      const distance = GAS_MIN_MOVE_DISTANCE + this.random() * (GAS_MAX_MOVE_DISTANCE - GAS_MIN_MOVE_DISTANCE);
      const point = { x: Math.round(this.x + Math.cos(angle) * distance), y: Math.round(this.y + Math.sin(angle) * distance) };
      if (point.x >= margin && point.y >= margin && point.x <= GAME_WIDTH - margin && point.y <= GAME_HEIGHT - margin && isWorldPositionClear(point.x, point.y, 80, this.worldId)) return point;
    }
    return { x: Math.round(Math.max(margin, Math.min(GAME_WIDTH - margin, GAME_WIDTH - this.x))), y: Math.round(Math.max(margin, Math.min(GAME_HEIGHT - margin, GAME_HEIGHT - this.y))) };
  }

  private randomDuration(minimum: number, maximum: number) { return Math.round(minimum + this.random() * (maximum - minimum)); }
  private random() {
    this.randomState ^= this.randomState << 13; this.randomState ^= this.randomState >>> 17; this.randomState ^= this.randomState << 5;
    return (this.randomState >>> 0) / 0x1_0000_0000;
  }
}
