import { describe, expect, it } from 'vitest';
import { FriendsSimulation } from './FriendsSimulation';
import { FriendsExpedition, normalizeFriendsProgress } from './FriendsExpedition';
import { CAVE_ROOMS, CAVE_ROUTES, CAVE_TREASURES, nearbyCaveTreasure } from '../world/FriendsCave';
import { FriendsTerrain } from '../world/FriendsTerrain';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { quantizeAngle, quantizePitch } from './CoopSimulation';
import { compactSnapshotWirePayload, createSnapshotDelta, SnapshotDecoder } from './snapshotReplication';

const seeds = [{ id: 'host', label: 'Host', color: '#8de6ce' }, { id: 'guest', label: 'Friend', color: '#d4b3ff' }];
const input = (sequence: number): MultiplayerInputFrame => ({ type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence, clientTime: 0, movement: 0, aimAngle: quantizeAngle(0), aimPitch: quantizePitch(0), selectedSlot: 0, firing: false, fireActionId: 0, interactActionId: sequence, sprinting: false, sliding: false, reviving: false, jumpPressed: false, dashPressed: false });

describe('shared cave treasure', () => {
  it('places valuable treasures on solid floors across a massive connected labyrinth', () => {
    expect(CAVE_ROOMS.length).toBeGreaterThanOrEqual(40);
    expect(CAVE_ROUTES.length).toBeGreaterThanOrEqual(50);
    expect(CAVE_TREASURES.length).toBeGreaterThanOrEqual(70);
    const terrain = new FriendsTerrain();
    for (const t of CAVE_TREASURES) {
      expect(terrain.supports(t.x, t.y, t.z), t.id).toBe(true);
      expect(terrain.ceiling(t.x, t.y, t.z)! - t.z).toBeGreaterThanOrEqual(96);
    }
    expect(CAVE_TREASURES.reduce((sum, t) => sum + t.gold, 0)).toBeGreaterThan(2_000_000);
  });
  it('awards one shared reward when two players open the same chest, and replicates it', () => {
    const sim = new FriendsSimulation(seeds), t = CAVE_TREASURES[0];
    for (const player of sim['players'].values()) Object.assign(player, { x: t.x, y: t.y, z: t.z });
    const before = sim.createSnapshot();
    sim.setInput('host', input(1)); sim.setInput('guest', input(1)); sim.tick(50);
    const after = sim.createSnapshot(), progress = after.friends!.progress;
    expect(progress.openedTreasures).toEqual([t.id]); expect(progress.caveGold).toBe(t.gold);
    expect(after.players.map(p => p.coins)).toEqual(before.players.map(p => p.coins));
    sim.tick(50); expect(sim.createSnapshot().friends!.progress.caveGold).toBe(t.gold);
    const decoder = new SnapshotDecoder();
    decoder.decode(compactSnapshotWirePayload({format:'coop_snapshot_full',snapshot:before}),1);
    expect(decoder.decode(compactSnapshotWirePayload(createSnapshotDelta(before, after,1)),2)!.friends!.progress).toEqual(progress);
    const restored = new FriendsExpedition(JSON.parse(JSON.stringify(progress)));
    expect(restored.snapshot().progress.caveGold).toBe(t.gold);
    expect(restored.interact({ id: 'host', ...t, lifeState: 'alive' }, 0)).toBeUndefined();
  });
  it('rejects remote, dead, different-floor and obstructed interactions', () => {
    const t = CAVE_TREASURES[0], terrain = new FriendsTerrain(), e = new FriendsExpedition(undefined, undefined, terrain);
    expect(e.interact({ id: 'host', ...t, x: t.x + 200, lifeState: 'alive' }, 0)).toBeUndefined();
    expect(e.interact({ id: 'host', ...t, lifeState: 'downed' }, 0)).toBeUndefined();
    expect(nearbyCaveTreasure({ ...t, z: t.z + 96 })).toBeUndefined();
    terrain.set(Math.floor(t.x / 32), Math.floor(t.y / 32), Math.floor((t.z + 28) / 32), 2);
    expect(e.interact({ id: 'host', ...t, lifeState: 'alive' }, 0)).toBeUndefined();
    expect(e.progress.caveGold).toBe(0);
  });
  it('migrates old saves and filters duplicate/unknown chest IDs without minting gold', () => {
    expect(normalizeFriendsProgress({}).caveGold).toBe(0);
    const t = CAVE_TREASURES[0];
    const p = normalizeFriendsProgress({ openedTreasures: [t.id, t.id, 'fake'], caveGold: Number.MAX_SAFE_INTEGER });
    expect(p.openedTreasures).toEqual([t.id]); expect(p.caveGold).toBe(t.gold);
  });
});
