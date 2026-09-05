import { describe, expect, it } from 'vitest';
import {
  CoopGasZone,
  GAS_BASE_SPREAD_RATE,
  GAS_INITIAL_RADIUS,
  GAS_SPREAD_AT_MS,
  GAS_SURGE_AT_MS,
  GAS_WARNING_AT_MS,
} from './CoopGasZone';

describe('CoopGasZone', () => {
  it('initializes with default radius and contained state', () => {
    const gas = new CoopGasZone({ x: 6000, y: 6000 }, 42);
    expect(gas.radius).toBe(GAS_INITIAL_RADIUS);
    expect(gas.currentState).toBe('contained');
    // Epicenter should be offset from spawn
    const dist = gas.distanceFromCenter(6000, 6000);
    expect(dist).toBeGreaterThan(1500);
    expect(dist).toBeLessThan(2200);
  });

  it('keeps radius stable during contained phase', () => {
    const gas = new CoopGasZone({ x: 6000, y: 6000 }, 42);
    const result = gas.tick(50, 30_000);
    expect(gas.radius).toBe(GAS_INITIAL_RADIUS);
    expect(gas.currentState).toBe('contained');
    expect(result.warningTriggered).toBe(false);
    expect(result.spreadTriggered).toBe(false);
  });

  it('triggers warning state at warning milestone', () => {
    const gas = new CoopGasZone({ x: 6000, y: 6000 }, 42);
    const result = gas.tick(50, GAS_WARNING_AT_MS + 10);
    expect(gas.currentState).toBe('warning');
    expect(result.warningTriggered).toBe(true);
    expect(gas.radius).toBe(GAS_INITIAL_RADIUS);

    // Snapshot reflects warningRemainingMs
    const snap = gas.snapshot(GAS_WARNING_AT_MS + 10);
    expect(snap.state).toBe('warning');
    expect(snap.warningRemainingMs).toBeDefined();
    expect(snap.warningRemainingMs!).toBeGreaterThan(0);
  });

  it('expands radius smoothly in spreading phase', () => {
    const gas = new CoopGasZone({ x: 6000, y: 6000 }, 42);
    // Enter spreading phase
    const result = gas.tick(1000, GAS_SPREAD_AT_MS + 1000);
    expect(gas.currentState).toBe('spreading');
    expect(result.spreadTriggered).toBe(true);
    // Expanded by 1 second * GAS_BASE_SPREAD_RATE
    expect(gas.radius).toBeCloseTo(GAS_INITIAL_RADIUS + GAS_BASE_SPREAD_RATE, 0.1);
  });

  it('correctly evaluates containment of positions', () => {
    const gas = new CoopGasZone({ x: 6000, y: 6000 }, 42);
    // At gas center
    expect(gas.isInsideGas(gas.x, gas.y)).toBe(true);
    // Just inside edge
    expect(gas.isInsideGas(gas.x + GAS_INITIAL_RADIUS - 10, gas.y)).toBe(true);
    // Outside edge
    expect(gas.isInsideGas(gas.x + GAS_INITIAL_RADIUS + 50, gas.y)).toBe(false);
    // Margin check
    expect(gas.isInsideGas(gas.x + GAS_INITIAL_RADIUS + 20, gas.y, 30)).toBe(true);
  });
});
