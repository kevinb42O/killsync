import { describe, expect, it } from 'vitest';
import { CoopSimulation, quantizeAngle, quantizePitch } from './CoopSimulation';
import { LocalPlayerPrediction } from './LocalPlayerPrediction';
import { COOP_STEP_MS } from './playerMovement';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';

const command = (sequence: number, overrides: Partial<MultiplayerInputFrame> = {}): MultiplayerInputFrame => ({
  type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence, clientTime: sequence * COOP_STEP_MS,
  movement: 1, aimAngle: quantizeAngle(Math.PI / 2), aimPitch: quantizePitch(0), selectedSlot: 0,
  firing: false, sprinting: false, sliding: false, reviving: false, jumpPressed: false, dashPressed: false, ...overrides,
});
const simulation = () => new CoopSimulation([{ id: 'guest', label: 'Guest', color: '#0ff' }]);

describe('local player prediction', () => {
  it.each([{}, { sprinting: true }, { sprinting: true, sliding: true }, { jumpPressed: true }])('matches authoritative motion for %j before a network response', overrides => {
    const host = simulation();
    const initial = host.createSnapshot();
    const prediction = new LocalPlayerPrediction('guest');
    prediction.reconcile(initial);
    const input = command(1, overrides);
    prediction.step(input);
    host.setInput('guest', input); host.tick(COOP_STEP_MS);
    const predicted = prediction.present(initial, input, 0, 0).players[0];
    const actual = host.createSnapshot().players[0];
    expect(predicted.x).toBeCloseTo(actual.x);
    expect(predicted.y).toBeCloseTo(actual.y);
    expect(predicted.z).toBeCloseTo(actual.z);
  });

  it('replays only unacknowledged commands after a delayed snapshot', () => {
    const host = simulation();
    const prediction = new LocalPlayerPrediction('guest');
    const initial = host.createSnapshot();
    prediction.reconcile(initial);
    for (let sequence = 1; sequence <= 5; sequence++) prediction.step(command(sequence));
    for (let sequence = 1; sequence <= 2; sequence++) { host.setInput('guest', command(sequence)); host.tick(COOP_STEP_MS); }
    prediction.reconcile(host.createSnapshot());
    for (let sequence = 3; sequence <= 5; sequence++) { host.setInput('guest', command(sequence)); host.tick(COOP_STEP_MS); }
    expect(prediction.present(initial, command(5), 0, 0).players[0].y).toBeCloseTo(host.createSnapshot().players[0].y);
    expect(prediction['pending']).toHaveLength(3);
  });

  it('resets prediction on retry and does not override authoritative death or health', () => {
    const host = simulation();
    const prediction = new LocalPlayerPrediction('guest');
    const initial = host.createSnapshot();
    prediction.reconcile(initial);
    prediction.step(command(1));
    host.tick(COOP_STEP_MS);
    const downed = host.createSnapshot(); downed.players[0].lifeState = 'downed'; downed.players[0].health = 0;
    prediction.reconcile(downed);
    expect(prediction.present(downed, command(2), 0, 16)).toBe(downed);
    prediction.reconcile(initial);
    expect(prediction['pending']).toHaveLength(0);
    expect(prediction.present(initial, command(3, { movement: 0 }), 0, 16).players[0]).toMatchObject({ x: initial.players[0].x, health: 100 });
  });

  it('bounds speculative movement when acknowledgments stop', () => {
    const prediction = new LocalPlayerPrediction('guest');
    prediction.reconcile(simulation().createSnapshot());
    for (let sequence = 1; sequence <= 300; sequence++) prediction.step(command(sequence));
    expect(prediction['pending']).toHaveLength(30);
  });
});