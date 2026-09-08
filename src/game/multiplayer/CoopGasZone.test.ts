import { describe, expect, it } from 'vitest';
import {
  CoopGasZone,
  GAS_INITIAL_RADIUS,
  GAS_MAX_MOVE_DISTANCE,
  GAS_MIN_MOVE_DISTANCE,
  GAS_WARNING_DURATION_MS,
} from './CoopGasZone';

describe('CoopGasZone', () => {
  it('initializes at a deterministic random map position with a fixed radius', () => {
    const gas = new CoopGasZone({ x: 6000, y: 6000 }, 42);
    const repeated = new CoopGasZone({ x: 6000, y: 6000 }, 42);
    expect(gas.radius).toBe(GAS_INITIAL_RADIUS);
    expect(gas.currentState).toBe('stationary');
    expect({ x: gas.x, y: gas.y }).toEqual({ x: repeated.x, y: repeated.y });
    expect(gas.distanceFromCenter(6000, 6000)).toBeGreaterThanOrEqual(1400);
    expect(gas.x).toBeGreaterThan(GAS_INITIAL_RADIUS);
    expect(gas.y).toBeGreaterThan(GAS_INITIAL_RADIUS);
  });

  it('stops, warns, moves, settles, and stops again without ever spreading', () => {
    const gas = new CoopGasZone({ x: 6000, y: 6000 }, 42);
    const start = { x: gas.x, y: gas.y };
    const warning = gas.tick(gas.snapshot().phaseRemainingMs);
    expect(warning.warningTriggered).toBe(true);
    expect(gas.currentState).toBe('warning');
    expect(gas.snapshot().warningRemainingMs).toBe(GAS_WARNING_DURATION_MS);
    expect(gas.radius).toBe(GAS_INITIAL_RADIUS);

    const move = gas.tick(GAS_WARNING_DURATION_MS);
    expect(move.moveTriggered).toBe(true);
    expect(move.spreadTriggered).toBe(true);
    expect(gas.currentState).toBe('moving');
    const destination = gas.snapshot();
    const moveDistance = Math.hypot(destination.targetX! - start.x, destination.targetY! - start.y);
    expect(moveDistance).toBeGreaterThanOrEqual(GAS_MIN_MOVE_DISTANCE - 2);
    expect(moveDistance).toBeLessThanOrEqual(GAS_MAX_MOVE_DISTANCE + 2);

    gas.tick(destination.phaseRemainingMs / 2);
    expect(Math.hypot(gas.x - start.x, gas.y - start.y)).toBeGreaterThan(0);
    expect(gas.radius).toBe(GAS_INITIAL_RADIUS);
    const settled = gas.tick(gas.snapshot().phaseRemainingMs);
    expect(settled.settledTriggered).toBe(true);
    expect(gas.currentState).toBe('settling');
    gas.tick(gas.snapshot().phaseRemainingMs);
    expect(gas.currentState).toBe('stationary');
    expect(gas.radius).toBe(GAS_INITIAL_RADIUS);
  });

  it('correctly evaluates containment of positions', () => {
    const gas = new CoopGasZone({ x: 6000, y: 6000 }, 42);
    expect(gas.isInsideGas(gas.x, gas.y)).toBe(true);
    expect(gas.isInsideGas(gas.x + GAS_INITIAL_RADIUS - 10, gas.y)).toBe(true);
    expect(gas.isInsideGas(gas.x + GAS_INITIAL_RADIUS + 50, gas.y)).toBe(false);
    expect(gas.isInsideGas(gas.x + GAS_INITIAL_RADIUS + 20, gas.y, 30)).toBe(true);
  });
});
