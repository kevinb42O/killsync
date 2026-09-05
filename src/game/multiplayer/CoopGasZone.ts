export type CoopGasZoneState = 'contained' | 'warning' | 'spreading' | 'surging';

export interface CoopGasZoneSnapshot {
  x: number;
  y: number;
  radius: number;
  initialRadius: number;
  state: CoopGasZoneState;
  damagePerSecond: number;
  warningRemainingMs?: number;
}

export const GAS_INITIAL_RADIUS = 750;
export const GAS_DPS = 3;
export const GAS_WARNING_AT_MS = 110_000; // 1m 50s: Klaxon warning
export const GAS_SPREAD_AT_MS = 140_000;  // 2m 20s: Expansion starts
export const GAS_SURGE_AT_MS = 300_000;   // 5m 00s: Surge rate
export const GAS_BASE_SPREAD_RATE = 12;   // 12 units/second
export const GAS_SURGE_SPREAD_RATE = 16;  // 16 units/second
export const GAS_MAX_RADIUS = 7_000;

export class CoopGasZone {
  readonly x: number;
  readonly y: number;
  private currentRadius: number = GAS_INITIAL_RADIUS;
  private state: CoopGasZoneState = 'contained';
  private warningFired = false;
  private spreadFired = false;

  constructor(spawnOrigin: { x: number; y: number } = { x: 6000, y: 6000 }, seed = 0xdecafbad) {
    // Offset the chemical epicenter from squad spawn so it's a visible threat
    // on the horizon without instantly damaging players at drop-in.
    const angle = ((seed ^ 0x5a17e0) >>> 0) / 0x1_0000_0000 * Math.PI * 2;
    const distance = 1_850;
    this.x = Math.round(spawnOrigin.x + Math.cos(angle) * distance);
    this.y = Math.round(spawnOrigin.y + Math.sin(angle) * distance);
  }

  get radius() {
    return this.currentRadius;
  }

  get currentState() {
    return this.state;
  }

  isInsideGas(px: number, py: number, playerRadius = 0): boolean {
    const dist = Math.hypot(px - this.x, py - this.y);
    return dist <= this.currentRadius + playerRadius;
  }

  distanceFromCenter(px: number, py: number): number {
    return Math.hypot(px - this.x, py - this.y);
  }

  /**
   * Ticks the gas zone state and radius according to game pacing.
   * Returns events when state milestones are crossed.
   */
  tick(deltaMs: number, elapsedMs: number): {
    warningTriggered: boolean;
    spreadTriggered: boolean;
    stateChanged: boolean;
  } {
    const dt = Math.max(0, deltaMs);
    const prevState = this.state;
    let warningTriggered = false;
    let spreadTriggered = false;

    if (elapsedMs < GAS_WARNING_AT_MS) {
      this.state = 'contained';
    } else if (elapsedMs < GAS_SPREAD_AT_MS) {
      this.state = 'warning';
      if (!this.warningFired) {
        this.warningFired = true;
        warningTriggered = true;
      }
    } else if (elapsedMs < GAS_SURGE_AT_MS) {
      this.state = 'spreading';
      if (!this.spreadFired) {
        this.spreadFired = true;
        spreadTriggered = true;
      }
      const rate = GAS_BASE_SPREAD_RATE * (dt / 1000);
      this.currentRadius = Math.min(GAS_MAX_RADIUS, this.currentRadius + rate);
    } else {
      this.state = 'surging';
      const rate = GAS_SURGE_SPREAD_RATE * (dt / 1000);
      this.currentRadius = Math.min(GAS_MAX_RADIUS, this.currentRadius + rate);
    }

    return {
      warningTriggered,
      spreadTriggered,
      stateChanged: this.state !== prevState,
    };
  }

  snapshot(elapsedMs: number): CoopGasZoneSnapshot {
    const warningRemainingMs =
      this.state === 'warning'
        ? Math.max(0, GAS_SPREAD_AT_MS - elapsedMs)
        : undefined;

    return {
      x: this.x,
      y: this.y,
      radius: Math.round(this.currentRadius),
      initialRadius: GAS_INITIAL_RADIUS,
      state: this.state,
      damagePerSecond: GAS_DPS,
      warningRemainingMs,
    };
  }
}
