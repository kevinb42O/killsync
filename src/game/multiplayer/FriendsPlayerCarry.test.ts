import { describe, expect, it } from 'vitest';
import { FriendsPlayerCarry, rayCarryPlayer } from './FriendsPlayerCarry';
import { FriendsHauling, type HaulingActor, type HaulingEnvironment } from './FriendsHauling';
import { FriendsSimulation } from './FriendsSimulation';
import { quantizeAngle, quantizePitch } from './CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { LocalPlayerPrediction } from './LocalPlayerPrediction';
import { compactSnapshotWirePayload, createSnapshotDelta, SnapshotDecoder } from './snapshotReplication';
import { CoopSnapshotInterpolator, interpolateCoopSnapshot } from './snapshotInterpolation';
import { FRIENDS_CAMPFIRE } from '../world/FriendsRegion';

const actor = (id: string, x = 0, y = 0, z = 0): HaulingActor => ({ id, x, y, z, lifeState: 'alive' });
const env: HaulingEnvironment = { revision: 'flat', vehicles: [], floor: () => 0, blocked: () => false, collide: () => false };
const input = (sequence: number, extra: Partial<MultiplayerInputFrame> = {}): MultiplayerInputFrame => ({
  type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence, clientTime: 0,
  movement: 0, aimAngle: quantizeAngle(0), aimPitch: quantizePitch(0), selectedSlot: 0,
  firing: false, sprinting: false, sliding: false, reviving: false, jumpPressed: false, dashPressed: false, friendsTool: 5, ...extra,
});
function fixture(active = false) {
  const simulation = new FriendsSimulation([{ id: 'host', label: 'Host', color: '#fff' }, { id: 'guest', label: 'Friend', color: '#f90' }]);
  for (let x = 10800; x <= 12400; x += 400) simulation['friendsFrontier']!.terrain.addGrade([x, 12000, 0, 512]);
  const host = simulation['players'].get('host')!, guest = simulation['players'].get('guest')!;
  Object.assign(host, { x: 12100, y: 12016, z: 0, angle: 0, verticalVelocity: 0 });
  Object.assign(guest, { x: 12220, y: 12016, z: 0, verticalVelocity: 0 });
  if (active) {
    simulation.setInput('guest', input(1, { movement: 1, sprinting: true }));
    simulation.tick(50);
  }
  const beforeAttachVelocity = guest.velocityX;
  simulation.setInput('host', input(1, { firing: true, fireActionId: 1 }));
  simulation.tick(50);
  return { simulation, host, guest, beforeAttachVelocity };
}

describe('assisted teammate rope carry', () => {
  it('aims at a player body within reach, with no hits behind or beside the shot', () => {
    const origin = { x: 0, y: 0, z: 26 }, direction = { x: 1, y: 0, z: 0 };
    expect(rayCarryPlayer(origin, direction, actor('friend', 100), 480)).toBeCloseTo(77);
    expect(rayCarryPlayer(origin, direction, actor('friend', -100), 480)).toBeUndefined();
    expect(rayCarryPlayer(origin, direction, actor('friend', 100, 50), 480)).toBeUndefined();
    expect(rayCarryPlayer(origin, direction, actor('friend', 510), 480)).toBeUndefined();
  });
  it('requires clear sight and rejects duplicate carries and carry cycles', () => {
    const hauling = new FriendsHauling(), host = actor('host', 12000), guest = actor('guest', 12120), third = actor('third', 12220);
    const shoot = (blocked = false) => hauling.shoot(host, { x: 1, y: 0, z: 0 }, { ...env, blocked: () => blocked }, 0, [host, guest]);
    shoot(true); expect(hauling.snapshot().playerRopes).toEqual([]);
    shoot(); expect(hauling.snapshot().playerRopes).toHaveLength(1);
    expect(hauling.playerCarry.canAttach(third, guest)).toBe(false);
    expect(hauling.playerCarry.canAttach(guest, host)).toBe(false);
    shoot(); expect(hauling.snapshot().playerRopes).toEqual([]);
  });
  it('attaches to a seated player immediately without carry messages', () => {
    const hauling = new FriendsHauling(), host = actor('host', 12000), guest = { ...actor('guest', 12120), friendsSeat: { vehicleId: 'train', index: 0 } };
    hauling.shoot(host, { x: 1, y: 0, z: 0 }, env, 0, [host, guest]);
    expect(hauling.snapshot().playerRopes).toHaveLength(1);
    expect(guest.friendsSeat).toBeUndefined(); expect(hauling.snapshot().feedback).toEqual({});
  });
  it('releases pilot controls before attaching a passenger', () => {
    const hauling = new FriendsHauling(), host = actor('host', 12000), guest = actor('guest', 12120);
    const vehicle = { id: 'plane', kind: 'aircraft' as const, x: 12120, y: 0, z: 0, angle: 0, length: 240, width: 100, pilotId: guest.id as string | undefined };
    let released: string | undefined;
    const environment = { ...env, vehicles: [vehicle], releasePassenger: (id: string) => { released = id; vehicle.pilotId = undefined; } };
    hauling.shoot(host, { x: 1, y: 0, z: 0 }, environment, 0, [host, guest]);
    expect(released).toBe(guest.id); expect(hauling.snapshot().playerRopes).toHaveLength(1);
    hauling.playerCarry.update(50, [host, guest], environment);
    expect(hauling.snapshot().playerRopes).toHaveLength(1);
  });
  it('attaches while the friend is actively sprinting, with no AFK requirement or carry UI', () => {
    const { simulation, beforeAttachVelocity } = fixture(true), hauling = simulation.createSnapshot().friends!.hauling!;
    expect(beforeAttachVelocity).toBeGreaterThan(0);
    expect(hauling.playerRopes).toHaveLength(1); expect(hauling.feedback).toEqual({});
  });
  it('follows the travelled path around corners and over elevation without ground collisions', () => {
    const carry = new FriendsPlayerCarry(), host = actor('host', 100), guest = actor('guest');
    carry.attach(host, guest);
    for (let i = 0; i < 40; i++) carry.update(50, [host, guest], env);
    expect(guest.x).toBeCloseTo(44, 2);
    const path: HaulingActor[] = [];
    for (let i = 1; i <= 20; i++) {
      host.y = i * 10; host.z = i * 5;
      carry.update(50, [host, guest], { ...env, collide: () => { throw new Error('Passenger must not get stuck in independent ground physics'); } });
      path.push({ ...guest });
    }
    expect(path.some(p => p.x === 100 && p.y > 0)).toBe(true);
    for (const p of path) {
      if (p.x < 99.999) expect(p.y).toBe(0);
      else expect(p.z).toBeCloseTo(p.y / 2, 5);
    }
    expect(guest.z).toBeGreaterThan(50);
    expect(carry.snapshot()[0].length).toBeCloseTo(56);
  });
  it('catches up gently at maximum range and matches fast flight without stretching away', () => {
    const carry = new FriendsPlayerCarry(), host = actor('host', 480), guest = actor('guest');
    carry.attach(host, guest);
    carry.update(50, [host, guest], env); expect(guest.x).toBeLessThanOrEqual(15);
    for (let i = 0; i < 60; i++) carry.update(50, [host, guest], env);
    const before = guest.x;
    for (let i = 0; i < 50; i++) { host.x += 60; carry.update(50, [host, guest], env); }
    expect(guest.x - before).toBeCloseTo(3000, 1);
    expect(host.x - guest.x).toBeCloseTo(56, 2);
  });
  it('releasing a fast flight carry clears momentum before normal movement resumes', () => {
    const carry = new FriendsPlayerCarry(), host = actor('host', 100), guest = actor('guest');
    carry.attach(host, guest);
    for (let i = 0; i < 50; i++) { host.x += 60; carry.update(50, [host, guest], env); }
    expect(guest.velocityX).toBeGreaterThan(1000);
    carry.release('guest'); expect(guest.velocityX).toBe(0); expect(guest.verticalVelocity).toBe(0);
  });
  it('keeps carrying when the carrier sits aboard a moving train', () => {
    const carry = new FriendsPlayerCarry(), host = { ...actor('host', 100), friendsSeat: undefined as { vehicleId: string; index: number } | undefined }, guest = actor('guest');
    carry.attach(host, guest);
    host.friendsSeat = { vehicleId: 'train', index: 0 };
    for (let i = 0; i < 60; i++) { host.x += 12; host.z += 1; carry.update(50, [host, guest], env); }
    expect(carry.snapshot()).toHaveLength(1);
    expect(Math.hypot(host.x - guest.x, host.z - guest.z)).toBeCloseTo(56, 2);
  });
  it('does not advance the passenger during a zero-duration update', () => {
    const carry = new FriendsPlayerCarry(), host = actor('host', 100), guest = actor('guest');
    carry.attach(host, guest); host.x += 20;
    carry.update(0, [host, guest], env); expect(guest.x).toBe(0);
    carry.update(50, [host, guest], env); expect(guest.x).toBeGreaterThan(0);
  });
  it('releases when the carrier rests at the campfire, where R has its own seated action', () => {
    const carry = new FriendsPlayerCarry(), host = { ...actor('host', 100), friendsSeat: undefined as { vehicleId: string; index: number } | undefined }, guest = actor('guest');
    carry.attach(host, guest); host.friendsSeat = { vehicleId: FRIENDS_CAMPFIRE.id, index: 0 };
    carry.update(50, [host, guest], env);
    expect(carry.snapshot()).toEqual([]); expect(guest.x).toBe(0);
  });
  it.each(['disconnect', 'death', 'teleport'] as const)('releases on %s without snapping or launching the passenger', reason => {
    const carry = new FriendsPlayerCarry(), host = actor('host', 100), guest = actor('guest');
    carry.attach(host, guest);
    if (reason === 'death') host.lifeState = 'eliminated';
    if (reason === 'teleport') host.x += 2000;
    carry.update(50, reason === 'disconnect' ? [guest] : [host, guest], env);
    expect(carry.snapshot()).toEqual([]); expect(guest.x).toBe(0);
    expect(guest.velocityX).toBe(0); expect(guest.velocityY).toBe(0); expect(guest.verticalVelocity).toBe(0);
  });
  it('carries an AFK player through stale inputs, tool changes and a jump in the authoritative game', () => {
    const { simulation, host, guest } = fixture();
    expect(simulation.createSnapshot().friends!.hauling!.playerRopes).toHaveLength(1);
    const before = guest.x; let peak = 0;
    for (let i = 2; i <= 80; i++) {
      simulation.setInput('host', input(i, { movement: 2, friendsTool: 0, sprinting: true, jumpPressed: i === 20 }));
      simulation.tick(50); peak = Math.max(peak, guest.z);
    }
    expect(guest.x).toBeLessThan(before - 500); expect(peak).toBeGreaterThan(10);
    expect(guest.lifeState).toBe('alive'); expect(Math.hypot(host.x - guest.x, host.y - guest.y)).toBeCloseTo(56, 1);
    expect(simulation.createSnapshot().friends!.hauling!.playerRopes).toHaveLength(1);
  });
  it.each(['host', 'guest'])('lets %s release with R even with another tool equipped', id => {
    const { simulation } = fixture();
    simulation.setInput(id, input(2, { friendsTool: 0, reloadPressed: true })); simulation.tick(50);
    expect(simulation.createSnapshot().friends!.hauling!.playerRopes).toEqual([]);
  });
  it('ignores held movement and jet input from a passenger who goes AFK', () => {
    const { simulation, host, guest } = fixture();
    simulation.setInput('guest', input(2, { movement: 1, sprinting: true, jetHeld: true }));
    for (let i = 2; i <= 80; i++) {
      simulation.setInput('host', input(i, { movement: 2, sprinting: true, friendsTool: 0 }));
      simulation.tick(50);
    }
    expect(simulation.createSnapshot().friends!.hauling!.playerRopes).toHaveLength(1);
    expect(guest.x - host.x).toBeCloseTo(56, 2);
    expect(guest.z).toBe(host.z); expect(guest.jetActive).toBe(false);
  });
  it('removes a disconnected carrier immediately', () => {
    const { simulation } = fixture(); simulation.removePlayer('host');
    expect(simulation.createSnapshot().friends!.hauling!.playerRopes).toEqual([]);
  });
  it('replicates the rope and keeps passenger prediction on the interpolated host timeline', () => {
    const { simulation } = fixture(), previous = simulation.createSnapshot();
    simulation.setInput('host', input(2, { movement: 2 })); simulation.tick(50);
    const current = simulation.createSnapshot(), decoder = new SnapshotDecoder();
    decoder.decode(compactSnapshotWirePayload({ format: 'coop_snapshot_full', snapshot: previous }), 1);
    const decoded = decoder.decode(compactSnapshotWirePayload(createSnapshotDelta(previous, current, 1)), 2)!;
    expect(decoded.friends!.hauling!.playerRopes).toEqual(current.friends!.hauling!.playerRopes);
    for (const frame of [interpolateCoopSnapshot(previous, current, .5), new CoopSnapshotInterpolator().interpolate(previous, current, .5)]) {
      const prediction = new LocalPlayerPrediction('guest'); prediction.reconcile(current);
      prediction.step(input(3, { movement: 1, jumpPressed: true }));
      const shown = prediction.present(frame, input(4, { movement: 1 }), 15, 16);
      expect(shown.players.find(p => p.id === 'guest')).toEqual(frame.players.find(p => p.id === 'guest'));
    }
  });
});
