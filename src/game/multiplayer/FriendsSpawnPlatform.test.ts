import { describe, expect, it } from 'vitest';
import { FriendsTerrain, FRIENDS_SPAWN_PLATFORM as platform, TERRAIN_GENERATION, type TerrainEdit } from '../world/FriendsTerrain';
import { volumeChunksAround } from '../rendering/FriendsTerrainStreaming';
import { FriendsFrontier } from './FriendsFrontier';
import { FriendsBuilding, friendsPlacementError } from './FriendsBuilding';
import { FriendsSimulation } from './FriendsSimulation';

const host = { id: 'host', label: 'Host', color: '#8de6ce' };
function excavatedSave() {
  const saved = new FriendsFrontier().snapshot(), edits: TerrainEdit[] = [];
  for (let vx = (platform.x-platform.size/2)/32; vx < (platform.x+platform.size/2)/32; vx++)
    for (let vy = (platform.y-platform.size/2)/32; vy < (platform.y+platform.size/2)/32; vy++)
      for (let vz = -16; vz < platform.top/32; vz++) edits.push([vx, vy, vz, 0]);
  // An old soil obstruction at head height must also yield to the safe spawn.
  edits.push([Math.floor(platform.x/32), Math.floor(platform.y/32), platform.top/32, 1]);
  return { ...saved, terrain: { generation: TERRAIN_GENERATION, revision: 4, edits } };
}

describe('permanent Friends spawn platform', () => {
  it('repairs saved excavations and obstructions, keeping the deck immutable after reload', () => {
    const terrain = new FriendsTerrain(excavatedSave().terrain);
    for (let x = platform.x-128; x <= platform.x+128; x += 32)
      for (let y = platform.y-128; y <= platform.y+128; y += 32) {
        const vx = Math.floor(x/32), vy = Math.floor(y/32);
        expect(terrain.floor(x, y, platform.top, 0)).toBe(platform.top);
        expect(terrain.supports(x, y, platform.top)).toBe(true);
        expect(terrain.material(vx, vy, platform.top/32-2)).toBe(2);
        expect(terrain.set(vx, vy, platform.top/32-1, 0)).toBe(false);
        expect(terrain.set(vx, vy, platform.top/32-2, 0)).toBe(false);
        expect(terrain.set(vx, vy, platform.top/32, 1)).toBe(false);
      }
    expect(terrain.ceiling(platform.x, platform.y, platform.top)).toBeUndefined();
    expect(new FriendsTerrain(terrain.snapshot()).floor(platform.x, platform.y, platform.top)).toBe(platform.top);
    // Excavation beside and underneath the deck still works.
    expect(terrain.set(178, Math.floor(platform.y/32), platform.top/32-1, 0)).toBe(true);
    expect(terrain.set(Math.floor(platform.x/32), Math.floor(platform.y/32), platform.top/32-3, 0)).toBe(true);
  });

  it('puts arrivals, late joins, home teleports and repeated fall recovery on the deck', () => {
    const simulation = new FriendsSimulation([host], undefined, undefined, undefined, undefined, excavatedSave());
    for (let i = 1; i < 5; i++) expect(simulation.addPlayer({ ...host, id: `guest${i}` })).toBe(true);
    for (let i = 0; i < 20; i++) simulation.tick(50);
    expect(simulation.createSnapshot().players.every(p => p.z === platform.top)).toBe(true);
    const player = simulation['players'].get(host.id)!;
    for (let i = 0; i < 3; i++) {
      Object.assign(player, { x: 12000, y: 12000, z: -700, verticalVelocity: -800 });
      simulation.tick(50);
      expect(player.z).toBe(platform.top);
      expect(player.verticalVelocity).toBe(0);
      for (let j = 0; j < 20; j++) simulation.tick(50);
      expect(player.z).toBe(platform.top);
    }
    Object.assign(player, { x: 12000, y: 12000, z: 900 });
    expect(simulation.friendsAction(host.id, { requestId: 1, action: 'home' }).ok).toBe(true);
    expect(player.z).toBe(platform.top);
  });

  it('rejects mining, soil placement and construction that blocks the spawn', () => {
    const frontier = new FriendsFrontier();
    const actor = { ...host, x: platform.x, y: platform.y, z: platform.top, lifeState: 'alive' };
    const ray = { x: actor.x+64, y: actor.y, z: platform.top+26, dx: 0, dy: 0, dz: -1 };
    const materials = { ...frontier.pack(actor) };
    for (const [index, [tool, fill]] of ([[2, false], [3, false], [3, true]] as const).entries()) {
      frontier.tool(actor, tool, ray, 1000+index*500, [], true, [], undefined, fill);
      expect(frontier.snapshot().feedback.host.message).toMatch(/spawn platform/);
    }
    expect(frontier.pack(actor)).toEqual(materials);
    expect(frontier.snapshot().mined).toBe(0);
    const pose = { x: platform.x, y: platform.y, z: platform.top, rotation: 0 };
    expect(friendsPlacementError([], 'block', pose)).toMatch(/spawn platform/);
    expect(friendsPlacementError([], 'block', { ...pose, z: platform.top+32 }, undefined, [], undefined, true)).toMatch(/spawn platform/);
    const building = new FriendsBuilding({ pieces: [{ ...pose, id: 1, shape: 'block', finish: 'stone', author: 'Host', revision: 1 }] });
    expect(building.getPieces()).toHaveLength(0);
    const chunks = volumeChunksAround(platform.x, platform.y, new Set(), false);
    expect(chunks.has(`${Math.floor(platform.x/512)},${Math.floor(platform.y/512)}`)).toBe(true);
  });
});
