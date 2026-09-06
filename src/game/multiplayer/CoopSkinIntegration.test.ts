import { describe, expect, it } from 'vitest';
import { CoopSimulation } from './CoopSimulation';

describe('co-op skin simulation integration', () => {
  it('normalizes a skin once and preserves it through snapshots and retry seeds', () => {
    const simulation = new CoopSimulation([{ id: 'one', label: 'One', color: '#22d3ee', skinId: 'royal_inferno' }], 7);
    expect(simulation.createSnapshot().players[0].skinId).toBe('royal_inferno');
    expect(simulation.getPlayerSeeds()[0].skinId).toBe('royal_inferno');

    const retry = new CoopSimulation(simulation.getPlayerSeeds(), 8);
    expect(retry.createSnapshot().players[0].skinId).toBe('royal_inferno');
  });

  it('does not carry an unknown network skin into authoritative state', () => {
    const simulation = new CoopSimulation([{ id: 'one', label: 'One', color: '#22d3ee', skinId: 'not-real' as never }], 7);
    expect(simulation.createSnapshot().players[0].skinId).toBe('neon_vanguard');
  });
});
