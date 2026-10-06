import { describe, expect, it } from 'vitest';
import { advanceGrenade, grenadeDamage, GRENADE_RADIUS } from './coopGrenades';
const grenade = () => ({ id: 1, ownerId: 'host', x: 0, y: 0, z: 30, vx: 100, vy: 0, vz: 100, fuseMs: 1600 });
describe('grenade physics', () => {
  it('uses gravity, ground bounce and a deterministic fuse', () => {
    const g = grenade(); expect(advanceGrenade(g, 50, () => undefined)).toBe(false); expect(g.vz).toBe(70); expect(g.x).toBe(5);
    for (let i = 0; i < 31; i++) advanceGrenade(g, 50, () => undefined);
    expect(g.fuseMs).toBe(0); expect(g.z).toBeGreaterThanOrEqual(4);
  });
  it('reflects the swept velocity against a cover normal instead of tunnelling', () => {
    const g = grenade(); advanceGrenade(g, 50, () => ({ x: 3, y: 0, z: 32, nx: -1, ny: 0, nz: 0 }));
    expect(g.x).toBe(1); expect(g.vx).toBeCloseTo(-56); expect(g.z).toBe(32);
  });
  it('falls off toward the edge and excludes outside targets', () => { expect(grenadeDamage(0)).toBe(240); expect(grenadeDamage(GRENADE_RADIUS)).toBeCloseTo(67.2); expect(grenadeDamage(GRENADE_RADIUS + 1)).toBe(0); });
});
