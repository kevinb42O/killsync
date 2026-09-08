import { describe, expect, it } from 'vitest';
import { WORLD_IDS } from '../world/WorldDefinitions';
import { CoopSimulation, quantizeAngle, quantizePitch } from './CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION } from './protocol';

describe('co-op world sessions', () => {
  for (const worldId of WORLD_IDS) {
    it(`creates collision-safe authored systems for ${worldId}`, () => {
      const simulation = new CoopSimulation([{ id: 'p1', label: 'ONE', color: '#22d3ee' }], 73, `world-${worldId}`, worldId);
      for (let tick = 0; tick < 12; tick++) simulation.tick(33);
      const snapshot = simulation.createSnapshot();
      expect(snapshot.world?.id).toBe(worldId);
      expect(snapshot.players).toHaveLength(1);
      expect(snapshot.buyStations).toHaveLength(3);
      expect(snapshot.fieldMissions?.sites).toHaveLength(5);
      expect(snapshot.fieldMissions?.sites.map(site => site.kind).sort()).toEqual([
        'courier_intercept', 'demolition', 'hostage_recovery', 'signal_hijack', 'toxic_hunt',
      ]);
      const toxicSite = snapshot.fieldMissions!.sites.find(site => site.kind === 'toxic_hunt')!;
      expect(snapshot.enemies.some(enemy => enemy.missionId === toxicSite.id && enemy.archetypeName === 'CHEM COMMANDER')).toBe(true);
      expect(snapshot.enemies.filter(enemy => enemy.missionId === toxicSite.id && enemy.missionRole === 'guard').length).toBeGreaterThan(0);
      expect(snapshot.bridge?.sourceWorldId).toBe(worldId);
      expect(snapshot.bridge?.state).toBe(worldId === 'null_garden' ? 'terminal' : 'building');
    });
  }

  it.each([
    ['cinderworks', 3, 'artillery'],
    ['white_silence', 1, 'shockwave'],
    ['null_garden', 2, 'gravity'],
  ] as const)('creates bounded environmental hazards for %s', (worldId, expectedCount, firstKind) => {
    const simulation = new CoopSimulation([{ id: 'p1', label: 'ONE', color: '#22d3ee' }], 81, `hazard-${worldId}`, worldId);
    const internals = simulation as any;
    internals.nextWorldHazardAtMs = 0;
    simulation.tick(33);
    const hazards = simulation.createSnapshot().hazards || [];
    expect(hazards).toHaveLength(expectedCount);
    expect(hazards[0].kind).toBe(firstKind);
    expect(hazards.every(hazard => hazard.enemyId === 0)).toBe(true);
  });

  it.each([
    ['cinderworks', 'Kiln Marshal', ['artillery', 'artillery']],
    ['white_silence', 'Rime Matriarch', ['artillery', 'artillery', 'artillery']],
    ['null_garden', 'Bloom Tyrant', ['ambush']],
  ] as const)('gives the first %s boss its own identity and opening pattern', (worldId, bossName, expectedKinds) => {
    const simulation = new CoopSimulation([{ id: 'p1', label: 'ONE', color: '#22d3ee' }], 85, `boss-${worldId}`, worldId);
    const internals = simulation as any;
    internals.runDirector.startContract({ x: 6_000, y: 6_000 });
    internals.runDirector.addUplinkProgress(100);
    internals.spawnRunBoss();
    expect(simulation.createSnapshot().run.boss?.displayName).toBe(bossName);
    internals.nextBossAbilityAtMs = 0;
    internals.updateBossMechanics();
    expect(simulation.createSnapshot().hazards?.map(hazard => hazard.kind)).toEqual(expectedKinds);
  });

  it.each([
    ['neon_bastion', 100],
    ['cinderworks', 132],
    ['white_silence', 168],
    ['null_garden', 215],
  ] as const)('pays the displayed world loot multiplier in %s', (worldId, expectedReward) => {
    const simulation = new CoopSimulation([{ id: 'p1', label: 'ONE', color: '#22d3ee' }], 82, `loot-${worldId}`, worldId);
    const before = simulation.createSnapshot().players[0].coins;
    (simulation as any).awardCredits(100);
    expect(simulation.createSnapshot().players[0].coins - before).toBe(expectedReward);
  });

  it('builds a physical worldlink and hot-swaps into the next world', () => {
    const simulation = new CoopSimulation([{ id: 'p1', label: 'ONE', color: '#22d3ee' }], 91);
    const internals = simulation as any;
    const bridge = simulation.createSnapshot().bridge!;
    internals.players.get('p1').x = bridge.buildX;
    internals.players.get('p1').y = bridge.buildY;
    simulation.adminGive(['p1'], 'fabricator', 4);
    for (let segment = 0; segment < bridge.requiredSegments; segment++) {
      expect(simulation.buildStructure('p1', 'bridge_segment', 0, 0, 0, segment + 1)).toBeUndefined();
    }
    const complete = simulation.createSnapshot().bridge!;
    expect(complete.state).toBe('complete');
    expect(simulation.createSnapshot().structures?.filter(structure => structure.type === 'bridge_segment')).toHaveLength(complete.requiredSegments);

    const player = internals.players.get('p1');
    player.x = complete.endX - 60;
    player.y = complete.buildY;
    simulation.setInput('p1', {
      type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence: 1, clientTime: 0,
      movement: 1, aimAngle: quantizeAngle(0), aimPitch: quantizePitch(0), selectedSlot: 0,
      firing: false, reloadPressed: false, aiming: false, sprinting: false, sliding: false,
      reviving: false, jumpPressed: false, dashPressed: false,
    });
    simulation.tick(33);
    const transitioned = simulation.createSnapshot();
    expect(transitioned.world?.id).toBe('cinderworks');
    expect(transitioned.run.phase).toBe('insertion');
    expect(transitioned.structures).toHaveLength(0);
    expect(transitioned.players[0].weaponStates.every(weapon => weapon.level >= 2)).toBe(true);
  });
});
