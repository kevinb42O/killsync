import { describe, expect, it } from 'vitest';
import { CoopSimulation } from './CoopSimulation';
import { FriendsSimulation } from './FriendsSimulation';
import { MULTIPLAYER_PROTOCOL_VERSION } from './protocol';
import { compactSnapshotWirePayload, expandSnapshotWirePayload, SnapshotDecoder, SnapshotReplicator, createSnapshotDelta } from './snapshotReplication';

const sim = () => new CoopSimulation([
  { id: 'host', label: 'Host', color: '#0ff' },
  { id: 'guest', label: 'Guest', color: '#f0f' },
], 123);

describe('snapshot replication', () => {
  it.each([6, 7] as const)('broadcasts a real Friends weapon-to-tool %i transition while moving', (friendsTool) => {
    const simulation = new FriendsSimulation([{ id: 'host', label: 'Host', color: '#0ff' }]);
    const input = { type: 'input' as const, version: MULTIPLAYER_PROTOCOL_VERSION, sequence: 1, clientTime: 0, movement: 0, aimAngle: 0, aimPitch: 32768, selectedSlot: 0, firing: false, sprinting: false, sliding: false, reviving: false, jumpPressed: false, dashPressed: false, friendsTool: 0 as const };
    simulation.setInput('host', input); simulation.tick(50);
    const base = simulation.createSnapshot();
    expect(base.players[0].grenades).toBeDefined();
    simulation.setInput('host', { ...input, sequence: 2, movement: 1, friendsTool }); simulation.tick(50);
    const next = simulation.createSnapshot();
    expect(next.players[0].grenades).toBeUndefined();
    const replicator = new SnapshotReplicator(), decoder = new SnapshotDecoder();
    const wire = (payload: unknown) => JSON.parse(JSON.stringify(payload));
    decoder.decode(wire(replicator.payloadFor('guest', base, 1)), 1);
    expect(decoder.decode(wire(replicator.payloadFor('guest', next, 2)), 2)).toEqual(wire(next));
  });

  it('keeps sending deltas when an optional player field becomes undefined', () => {
    const base = sim().createSnapshot();
    const next = structuredClone(base);
    base.players[0].friendsSeat = { vehicleId: 'grand-3', index: 0 };
    next.players[0].friendsSeat = undefined;
    const replicator = new SnapshotReplicator(), decoder = new SnapshotDecoder();
    const transport = (payload: unknown) => expandSnapshotWirePayload(JSON.parse(JSON.stringify(compactSnapshotWirePayload(payload))));
    decoder.decode(transport(replicator.payloadFor('guest', base, 1)), 1);
    const delta = replicator.payloadFor('guest', next, 2);
    expect(delta.format).toBe('coop_snapshot_delta');
    expect(decoder.decode(transport(delta), 2)).toEqual(JSON.parse(JSON.stringify(next)));
    expect(decoder.decode(transport(replicator.payloadFor('guest', next, 3)), 3)?.players[0].friendsSeat).toBeUndefined();
  });

  it('removes cleared nested optional fields after an actual JSON wire round trip', () => {
    const base = sim().createSnapshot(), next = structuredClone(base);
    Object.assign(base.players[0], { testOptional: { active: true, target: 'host' } });
    Object.assign(next.players[0], { testOptional: { active: true, target: undefined } });
    Object.assign(base, { testGlobal: { active: true, target: 'host' }, testArray: ['host', 'guest'] });
    Object.assign(next, { testGlobal: { active: true, target: undefined }, testArray: [undefined, 'guest'] });
    const decoder = new SnapshotDecoder();
    decoder.decode(JSON.parse(JSON.stringify({ format: 'coop_snapshot_full', snapshot: base })), 1);
    const delta = JSON.parse(JSON.stringify(createSnapshotDelta(base, next, 1)));
    expect(decoder.decode(delta, 2)).toEqual(JSON.parse(JSON.stringify(next)));
  });

  it('compacts and expands wire payloads without changing snapshot meaning', () => {
    const snapshot = sim().createSnapshot();
    const wire = { format: 'coop_snapshot_full' as const, snapshot };
    const compact = compactSnapshotWirePayload(wire);
    expect(JSON.stringify(compact).length).toBeLessThan(JSON.stringify(wire).length);
    expect(expandSnapshotWirePayload(compact)).toEqual(wire);
  });

  it('reconstructs a state delta exactly from its keyframe', () => {
    const simulation = sim();
    const base = simulation.createSnapshot();
    simulation.tick(50);
    const next = simulation.createSnapshot();
    const delta = createSnapshotDelta(base, next, 10);
    const decoder = new SnapshotDecoder();
    expect(decoder.decode({ format: 'coop_snapshot_full', snapshot: base }, 10)).toEqual(base);
    expect(decoder.decode(delta, 11)).toEqual(next);
  });

  it('sends a keyframe first, then emits smaller deltas without replaying unchanged combat events', () => {
    const simulation = sim();
    const replicator = new SnapshotReplicator();
    const first = simulation.createSnapshot();
    const keyframe = replicator.payloadFor('guest-peer', first, 1);
    expect(keyframe.format).toBe('coop_snapshot_full');

    simulation.tick(50);
    const second = simulation.createSnapshot();
    const delta = replicator.payloadFor('guest-peer', second, 2);
    expect(delta.format).toBe('coop_snapshot_delta');
    if (delta.format !== 'coop_snapshot_delta') throw new Error('expected delta');
    expect(JSON.stringify(delta).length).toBeLessThan(JSON.stringify(keyframe).length);

    const decoder = new SnapshotDecoder();
    decoder.decode(keyframe, 1);
    expect(decoder.decode(delta, 2)).toEqual(second);
  });

  it('does not require deltas to arrive in order and recovers once their keyframe arrives', () => {
    const simulation = sim();
    const first = simulation.createSnapshot();
    simulation.tick(50);
    const second = simulation.createSnapshot();
    const delta = createSnapshotDelta(first, second, 100);
    const decoder = new SnapshotDecoder();
    expect(decoder.decode(delta, 101)).toBeUndefined();
    expect(decoder.decode({ format: 'coop_snapshot_full', snapshot: first }, 100)).toEqual(first);
    expect(decoder.decode(delta, 101)).toEqual(second);
  });
});
