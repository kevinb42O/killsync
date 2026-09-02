import { describe, expect, it } from 'vitest';
import { passiveCooldownMs, passiveDamage, passiveRadius } from './CoopPassiveModules';

describe('co-op passive modules', () => {
  it('grows each module meaningfully without exceeding its visual role', () => {
    expect(passiveRadius('orbit_drones', 3)).toBeGreaterThan(passiveRadius('orbit_drones', 1));
    expect(passiveDamage('frost_aura', 3)).toBeGreaterThan(passiveDamage('frost_aura', 1));
    expect(passiveCooldownMs('neural_pulse', 3)).toBeLessThan(passiveCooldownMs('neural_pulse', 1));
  });
});
