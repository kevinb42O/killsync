import { describe, expect, it, vi } from 'vitest';
import { advancePlayerMovement, COOP_STEP_MS, type PlayerMotionState, type PlayerMovementEnvironment } from './playerMovement';
import { clampInputFrame, MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { CoopSimulation } from './CoopSimulation';
import { FriendsSimulation } from './FriendsSimulation';
import { LocalPlayerPrediction } from './LocalPlayerPrediction';

const seeds = [{ id: 'host', label: 'Host', color: '#fff' }, { id: 'guest', label: 'Guest', color: '#f0f' }];
const input = (sequence: number, extra: Partial<MultiplayerInputFrame> = {}): MultiplayerInputFrame => ({
  type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence, clientTime: 0,
  movement: 0, aimAngle: 0, aimPitch: 32768, selectedSlot: 0,
  firing: false, sprinting: false, sliding: false, reviving: false,
  jumpPressed: false, dashPressed: false, friendsDevSuperjump: true, ...extra,
});
const actor = (extra: Partial<PlayerMotionState> = {}): PlayerMotionState => ({
  x: 11975, y: 12016, z: 0, angle: 0, sprinting: false, sliding: false, crouching: false,
  verticalVelocity: 0, lastJumpSequence: -1, slideAngle: 0, jetFuel: 100, ...extra,
});
const environment: PlayerMovementEnvironment = { elevationAware: true, volumetric: true, ceiling: 6000, devSuperjumpAllowed: true };
function move(player: PlayerMotionState, frame?: MultiplayerInputFrame, extra: Partial<PlayerMovementEnvironment> = {}) {
  advancePlayerMovement(player, frame, COOP_STEP_MS, undefined, undefined, () => 0,
    'friends_frontier', { ...environment, ...extra });
}

describe('Friends developer superjump', () => {
  it('travels thousands of units, with a longer sprint launch and no diagonal bonus', () => {
    const leap = (extra: Partial<MultiplayerInputFrame>) => {
      // An elevated flat course keeps real island lakes out of the range measurement.
      const player = actor({ z: 1024 });
      const step = (frame: MultiplayerInputFrame) => advancePlayerMovement(player, frame, COOP_STEP_MS,
        undefined, undefined, () => 1024, 'friends_frontier', environment);
      step(input(1, { movement: 1, jumpPressed: true, ...extra }));
      for (let tick = 0; tick < 80 && player.z > 1024; tick++) step(input(2, { movement: 1, ...extra }));
      expect(player.z).toBe(1024);
      return Math.hypot(player.x - 11975, player.y - 12016);
    };
    const ordinary = leap({ friendsDevSuperjump: false });
    const distance = leap({});
    expect(distance).toBeGreaterThan(2900);
    expect(distance).toBeGreaterThan(ordinary * 20);
    expect(leap({ sprinting: true })).toBeGreaterThan(4600);
    expect(leap({ movement: 9 })).toBeCloseTo(distance, 4);
  });

  it('keeps launch momentum when movement is released and brakes deliberately in the air', () => {
    const player = actor();
    move(player, input(1, { movement: 1, jumpPressed: true }));
    const speed = Math.hypot(player.velocityX!, player.velocityY!);
    const launchX = player.x;
    for (let tick = 0; tick < 20; tick++) move(player, input(2));
    expect(player.x - launchX).toBeGreaterThan(900);
    expect(Math.hypot(player.velocityX!, player.velocityY!)).toBeCloseTo(speed, 4);
    for (let tick = 0; tick < 15; tick++) move(player, input(3, { sliding: true }));
    expect(Math.hypot(player.velocityX!, player.velocityY!)).toBeLessThan(200);
    expect(player.sliding).toBe(false);
  });

  it('steers around a corner without losing speed and can boost after takeoff', () => {
    const player = actor();
    move(player, input(1, { movement: 1, jumpPressed: true }));
    for (let tick = 0; tick < 15; tick++) move(player, input(2, { movement: 8 }));
    expect(player.velocityY).toBeGreaterThan(1390);
    expect(Math.abs(player.velocityX!)).toBeLessThan(1);
    expect(Math.hypot(player.velocityX!, player.velocityY!)).toBeCloseTo(1400, 4);
    for (let tick = 0; tick < 15; tick++) move(player, input(3, { movement: 8, sprinting: true }));
    expect(player.velocityY).toBeGreaterThan(2000);
    const speed = player.velocityY;
    move(player, input(4, { movement: 8 }));
    expect(player.velocityY).toBeCloseTo(speed!, 4);
  });

  it('cannot tunnel through a wall at boosted speed and settles after landing', () => {
    const player = actor();
    const collide = (position: { x: number; y: number }) => {
      if (position.x <= 12080) return false;
      position.x = 12080; return true;
    };
    const step = (frame: MultiplayerInputFrame) => advancePlayerMovement(player, frame, COOP_STEP_MS,
      collide, undefined, () => 0, 'friends_frontier', environment);
    step(input(1, { jumpPressed: true, movement: 1, sprinting: true }));
    for (let tick = 0; tick < 10; tick++) step(input(2, { movement: 1, sprinting: true }));
    expect(player.x).toBe(12080);
    expect(player.velocityX).toBe(0);
    for (let tick = 0; tick < 90; tick++) step(input(3));
    expect(player).toMatchObject({ z: 0, velocityX: 0, velocityY: 0 });
  });

  it('clears the jet ceiling with a ballistic arc, lands, and consumes a held jump only once', () => {
    const player = actor(), frame = clampInputFrame(input(1, { jumpPressed: true, jetHeld: true }));
    let peak = 0;
    for (let tick = 0; tick < 90; tick++) { move(player, frame); peak = Math.max(peak, player.z); }
    expect(peak).toBeGreaterThan(880);
    expect(peak).toBeLessThan(920);
    expect(player).toMatchObject({ z: 0, verticalVelocity: 0, lastJumpSequence: 1, jetFuel: 100, jetActive: false });
    move(player, input(2, { jumpPressed: true }));
    expect(player.z).toBeGreaterThan(50);
    expect(player.lastJumpSequence).toBe(2);
  });

  it('keeps falling on missing input and restores ordinary jumps when disabled', () => {
    const player = actor();
    move(player, input(1, { jumpPressed: true }));
    for (let tick = 0; tick < 90; tick++) move(player);
    expect(player.friendsDevSuperjump).toBe(true);
    expect(player.z).toBe(0);
    move(player, input(2, { friendsDevSuperjump: false, jumpPressed: true }));
    expect(player.verticalVelocity).toBeLessThan(560);
    let peak = player.z;
    for (let tick = 0; tick < 30; tick++) { move(player, input(3, { friendsDevSuperjump: false })); peak = Math.max(peak, player.z); }
    expect(peak).toBeLessThan(110);
    expect(player.friendsDevSuperjump).toBe(false);
  });

  it('retains solid overhead collision and the world height limit', () => {
    const player = actor(), overhead = vi.fn(() => 180);
    move(player, input(1, { jumpPressed: true }), { overhead });
    for (let tick = 0; tick < 5; tick++) move(player, input(2), { overhead });
    expect(overhead).toHaveBeenCalled();
    expect(player.z).toBeLessThanOrEqual(130);
    expect(player.verticalVelocity).toBeLessThanOrEqual(0);
    const capped = actor();
    move(capped, input(1, { jumpPressed: true }), { ceiling: 200 });
    for (let tick = 0; tick < 6; tick++) move(capped, input(2), { ceiling: 200 });
    expect(capped.z).toBeLessThanOrEqual(200);
    expect(capped.verticalVelocity).toBeLessThanOrEqual(0);
  });

  it('boosts a wall jump without granting repeated airborne jumps', () => {
    const player = actor({ z: 200, verticalVelocity: -100 });
    const wallJump = (frame: MultiplayerInputFrame) => advancePlayerMovement(player, frame, COOP_STEP_MS,
      undefined, () => ({ normalX: -1, normalY: 0 }), () => 0, 'friends_frontier', environment);
    wallJump(input(1, { jumpPressed: true }));
    expect(player.verticalVelocity).toBeGreaterThan(1500);
    expect(player.lastWallJumpSequence).toBe(1);
    expect(player.velocityX).toBeCloseTo(-1400);
    wallJump(input(2, { jumpPressed: true }));
    expect(player.lastWallJumpSequence).toBe(1);
    expect(player.verticalVelocity).toBeLessThan(1500);
  });

  it('keeps free flight in control when both developer modes are enabled', () => {
    const player = actor({ z: 300 });
    move(player, input(1, { friendsDevFlight: true, jumpPressed: true, jetHeld: true }), { devFlightAllowed: true });
    expect(player.z).toBeCloseTo(330);
    expect(player.verticalVelocity).toBe(0);
    expect(player.lastJumpSequence).toBe(-1);
  });

  it('accepts only the Friends host and includes the mode in snapshots', () => {
    const simulation = new FriendsSimulation(seeds);
    simulation['friendsFrontier']!.terrain.addGrade([12000, 12000, 0, 512]);
    for (const id of ['host', 'guest']) Object.assign(simulation['players'].get(id)!, actor());
    const frame = clampInputFrame(input(1, { jumpPressed: true, jetHeld: true }));
    simulation.setInput('host', frame);
    simulation.setInput('guest', frame);
    simulation.tick(COOP_STEP_MS);
    const snapshot = simulation.createSnapshot();
    const host = snapshot.players.find(p => p.id === 'host')!, guest = snapshot.players.find(p => p.id === 'guest')!;
    expect(host.friendsDevSuperjump).toBe(true);
    expect(host.motion.verticalVelocity).toBeGreaterThan(1600);
    expect(guest.friendsDevSuperjump).toBe(false);
    expect(guest.motion.verticalVelocity).toBeLessThan(650);
    expect(frame.friendsDevSuperjump).toBe(true);
    const survival = new CoopSimulation(seeds);
    survival.setInput('host', frame);
    survival.tick(COOP_STEP_MS);
    expect(survival.createSnapshot().players[0].friendsDevSuperjump).toBe(false);
  });

  it('predicts the same ordinary guest jump when a guest requests superjump', () => {
    const simulation = new FriendsSimulation(seeds), prediction = new LocalPlayerPrediction('guest');
    prediction.reconcile(simulation.createSnapshot());
    let frame = input(1);
    for (let sequence = 1; sequence <= 10; sequence++) {
      frame = clampInputFrame(input(sequence, { jumpPressed: sequence === 1, movement: 1 }));
      prediction.step(frame); simulation.setInput('guest', frame); simulation.tick(COOP_STEP_MS);
    }
    const snapshot = simulation.createSnapshot(), actual = snapshot.players.find(p => p.id === 'guest')!;
    const predicted = prediction.present(snapshot, frame, 0, 0).players.find(p => p.id === 'guest')!;
    expect(predicted.friendsDevSuperjump).toBe(false);
    expect(predicted.x).toBeCloseTo(actual.x, 5);
    expect(predicted.z).toBeCloseTo(actual.z, 5);
  });
});
