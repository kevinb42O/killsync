import { describe, expect, it, vi } from 'vitest';
import { advancePlayerMovement, COOP_STEP_MS, type PlayerMotionState } from './playerMovement';
import { clampInputFrame, MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';
import { CoopSimulation, quantizePitch } from './CoopSimulation';
import { FriendsSimulation } from './FriendsSimulation';
import { LocalPlayerPrediction } from './LocalPlayerPrediction';
import { FRIENDS_FLIGHT_CEILING } from './FriendsExpedition';

const seeds = [{ id: 'host', label: 'Host', color: '#fff' }, { id: 'guest', label: 'Guest', color: '#f0f' }];
const input = (sequence: number, extra: Partial<MultiplayerInputFrame> = {}): MultiplayerInputFrame => ({
  type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence, clientTime: 0,
  movement: 0, aimAngle: 0, aimPitch: quantizePitch(0), selectedSlot: 0,
  firing: false, sprinting: false, sliding: false, reviving: false,
  jumpPressed: false, dashPressed: false, friendsDevFlight: true, ...extra,
});
const actor = (extra: Partial<PlayerMotionState> = {}): PlayerMotionState => ({
  x: 12000, y: 12000, z: 300, angle: 0, sprinting: false, sliding: false, crouching: false,
  verticalVelocity: -200, lastJumpSequence: -1, slideAngle: 0, jetFuel: 0, ...extra,
});
const environment = { elevationAware: true, volumetric: true, ceiling: 6000, devFlightAllowed: true };
function move(player: PlayerMotionState, frame?: MultiplayerInputFrame) {
  advancePlayerMovement(player, frame, COOP_STEP_MS, undefined, undefined, undefined, 'friends_frontier', environment);
}

describe('temporary Friends developer free flight', () => {
  it('bypasses all collision, floor, overhead and fuel/height constraints', () => {
    const player = actor({ z: FRIENDS_FLIGHT_CEILING + 100 });
    const collision = vi.fn(() => true), floor = vi.fn(() => 9999), overhead = vi.fn(() => 1);
    advancePlayerMovement(player, input(1, { movement: 1, jetHeld: true }), COOP_STEP_MS,
      collision, undefined, floor, 'friends_frontier', { ...environment, overhead });
    expect(player.x).toBeGreaterThan(12000);
    expect(player.z).toBeGreaterThan(FRIENDS_FLIGHT_CEILING + 100);
    expect(player.jetFuel).toBe(0);
    expect(player.jetActive).toBe(false);
    expect(collision).not.toHaveBeenCalled();
    expect(floor).not.toHaveBeenCalled();
    expect(overhead).not.toHaveBeenCalled();
  });

  it('follows camera pitch, descends with Ctrl, and boosts with Shift', () => {
    const player = actor();
    move(player, input(1, { movement: 1, aimPitch: quantizePitch(Math.PI / 4) }));
    expect(player.x - 12000).toBeCloseTo(player.z - 300, 2);
    const z = player.z;
    move(player, input(2, { friendsDevFlightDown: true }));
    expect(player.z).toBeCloseTo(z - 30);
    move(player, input(3, { jetHeld: true, sprinting: true }));
    expect(player.z).toBeCloseTo(z + 50);
  });

  it('hovers immediately on release or missing input and resumes gravity when disabled', () => {
    const player = actor({ velocityX: 500, platformVelocityZ: 100, jumpBufferMs: 120 });
    move(player, input(1));
    move(player);
    expect(player).toMatchObject({ x: 12000, y: 12000, z: 300, verticalVelocity: 0, velocityX: 0, jumpBufferMs: 0 });
    move(player, input(2, { friendsDevFlight: false }));
    expect(player.friendsDevFlight).toBe(false);
    expect(player.z).toBeLessThan(300);
    expect(player.verticalVelocity).toBeLessThan(0);
  });

  it('ignores flight requests in survival mode', () => {
    const simulation = new CoopSimulation(seeds);
    const player = simulation['players'].get('host')!;
    player.z = 300;
    simulation.setInput('host', input(1, { jetHeld: true }));
    simulation.tick(COOP_STEP_MS);
    expect(player.friendsDevFlight).toBe(false);
    expect(player.z).toBeLessThan(300);
  });

  it('allows only the host to cross map bounds and descend below recovery height', () => {
    const simulation = new FriendsSimulation(seeds);
    const player = simulation['players'].get('host')!;
    Object.assign(player, { x: 1, y: 12000, z: -650 });
    simulation.setInput('host', input(1, { movement: 2, friendsDevFlightDown: true }));
    simulation.tick(COOP_STEP_MS);
    expect(player.lifeState).toBe('alive');
    expect(player.friendsDevFlight).toBe(true);
    expect(player.x).toBeLessThan(0);
    expect(player.z).toBeLessThan(-650);
  });

  it('rejects guest flight before it can release their aircraft cockpit', () => {
    const simulation = new FriendsSimulation(seeds);
    const player = simulation['players'].get('guest')!;
    const expedition = simulation['friends']!;
    const aircraft = expedition.vehicles().find(v => v.kind === 'aircraft')!;
    Object.assign(player, { x: aircraft.x + Math.cos(aircraft.angle) * 100, y: aircraft.y + Math.sin(aircraft.angle) * 100, z: aircraft.z });
    expedition.interact(player, 0);
    const frame = input(1, { friendsDevFlightDown: true });
    simulation.setInput('guest', frame);
    simulation.tick(COOP_STEP_MS);
    expect(player.friendsDevFlight).not.toBe(true);
    expect(expedition.vehicles().find(v => v.kind === 'aircraft')?.pilotId).toBe('guest');
    expect(frame.friendsDevFlight).toBe(true); // Sanitizing must not mutate the sender's frame.
  });

  it('releases the aircraft cockpit when flight is enabled', () => {
    const simulation = new FriendsSimulation(seeds);
    const player = simulation['players'].get('host')!;
    const expedition = simulation['friends']!;
    const aircraft = expedition.vehicles().find(v => v.kind === 'aircraft')!;
    Object.assign(player, { x: aircraft.x + Math.cos(aircraft.angle) * 100, y: aircraft.y + Math.sin(aircraft.angle) * 100, z: aircraft.z });
    expedition.interact(player, 0);
    expect(expedition.vehicles().find(v => v.kind === 'aircraft')?.pilotId).toBe('host');
    const x = player.x;
    simulation.setInput('host', input(1, { movement: 1 }));
    simulation.tick(COOP_STEP_MS);
    expect(expedition.vehicles().find(v => v.kind === 'aircraft')?.pilotId).toBeUndefined();
    expect(player.x).toBeGreaterThan(x);
    expect(player.friendsDevFlight).toBe(true);
  });

  it('predicts ordinary guest movement when a guest requests developer flight', () => {
    const host = new FriendsSimulation(seeds), prediction = new LocalPlayerPrediction('guest');
    prediction.reconcile(host.createSnapshot());
    for (let sequence = 1; sequence <= 10; sequence++) {
      const frame = clampInputFrame(input(sequence, { movement: 9, jetHeld: sequence > 5, sprinting: true, aimPitch: quantizePitch(.4) }));
      prediction.step(frame);
      host.setInput('guest', frame);
      host.tick(COOP_STEP_MS);
    }
    const snapshot = host.createSnapshot();
    const actual = snapshot.players.find(p => p.id === 'guest')!;
    const predicted = prediction.present(snapshot, input(10), 0, 0).players.find(p => p.id === 'guest')!;
    expect(predicted.x).toBeCloseTo(actual.x, 5);
    expect(predicted.y).toBeCloseTo(actual.y, 5);
    expect(predicted.z).toBeCloseTo(actual.z, 5);
    expect(actual.friendsDevFlight).toBe(false);
    expect(predicted.friendsDevFlight).toBe(false);
    prediction.reconcile(snapshot);
    expect(prediction.present(snapshot, input(10), 0, 0).players.find(p => p.id === 'guest')?.z).toBeCloseTo(actual.z, 5);
  });
});
