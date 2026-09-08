import { describe, expect, it } from 'vitest';
import { GAME_HEIGHT, GAME_WIDTH } from '../../constants';
import { WORLD_IDS, getWorldDefinition, isWorldSurfaceWalkable, normalizeCoopWorldProgress, sampleWorldSurface, unlockCoopWorld } from './WorldDefinitions';

describe('world definitions', () => {
  it('defines four ordered worlds with distinct identities and increasing tiers', () => {
    expect(WORLD_IDS).toHaveLength(4);
    expect(WORLD_IDS.map(id => getWorldDefinition(id).tier)).toEqual([1, 2, 3, 4]);
    expect(new Set(WORLD_IDS.map(id => getWorldDefinition(id).theme.zenithColor)).size).toBe(4);
  });

  it('keeps every insertion centre safe while exposing world-specific hazards', () => {
    for (const worldId of WORLD_IDS) expect(isWorldSurfaceWalkable(worldId, GAME_WIDTH / 2, GAME_HEIGHT / 2, 30)).toBe(true);
    expect(sampleWorldSurface('cinderworks', 3_050, 6_150).kind).toBe('burning');
    expect(sampleWorldSurface('cinderworks', 2_000, 2_150).kind).toBe('void');
    expect(sampleWorldSurface('white_silence', 3_850, 5_650).kind).toBe('thin_ice');
    expect(sampleWorldSurface('null_garden', 6_000, 600).kind).toBe('void');
    expect(sampleWorldSurface('null_garden', 6_000, 3_600).kind).toBe('energy');
    expect(sampleWorldSurface('cinderworks', 3_050, 6_150).movementMultiplier).toBeLessThan(1);
    expect(sampleWorldSurface('white_silence', 3_850, 5_650).movementMultiplier).toBeGreaterThan(1);
    expect(sampleWorldSurface('null_garden', 6_000, 3_600).jetRechargeMultiplier).toBeGreaterThan(2);
  });

  it('requires sequential discovery and repairs malformed persisted progress', () => {
    const start = normalizeCoopWorldProgress({ unlockedWorldIds: ['null_garden', 'garbage'] });
    expect(start.unlockedWorldIds).toEqual(WORLD_IDS);
    const fresh = normalizeCoopWorldProgress(undefined);
    expect(unlockCoopWorld(fresh, 'white_silence').unlockedWorldIds).toEqual(['neon_bastion']);
    expect(unlockCoopWorld(fresh, 'cinderworks').unlockedWorldIds).toEqual(['neon_bastion', 'cinderworks']);
  });
});
