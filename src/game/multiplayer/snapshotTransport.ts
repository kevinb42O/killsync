const MAGIC = 0x4b53594e;
const HEADER_BYTES = 20;
const CHUNK_BYTES = 12_000;
export const MAX_SNAPSHOT_BYTES = 512_000;

export function encodeSnapshotPackets(message: string, tick: number): ArrayBuffer[] {
  const bytes = new TextEncoder().encode(message);
  if (bytes.length > MAX_SNAPSHOT_BYTES || !Number.isSafeInteger(tick) || tick < 0) return [];
  const count = Math.max(1, Math.ceil(bytes.length / CHUNK_BYTES));
  return Array.from({ length: count }, (_, index) => {
    const chunk = bytes.subarray(index * CHUNK_BYTES, (index + 1) * CHUNK_BYTES);
    const packet = new ArrayBuffer(HEADER_BYTES + chunk.length);
    const header = new DataView(packet);
    header.setUint32(0, MAGIC); header.setFloat64(4, tick); header.setUint16(12, index); header.setUint16(14, count); header.setUint32(16, bytes.length);
    new Uint8Array(packet, HEADER_BYTES).set(chunk);
    return packet;
  });
}

export class SnapshotAssembler {
  private readonly pending = new Map<number, { createdAt: number; totalBytes: number; parts: Map<number, Uint8Array> }>();
  private latestCompletedTick = -1;

  push(packet: ArrayBuffer, now: number): string | undefined {
    for (const [tick, entry] of this.pending) if (now - entry.createdAt > 1000) this.pending.delete(tick);
    if (packet.byteLength <= HEADER_BYTES || packet.byteLength > CHUNK_BYTES + HEADER_BYTES) return;
    const header = new DataView(packet);
    const tick = header.getFloat64(4), index = header.getUint16(12), count = header.getUint16(14), totalBytes = header.getUint32(16);
    if (header.getUint32(0) !== MAGIC || !Number.isSafeInteger(tick) || tick <= this.latestCompletedTick || totalBytes > MAX_SNAPSHOT_BYTES || totalBytes === 0) return;
    if (count !== Math.ceil(totalBytes / CHUNK_BYTES) || index >= count || packet.byteLength - HEADER_BYTES !== Math.min(CHUNK_BYTES, totalBytes - index * CHUNK_BYTES)) return;
    let entry = this.pending.get(tick);
    if (!entry) {
      if (this.pending.size >= 3) {
        const oldestTick = Math.min(...this.pending.keys());
        if (tick < oldestTick) return;
        this.pending.delete(oldestTick);
      }
      entry = { createdAt: now, totalBytes, parts: new Map() };
      this.pending.set(tick, entry);
    }
    if (entry.totalBytes !== totalBytes) return;
    entry.parts.set(index, new Uint8Array(packet, HEADER_BYTES));
    if (entry.parts.size !== count) return;
    const bytes = new Uint8Array(totalBytes);
    for (const [partIndex, part] of entry.parts) bytes.set(part, partIndex * CHUNK_BYTES);
    for (const pendingTick of this.pending.keys()) if (pendingTick <= tick) this.pending.delete(pendingTick);
    try {
      const message = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
      this.latestCompletedTick = tick;
      return message;
    } catch { return; }
  }
}