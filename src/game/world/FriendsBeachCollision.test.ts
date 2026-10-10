import { describe, expect, it } from 'vitest';
import { FriendsTerrain } from './FriendsTerrain';
import { islandCoastDistance } from './FriendsIsland';
import { advancePlayerMovement, type PlayerMotionState } from '../multiplayer/playerMovement';

describe('beach collision above generated mining seams', () => {
  it('keeps the low shoreline surface solid throughout the mining elevation band', () => {
    const terrain = new FriendsTerrain();
    let checked = 0;
    for (let x = 10016; x < 48000; x += 128) for (let y = 16; y < 48000; y += 128) {
      const coast = islandCoastDistance(x, y);
      if (coast < 0 || coast > 700) continue;
      const vx = Math.floor(x / 32), vy = Math.floor(y / 32), top = terrain.height(vx, vy);
      if (top < -224 || top > -64) continue;
      checked++;
      expect(terrain.material(vx, vy, top / 32 - 1), `sand at ${x},${y}`).not.toBe(0);
      expect(terrain.floor(x, y, top, 0), `floor at ${x},${y}`).toBe(top);
    }
    expect(checked).toBeGreaterThan(3000);
  });

  it('holds a player on a beach cell that previously dropped into a seam', () => {
    const terrain = new FriendsTerrain(), x = 11168, y = 912;
    const top = terrain.height(Math.floor(x / 32), Math.floor(y / 32));
    const player: PlayerMotionState = {
      x, y, z: top, angle: 0, sprinting: false, sliding: false, crouching: false,
      verticalVelocity: 0, lastJumpSequence: -1, slideAngle: 0,
    };
    for (let i = 0; i < 60; i++) advancePlayerMovement(player, undefined, 1000 / 30,
      (position, radius) => terrain.collide(position, player.z, radius), undefined,
      position => terrain.floor(position.x, position.y, position.z ?? player.z),
      'friends_frontier', { elevationAware: true, volumetric: true, ceiling: 6000 });
    expect(player.z).toBe(top);
    expect(player.verticalVelocity).toBe(0);
    expect(player.swimming).toBe(false);
  });

  it('retains underground seams and allows players to excavate the protective sand', () => {
    const terrain = new FriendsTerrain(), x = 11168, y = 912;
    const vx = Math.floor(x / 32), vy = Math.floor(y / 32), top = terrain.height(vx, vy);
    expect(terrain.material(vx, vy, -7)).toBe(0);
    expect(terrain.set(vx, vy, top / 32 - 1, 0)).toBe(true);
    expect(terrain.floor(x, y, top, 0)).toBe(-224);
    expect(new FriendsTerrain(terrain.snapshot()).floor(x, y, top, 0)).toBe(-224);
  });
});
