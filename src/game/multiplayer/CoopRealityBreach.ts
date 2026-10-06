import { isWorldPositionClear } from '../world/WorldLayout';
import type { WorldId } from '../world/WorldDefinitions';
import { findClearRunPosition } from './runPlacement';

export const BREACH_FIRST_AT_MS = 18_000;
export const BREACH_LINK_MS = 8_000;
export const BREACH_WINDOW_MS = 55_000;
export const BREACH_ANCHOR_RADIUS = 100;
export const BREACH_PULSE_RADIUS = 1_400;

export interface BreachOperator { id: string; x: number; y: number; z: number; lifeState: string; }
export interface BreachAnchor { id: number; x: number; y: number; occupantId?: string; }
export interface CoopRealityBreachSnapshot {
  cycle: number;
  phase: 'dormant' | 'linking' | 'overdrive' | 'surge';
  x: number;
  y: number;
  anchors: BreachAnchor[];
  requiredAnchors: number;
  linkedAnchors: number;
  progressMs: number;
  remainingMs: number;
  reward: number;
}
export type BreachTransition = 'opened' | 'sealed' | 'failed';

/** Only the host advances this clock. Each operator can power one anchor;
 * guests receive the outcome through the normal snapshot stream. */
export class CoopRealityBreach {
  private nextAtMs = BREACH_FIRST_AT_MS;
  private endsAtMs = 0;
  private state: CoopRealityBreachSnapshot = {
    cycle: 0, phase: 'dormant', x: 6000, y: 6000, anchors: [],
    requiredAnchors: 1, linkedAnchors: 0, progressMs: 0,
    remainingMs: BREACH_FIRST_AT_MS, reward: 160,
  };

  constructor(private readonly worldId: WorldId) {}

  update(deltaMs: number, elapsedMs: number, operators: readonly BreachOperator[], allowOpening = true): BreachTransition | undefined {
    const living = operators.filter(player => player.lifeState === 'alive');
    if (this.state.phase === 'overdrive' || this.state.phase === 'surge') {
      if (elapsedMs >= this.endsAtMs) this.state.phase = 'dormant';
      return;
    }
    if (this.state.phase === 'dormant') {
      if (!allowOpening || elapsedMs < this.nextAtMs || !living.length) return;
      this.open(elapsedMs, living);
      return 'opened';
    }

    this.state.requiredAnchors = Math.max(1, Math.min(this.state.anchors.length, living.length));
    const used = new Set<string>();
    for (const anchor of this.state.anchors) {
      const occupant = living.find(player => !used.has(player.id) && player.z <= 40
        && Math.hypot(player.x - anchor.x, player.y - anchor.y) <= BREACH_ANCHOR_RADIUS);
      anchor.occupantId = occupant?.id;
      if (occupant) used.add(occupant.id);
    }
    this.state.linkedAnchors = used.size;
    const connected = used.size >= this.state.requiredAnchors;
    const dt = Math.max(0, Math.min(50, deltaMs));
    this.state.progressMs = Math.max(0, Math.min(BREACH_LINK_MS, this.state.progressMs + (connected ? dt : -dt * .35)));
    // An expired window cannot be won by a final late tick.
    if (elapsedMs >= this.endsAtMs) return this.resolve('surge', elapsedMs);
    if (this.state.progressMs >= BREACH_LINK_MS) return this.resolve('overdrive', elapsedMs);
  }

  private open(elapsedMs: number, living: readonly BreachOperator[]) {
    const count = Math.min(3, living.length);
    const centre = living.reduce((point, player) => ({ x: point.x + player.x / living.length, y: point.y + player.y / living.length }), { x: 0, y: 0 });
    const anchors: BreachAnchor[] = [];
    const cycle = this.state.cycle + 1;
    for (let index = 0; index < count; index++) {
      const angle = index / count * Math.PI * 2 + cycle * .73;
      const distance = count === 1 ? 240 : 420;
      const desired = { x: centre.x + Math.cos(angle) * distance, y: centre.y + Math.sin(angle) * distance };
      let position: { x: number; y: number } | undefined;
      for (let ring = 0; ring < 20 && !position; ring++) {
        for (let sample = 0; sample < 16 && !position; sample++) {
          const scan = sample / 16 * Math.PI * 2;
          const x = desired.x + Math.cos(scan) * ring * 50;
          const y = desired.y + Math.sin(scan) * ring * 50;
          if (isWorldPositionClear(x, y, BREACH_ANCHOR_RADIUS + 20, this.worldId)
            && anchors.every(anchor => Math.hypot(x - anchor.x, y - anchor.y) > BREACH_ANCHOR_RADIUS * 2 + 80)) position = { x, y };
        }
      }
      position ??= findClearRunPosition(desired, BREACH_ANCHOR_RADIUS + 20, anchors, this.worldId);
      anchors.push({ id: index + 1, ...position });
    }
    const actualCentre = anchors.reduce((point, anchor) => ({ x: point.x + anchor.x / count, y: point.y + anchor.y / count }), { x: 0, y: 0 });
    this.state = { cycle, phase: 'linking', ...actualCentre, anchors, requiredAnchors: count,
      linkedAnchors: 0, progressMs: 0, remainingMs: BREACH_WINDOW_MS, reward: 120 + cycle * 40 };
    this.endsAtMs = elapsedMs + BREACH_WINDOW_MS;
  }

  private resolve(phase: 'overdrive' | 'surge', elapsedMs: number): BreachTransition {
    this.state.phase = phase;
    this.endsAtMs = elapsedMs + 12_000;
    this.nextAtMs = elapsedMs + 65_000;
    return phase === 'overdrive' ? 'sealed' : 'failed';
  }

  movementScale(x: number, y: number) {
    if (Math.hypot(x - this.state.x, y - this.state.y) > BREACH_PULSE_RADIUS) return 1;
    return this.state.phase === 'overdrive' ? .4 : this.state.phase === 'surge' ? 1.3 : 1;
  }

  snapshot(elapsedMs: number): CoopRealityBreachSnapshot {
    return { ...this.state, anchors: this.state.anchors.map(anchor => ({ ...anchor })),
      remainingMs: Math.max(0, Math.round((this.state.phase === 'dormant' ? this.nextAtMs : this.endsAtMs) - elapsedMs)) };
  }
}
