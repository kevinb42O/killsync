import { describe, expect, it } from 'vitest';
import { COOP_FIREARM_BY_ID, ammoCacheAmount } from './coopFirearms';

describe('Co-op Firearm Balance and Specifications', () => {
  it('configures Assault Rifle with 60 round magazine and increased reserves', () => {
    const ar = COOP_FIREARM_BY_ID.assault_rifle;
    expect(ar.magazineSize).toBe(60);
    expect(ar.startingReserve).toBe(240);
    expect(ar.maxReserve).toBe(480);
    expect(ar.fireMode).toBe('auto');
  });

  it('configures SMG with 60 round magazine and increased reserves', () => {
    const smg = COOP_FIREARM_BY_ID.smg;
    expect(smg.magazineSize).toBe(60);
    expect(smg.startingReserve).toBe(240);
    expect(smg.maxReserve).toBe(480);
    expect(smg.fireMode).toBe('auto');
  });

  it('calculates scaled ammo cache drop amounts for 60-round AR and SMG', () => {
    const ar = COOP_FIREARM_BY_ID.assault_rifle;
    const smg = COOP_FIREARM_BY_ID.smg;

    // Normal ammo drops yield 30% of magazine in ammoCacheAmount
    expect(ammoCacheAmount(ar, false)).toBe(18);
    expect(ammoCacheAmount(smg, false)).toBe(18);

    // Elite ammo drops yield 150% of magazine
    expect(ammoCacheAmount(ar, true)).toBe(90);
    expect(ammoCacheAmount(smg, true)).toBe(90);
  });
});
