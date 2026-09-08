import { describe, expect, it } from 'vitest';
import { CoopSimulation } from './CoopSimulation';
import { COOP_MAX_FABRICATOR_CHARGES } from './CoopFieldEngineering';

const createSimulation = () => new CoopSimulation([
  { id: 'owner', label: 'Kevin', color: '#22d3ee' },
  { id: 'friend', label: 'Raven', color: '#fb7185' },
]);

describe('owner-authorized simulation mutations', () => {
  it('marks gameplay mutations and applies bounded player resources', () => {
    const simulation = createSimulation();
    const player = simulation['players'].get('friend')!;
    player.health = 20;

    expect(simulation.adminHeal(['friend'])).toBe(1);
    expect(simulation.adminGive(['friend'], 'credits', 500)).toBe(1);
    expect(simulation.adminGive(['friend'], 'fabricator')).toBe(1);
    const snapshot = simulation.createSnapshot();
    expect(snapshot.players.find(candidate => candidate.id === 'friend')).toMatchObject({ health: 100, coins: 500, fabricatorCharges: COOP_MAX_FABRICATOR_CHARGES });
    expect(snapshot.administration).toMatchObject({ modified: true });
  });

  it('revives eliminated operators and can create and clear bounded hostiles', () => {
    const simulation = createSimulation();
    const player = simulation['players'].get('friend')!;
    player.lifeState = 'eliminated';
    player.health = 0;

    expect(simulation.adminRevive(['friend'])).toBe(1);
    expect(simulation.createSnapshot().players.find(candidate => candidate.id === 'friend')?.lifeState).toBe('alive');
    expect(simulation.adminSpawn('basic', 999, 'owner')).toBeLessThanOrEqual(40);
    expect(simulation.adminKillAll()).toBeGreaterThan(0);
    expect(simulation.createSnapshot().enemies).toHaveLength(0);
  });

  it('hot-swaps the entire authoritative session to any requested world', () => {
    const simulation = createSimulation();
    expect(simulation.adminSpawn('basic', 3, 'owner')).toBe(3);

    expect(simulation.adminSetWorld('white_silence')).toBe(true);
    let snapshot = simulation.createSnapshot();
    expect(snapshot.world?.id).toBe('white_silence');
    expect(snapshot.enemies.some(enemy => enemy.archetypeName === 'CHEM COMMANDER' && enemy.missionRole === 'target')).toBe(true);
    expect(snapshot.enemies.every(enemy => enemy.missionId !== undefined)).toBe(true);
    expect(snapshot.run.phase).toBe('insertion');
    expect(snapshot.players.every(player => player.weaponStates.every(weapon => weapon.level >= 3))).toBe(true);
    expect(snapshot.administration).toMatchObject({ modified: true, lastAction: 'teleported squad to WHITE SILENCE' });

    expect(simulation.adminSetWorld('null_garden')).toBe(true);
    snapshot = simulation.createSnapshot();
    expect(snapshot.world?.id).toBe('null_garden');
    expect(snapshot.bridge?.state).toBe('terminal');
    expect(snapshot.players.every(player => player.weaponStates.every(weapon => weapon.level >= 4))).toBe(true);
    expect(simulation.adminSetWorld('null_garden')).toBe(false);
  });
});
