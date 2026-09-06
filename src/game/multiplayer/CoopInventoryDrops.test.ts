import { describe, expect, it } from 'vitest';
import { CoopSimulation, quantizePitch } from './CoopSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION, type MultiplayerInputFrame } from './protocol';

const action = (sequence: number, interactActionId: number): MultiplayerInputFrame => ({
  type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence, clientTime: 0,
  movement: 0, aimAngle: 0, aimPitch: quantizePitch(0), selectedSlot: 0,
  firing: false, aiming: false, sprinting: false, sliding: false, reviving: false,
  jumpPressed: false, dashPressed: false, interactActionId,
});

describe('co-op backpack drops', () => {
  it('drops all cash into shared state and requires a fresh F action to collect it', () => {
    const simulation = new CoopSimulation([
      { id: 'host', label: 'Host', color: '#0ff' },
      { id: 'guest', label: 'Guest', color: '#f0f' },
    ]);
    const host = simulation['players'].get('host')!;
    const guest = simulation['players'].get('guest')!;
    host.coins = 275;

    expect(simulation.dropInventory('host', 'cash')).toBeUndefined();
    const drop = simulation.createSnapshot().items.find(item => item.manualDropKind === 'cash')!;
    expect(host.coins).toBe(0);
    expect(drop).toMatchObject({ value: 275, droppedByPlayerId: 'host', type: 'coin_gold' });

    guest.x = drop.x; guest.y = drop.y;
    simulation.tick(50);
    expect(simulation.createSnapshot().items).toContainEqual(expect.objectContaining({ id: drop.id }));

    simulation.setInput('guest', action(1, 1));
    simulation.tick(50);
    expect(guest.coins).toBe(275);
    expect(simulation.createSnapshot().items.some(item => item.id === drop.id)).toBe(false);
  });

  it('lets the owner recover a dropped self revive but never grants a second one', () => {
    const simulation = new CoopSimulation([{ id: 'host', label: 'Host', color: '#0ff' }]);
    const host = simulation['players'].get('host')!;
    host.selfRevives = 1;

    expect(simulation.dropInventory('host', 'self_revive')).toBeUndefined();
    const drop = simulation.createSnapshot().items.find(item => item.manualDropKind === 'self_revive')!;
    expect(host.selfRevives).toBe(0);
    host.x = drop.x; host.y = drop.y;
    simulation.setInput('host', action(1, 1));
    simulation.tick(50);
    expect(host.selfRevives).toBe(1);
    expect(simulation.createSnapshot().items.some(item => item.id === drop.id)).toBe(false);

    host.selfRevives = 1;
    expect(simulation.dropInventory('host', 'self_revive')).toBeUndefined();
    const secondDrop = simulation.createSnapshot().items.find(item => item.manualDropKind === 'self_revive')!;
    host.selfRevives = 1;
    host.x = secondDrop.x; host.y = secondDrop.y;
    simulation.setInput('host', action(2, 2));
    simulation.tick(50);
    expect(simulation.createSnapshot().items.some(item => item.id === secondDrop.id)).toBe(true);
  });
});
