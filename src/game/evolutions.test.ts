import { describe, expect, it } from 'vitest';
import { WEAPON_DEFINITIONS } from '../constants';
import { EVOLUTION_PROFILES, getEvolutionProfile } from './evolutions';

describe('evolution runtime profiles', () => {
  it('gives every declared weapon evolution a concrete runtime profile', () => {
    const declared = WEAPON_DEFINITIONS.filter((weapon) => weapon.evolution);
    expect(Object.keys(EVOLUTION_PROFILES)).toHaveLength(declared.length);
    for (const weapon of declared) {
      const profile = getEvolutionProfile(weapon.evolution);
      expect(profile?.weaponId).toBe(weapon.id);
      expect(profile?.damageMultiplier).toBeGreaterThan(1);
      expect(profile?.durationMultiplier).toBeGreaterThanOrEqual(1);
    }
  });

  it('keeps evolution identity explicit rather than deriving it from a display name', () => {
    expect(getEvolutionProfile('parallel_self')?.motif).toBe('parallel');
    expect(getEvolutionProfile('not_a_real_evolution')).toBeUndefined();
  });
});
