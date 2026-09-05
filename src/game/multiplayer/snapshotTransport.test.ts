import { describe, expect, it } from 'vitest';
import { encodeSnapshotPackets, MAX_SNAPSHOT_BYTES, SnapshotAssembler } from './snapshotTransport';

describe('snapshot packet transport', () => {
  it('reassembles a large UTF-8 snapshot out of order with duplicate packets', () => {
    const message = JSON.stringify({ tick: 7, payload: 'combat-event-'.repeat(15_000) });
    const packets = encodeSnapshotPackets(message, 7);
    expect(packets.length).toBeGreaterThan(10);
    expect(packets.every(packet => packet.byteLength <= 12020)).toBe(true);
    const assembler = new SnapshotAssembler();
    expect(assembler.push(packets[0], 0)).toBeUndefined();
    expect(assembler.push(packets[0], 1)).toBeUndefined();
    let received: string | undefined;
    for (const packet of packets.slice(1).reverse()) received = assembler.push(packet, 2) ?? received;
    expect(received).toBe(message);
    expect(assembler.push(packets[0], 3)).toBeUndefined();
  });

  it('does not let a lost or stale snapshot block a newer complete one', () => {
    const assembler = new SnapshotAssembler();
    const old = encodeSnapshotPackets('x'.repeat(30_000), 1);
    assembler.push(old[0], 0);
    expect(assembler.push(encodeSnapshotPackets('new snapshot', 2)[0], 50)).toBe('new snapshot');
    for (const packet of old) expect(assembler.push(packet, 100)).toBeUndefined();
  });

  it('bounds memory and rejects oversized or malformed packets', () => {
    expect(encodeSnapshotPackets('x'.repeat(MAX_SNAPSHOT_BYTES + 1), 1)).toEqual([]);
    const assembler = new SnapshotAssembler();
    expect(assembler.push(new ArrayBuffer(3), 0)).toBeUndefined();
    for (let tick = 0; tick < 20; tick++) assembler.push(encodeSnapshotPackets('x'.repeat(30_000), tick)[0], tick);
    expect(assembler['pending'].size).toBe(3);
    assembler.push(new ArrayBuffer(3), 2000);
    expect(assembler['pending'].size).toBe(0);
  });
});