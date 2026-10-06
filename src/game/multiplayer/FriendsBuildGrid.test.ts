import { describe, expect, it } from 'vitest';
import { FRIENDS_BUILD_CATALOG, FRIENDS_FINISHES, FriendsBuilding, friendsPlacementError, getFriendsBuildPose, type FriendsBuildPiece } from './FriendsBuilding';
import { VOXEL_SIZE } from '../world/FriendsTerrain';
import { FRIENDS_TERRAIN_SURFACES } from '../world/FriendsTerrainAppearance';
const block: FriendsBuildPiece = { id: 1, shape: 'block', finish: 'grass', x: 6416, y: 6160, z: 0, rotation: 0, author: 'Host', revision: 1 };
describe('world-sized construction grid', () => {
  it('uses the exact world block size and matching natural colors', () => {
    expect(FRIENDS_BUILD_CATALOG.block).toMatchObject({ w: VOXEL_SIZE, d: VOXEL_SIZE, h: VOXEL_SIZE });
    expect(FRIENDS_BUILD_CATALOG.half_block.h).toBe(VOXEL_SIZE / 2);
    for (const [finish, surface] of Object.entries(FRIENDS_TERRAIN_SURFACES)) expect(FRIENDS_FINISHES[finish as keyof typeof FRIENDS_TERRAIN_SURFACES].color).toBe(surface.color);
  });
  it('adds a block exactly beside each vertical face', () => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const pose = getFriendsBuildPose([block], { x: block.x - dx * 100, y: block.y - dy * 100, z: 16, dx, dy, dz: 0 }, 'block', 0)!;
      expect(pose).toEqual({ x: block.x - dx * 32, y: block.y - dy * 32, z: 0, rotation: 0 });
      expect(friendsPlacementError([block], 'block', pose)).toBeUndefined();
    }
  });
  it('stacks at the selected top and respects the underside height', () => {
    const pose = getFriendsBuildPose([block], { x: block.x + 4, y: block.y - 7, z: 200, dx: 0, dy: 0, dz: -1 }, 'block', 5)!;
    expect(pose).toEqual({ x: block.x, y: block.y, z: 32, rotation: 1 });
    expect(friendsPlacementError([block], 'block', pose)).toBeUndefined();
    const under = getFriendsBuildPose([{ ...block, z: 64 }], { x: block.x, y: block.y, z: 10, dx: 0, dy: 0, dz: 1 }, 'half_block', -1)!;
    expect(under).toEqual({ x: block.x, y: block.y, z: 48, rotation: 3 });
  });
  it('snaps ground centers consistently including negative boundaries', () => {
    expect(getFriendsBuildPose([], { x: -1, y: 32, z: 100, dx: 0, dy: 0, dz: -1 }, 'block', 0)).toEqual({ x: -16, y: 48, z: 0, rotation: 0 });
  });
  it('retains existing saved large structures at their original dimensions', () => {
    const old = { ...block, shape: 'cube' as const, finish: 'stone' as const, x: 6400, y: 6144 };
    expect(new FriendsBuilding({ revision: 1, guestsCanBuild: true, pieces: [old] }).snapshot().pieces[0]).toMatchObject(old);
    expect(FRIENDS_BUILD_CATALOG.cube).toMatchObject({ w: 64, d: 64, h: 64 });
  });
});
