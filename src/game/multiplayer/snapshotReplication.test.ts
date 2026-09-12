import { describe, expect, it } from 'vitest';
import { CoopSimulation } from './CoopSimulation';
import { compactSnapshotWirePayload, expandSnapshotWirePayload, SnapshotDecoder, SnapshotReplicator, createSnapshotDelta } from './snapshotReplication';

const sim = () => new CoopSimulation([
  { id: 'host', label: 'Host', color: '#0ff' },
  { id: 'guest', label: 'Guest', color: '#f0f' },
], 123);

describe('snapshot replication', () => {
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
