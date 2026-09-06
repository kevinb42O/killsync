import { describe, expect, it } from 'vitest';
import { deploymentSectorNumber } from './MultiplayerArena';

describe('multiplayer deployment presentation', () => {
  it('derives a stable two-digit district number from the deployed roster', () => {
    const roster = [{ id: 'operator-alpha' }, { id: 'operator-bravo' }];
    const sector = deploymentSectorNumber(roster);

    expect(deploymentSectorNumber(roster)).toBe(sector);
    expect(sector).toMatch(/^\d{2}$/);
    expect(Number(sector)).toBeGreaterThanOrEqual(1);
    expect(Number(sector)).toBeLessThanOrEqual(24);
  });

  it('changes the district identity when squad identity changes', () => {
    expect(deploymentSectorNumber([{ id: 'alpha' }])).not.toBe(deploymentSectorNumber([{ id: 'omega' }]));
  });
});
