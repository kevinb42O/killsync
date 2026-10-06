import { describe, expect, it } from 'vitest';
import { FriendsTerrain, FRIENDS_STEP_HEIGHT } from '../world/FriendsTerrain';
import { friendsBuildCeiling, friendsBuildFloor, resolveFriendsBuildCollisions, type FriendsBuildPiece } from './FriendsBuilding';
import { advancePlayerMovement, COOP_PLAYER_RADIUS, COOP_STEP_MS, PLAYER_JUMP_BUFFER_MS, type PlayerMotionState } from './playerMovement';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { FriendsSimulation } from './FriendsSimulation';
import { LocalPlayerPrediction } from './LocalPlayerPrediction';

const command = (sequence: number, overrides: Partial<MultiplayerInputFrame> = {}): MultiplayerInputFrame => ({
  type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence, clientTime: 0,
  movement: 1, aimAngle: 0, aimPitch: 32768, selectedSlot: 0, firing: false,
  sprinting: false, sliding: false, reviving: false, jumpPressed: false, dashPressed: false, ...overrides,
});
const actor = (extra: Partial<PlayerMotionState> = {}): PlayerMotionState => ({
  x: 11975, y: 12016, z: 0, angle: 0, sprinting: false, sliding: false, crouching: false,
  verticalVelocity: 0, lastJumpSequence: -1, slideAngle: 0, ...extra,
});
const transport = { elevationAware: true, volumetric: true, ceiling: 6000, stepHeight: FRIENDS_STEP_HEIGHT };
const piece = (shape: FriendsBuildPiece['shape'], extra: Partial<FriendsBuildPiece> = {}): FriendsBuildPiece => ({
  id: 1, shape, x: 12032, y: 12016, z: 0, rotation: 0, finish: 'stone', author: 'Host', revision: 1, ...extra,
});
function terrainFixture() {
  const terrain = new FriendsTerrain();
  terrain.addGrade([12000, 12000, 0, 512]);
  return terrain;
}
function move(p: PlayerMotionState, input: MultiplayerInputFrame | undefined, dt = COOP_STEP_MS, terrain = terrainFixture(), pieces: FriendsBuildPiece[] = []) {
  advancePlayerMovement(p, input, dt,
    (position, radius) => {
      const ground = terrain.collide(position, p.z, radius);
      return resolveFriendsBuildCollisions(pieces, position, p.z, radius) || ground;
    }, (position, radius) => terrain.wallContact(position, p.z, radius),
    position => Math.max(terrain.floor(position.x, position.y, p.z) ?? -Infinity, friendsBuildFloor(pieces, position.x, position.y, p.z) ?? -Infinity),
    'friends_frontier', { ...transport, overhead: position => Math.min(terrain.ceiling(position.x, position.y, position.z) ?? Infinity, friendsBuildCeiling(pieces, position.x, position.y, position.z) ?? Infinity) });
}

describe('Friends movement controller', () => {
  it.each([32, 64, 160])('requires a jump at a %i-unit terrain face even while sprinting', height => {
    const terrain = terrainFixture();
    for (let z = 0; z < height / 32; z++) terrain.set(375, 375, z, 2);
    const p = actor();
    for (let i = 1; i <= 90; i++) move(p, command(i, { sprinting: true }), COOP_STEP_MS, terrain);
    expect(p.x).toBeCloseTo(12000 - COOP_PLAYER_RADIUS);
    expect(p.z).toBe(0);
    expect(p.velocityX).toBeCloseTo(0);
  });

  it.each(['half', 'cube', 'wall'] as const)('blocks walking up a built %s', shape => {
    const p = actor();
    for (let i = 1; i <= 60; i++) move(p, command(i), COOP_STEP_MS, undefined, [piece(shape)]);
    expect(p.x).toBeLessThanOrEqual(12000 - COOP_PLAYER_RADIUS + .001);
    expect(p.z).toBe(0);
  });

  it('jumps onto a block, lands on its actual top, and jumps again', () => {
    const p = actor(), terrain = terrainFixture(), blocks = [piece('cube')];
    move(p, command(1, { jumpPressed: true }), COOP_STEP_MS, terrain, blocks);
    let reachedTop = false;
    for (let i = 2; i <= 36; i++) {
      move(p, command(i, { movement: p.x < 12030 ? 1 : (p.velocityX ?? 0) > 0 ? 2 : 0 }), COOP_STEP_MS, terrain, blocks);
      if (p.z === 64 && p.verticalVelocity === 0) { reachedTop = true; break; }
    }
    expect(reachedTop).toBe(true);
    move(p, command(40, { movement: 0, jumpPressed: true }), COOP_STEP_MS, terrain, blocks);
    expect(p.z).toBeGreaterThan(64);
    expect(p.lastJumpSequence).toBe(40);
  });

  it.each(['ramp', 'long_ramp', 'stairs'] as const)('walks smoothly up a %s without jumping', shape => {
    const p = actor({ x: shape === 'long_ramp' ? 11940 : 11975 }), terrain = terrainFixture(), route = [piece(shape)];
    let peak = 0;
    for (let i = 1; i <= 18; i++) {
      move(p, command(i), COOP_STEP_MS, terrain, route);
      peak = Math.max(peak, p.z);
    }
    expect(p.x).toBeGreaterThan(12060);
    expect(peak).toBeGreaterThanOrEqual(30);
    expect(p.lastJumpSequence).toBe(-1);
  });

  it('never treats a nearby higher floor as a landing from underneath', () => {
    const p = actor({ z: 25, verticalVelocity: -10 });
    advancePlayerMovement(p, command(1, { movement: 0 }), COOP_STEP_MS, undefined, undefined, () => 32, 'friends_frontier', transport);
    expect(p.z).toBeLessThan(25);
    expect(p.verticalVelocity).toBeLessThan(0);
  });

  it('wall-jumps away from the actual terrain face while moving diagonally', () => {
    const terrain = terrainFixture();
    terrain.set(375, 375, 0, 2); terrain.set(375, 375, 1, 2);
    const p = actor({ x: 12000 - COOP_PLAYER_RADIUS, z: 20 });
    move(p, command(1, { movement: 9, jumpPressed: true }), COOP_STEP_MS, terrain);
    expect(p.lastWallJumpSequence).toBe(1);
    expect(p.wallJumpDirectionX).toBeCloseTo(-1);
    expect(p.wallJumpDirectionY).toBeCloseTo(0);
    expect(p.velocityX).toBeLessThan(0);
    expect(p.z).toBeGreaterThan(20);
  });

  it('accelerates quickly, brakes smoothly, and preserves takeoff momentum', () => {
    const p = actor();
    move(p, command(1));
    expect(p.velocityX).toBeGreaterThan(100);
    expect(p.velocityX).toBeLessThan(300);
    for (let i = 2; i <= 12; i++) move(p, command(i));
    expect(p.velocityX).toBeGreaterThan(299);
    move(p, command(13, { jumpPressed: true, movement: 0 }));
    const airborneSpeed = p.velocityX!;
    move(p, command(14, { movement: 0 }));
    expect(p.velocityX).toBeCloseTo(airborneSpeed);
    for (let i = 15; i <= 45; i++) move(p, command(i, { movement: 0 }));
    expect(p.velocityX).toBe(0);
  });

  it('preserves sprint speed while steering forward through a jump', () => {
    const p = actor();
    for (let i = 1; i <= 12; i++) move(p, command(i, { sprinting: true }));
    move(p, command(13, { sprinting: true, jumpPressed: true }));
    for (let i = 14; i <= 18; i++) move(p, command(i, { sprinting: true }));
    expect(p.velocityX).toBeGreaterThan(490);
    expect(p.z).toBeGreaterThan(0);
  });

  it('allows the shallow boarding lip only when identified as a passenger deck', () => {
    const p = actor();
    advancePlayerMovement(p, undefined, COOP_STEP_MS, undefined, undefined, () => 14, 'friends_frontier', {
      ...transport, boardingFloor: () => 14,
    });
    expect(p.z).toBe(14);
    const block = actor();
    advancePlayerMovement(block, undefined, COOP_STEP_MS, undefined, undefined, () => 14, 'friends_frontier', transport);
    expect(block.z).toBeLessThan(0);
  });

  it('slides along a wall without storing velocity into it or losing tangential motion', () => {
    const p = actor({ x: 12000 - COOP_PLAYER_RADIUS, y: 11980 }), wall = piece('wall', { y: 12000 });
    // A long side wall with its thin face across the forward axis.
    wall.rotation = 1; wall.x = 12004;
    for (let i = 1; i <= 8; i++) move(p, command(i, { movement: 9 }), COOP_STEP_MS, undefined, [wall]);
    expect(p.x).toBeLessThan(12000);
    expect(p.y).toBeGreaterThan(12025);
    expect(p.velocityY).toBeGreaterThan(150);
  });

  it('allows a jump just after leaving a ledge and consumes that grace once', () => {
    const p = actor({ z: 64 }), ledge = piece('cube', { x: 11943 });
    move(p, command(1, { movement: 0 }), COOP_STEP_MS, undefined, [ledge]);
    p.x = 11990;
    move(p, command(2, { movement: 0 }), COOP_STEP_MS, undefined, [ledge]);
    move(p, command(3, { movement: 0, jumpPressed: true }), COOP_STEP_MS, undefined, [ledge]);
    expect(p.lastJumpSequence).toBe(3);
    expect(p.verticalVelocity).toBeGreaterThan(0);
    const risingVelocity = p.verticalVelocity;
    move(p, command(4, { movement: 0, jumpPressed: true }), COOP_STEP_MS, undefined, [ledge]);
    expect(p.verticalVelocity).toBeLessThan(risingVelocity);
    expect(p.lastJumpSequence).toBe(3);
  });

  it('buffers a jump shortly before landing and does not repeat a held command', () => {
    const p = actor({ z: 12, verticalVelocity: -200 });
    move(p, command(1, { movement: 0, jumpPressed: true }));
    for (let i = 0; i < 3; i++) move(p, command(1, { movement: 0, jumpPressed: true }));
    expect(p.lastJumpSequence).toBe(1);
    expect(p.verticalVelocity).toBeGreaterThan(0);
    for (let i = 0; i < 36; i++) move(p, command(1, { movement: 0, jumpPressed: true }));
    expect(p.z).toBe(0);
    expect(p.jumpBufferMs).toBe(0);
  });

  it('expires an early jump press before landing', () => {
    const p = actor({ z: 120, verticalVelocity: 0 });
    move(p, command(1, { movement: 0, jumpPressed: true }));
    for (let i = 2; i <= Math.ceil(PLAYER_JUMP_BUFFER_MS / COOP_STEP_MS) + 30; i++) move(p, command(i, { movement: 0 }));
    expect(p.lastJumpSequence).toBe(-1);
    expect(p.z).toBe(0);
  });

  it('turns a held slide into a crouch after its burst, with no automatic retrigger', () => {
    const p = actor();
    const slide = (i: number) => command(i, { sprinting: true, sliding: true });
    move(p, slide(1));
    const launchSpeed = p.velocityX!;
    expect(p.sliding).toBe(true);
    for (let i = 2; i <= 35; i++) move(p, slide(i));
    expect(p.velocityX).toBeLessThan(launchSpeed);
    expect(p.sliding).toBe(false);
    expect(p.crouching).toBe(true);
    move(p, command(36)); move(p, slide(37));
    expect(p.sliding).toBe(true);
  });

  it('matches motion across 30, 60 and 120 Hz updates', () => {
    const samples = [30, 60, 120].map(hz => {
      const p = actor();
      for (let i = 0; i < hz; i++) move(p, command(1, { sprinting: true }), 1000 / hz);
      return p;
    });
    for (const p of samples.slice(1)) {
      expect(p.x).toBeCloseTo(samples[0].x, 5);
      expect(p.velocityX).toBeCloseTo(samples[0].velocityX!, 5);
      expect(p.z).toBe(samples[0].z);
    }
  });

  it('replays momentum and jump timing after authoritative reconciliation', () => {
    const host = new FriendsSimulation([{ id: 'host', label: 'Host', color: '#fff' }]);
    const p = host['players'].get('host')!;
    Object.assign(p, actor());
    host['friendsFrontier']!.terrain.addGrade([12000, 12000, 0, 512]);
    const prediction = new LocalPlayerPrediction('host');
    prediction.reconcile(host.createSnapshot());
    for (let i = 1; i <= 15; i++) prediction.step(command(i, { jumpPressed: i === 8, movement: i > 8 ? 9 : 1 }));
    for (let i = 1; i <= 6; i++) { host.setInput('host', command(i)); host.tick(COOP_STEP_MS); }
    prediction.reconcile(host.createSnapshot());
    for (let i = 7; i <= 15; i++) { host.setInput('host', command(i, { jumpPressed: i === 8, movement: i > 8 ? 9 : 1 })); host.tick(COOP_STEP_MS); }
    const actual = host.createSnapshot();
    const presented = prediction.present(actual, command(15), 0, 0).players[0];
    expect(presented.x).toBeCloseTo(p.x, 5);
    expect(presented.y).toBeCloseTo(p.y, 5);
    expect(presented.z).toBeCloseTo(p.z, 5);
    expect(presented.motion?.velocityX).toBeCloseTo(actual.players[0].motion!.velocityX!, 5);
  });
});
