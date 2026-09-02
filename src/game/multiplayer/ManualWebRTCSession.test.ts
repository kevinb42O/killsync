import { describe, expect, it } from 'vitest';
import { clampInputFrame, MULTIPLAYER_PROTOCOL_VERSION } from './protocol';
import { decodeSignal, encodeSignal } from './ManualWebRTCSession';

describe('manual WebRTC signaling codes', () => {
  it('round trips a URL-safe offer code', () => {
    const encoded = encodeSignal({
      version: MULTIPLAYER_PROTOCOL_VERSION,
      kind: 'offer',
      sessionId: 'session-a',
      peerId: 'peer-a',
      description: { type: 'offer', sdp: 'v=0\r\na=fake-test' },
    });

    expect(encoded).not.toMatch(/[+/=]/);
    expect(decodeSignal(encoded, 'offer')).toMatchObject({
      kind: 'offer', sessionId: 'session-a', peerId: 'peer-a'
    });
  });

  it('rejects a signal code of the wrong type', () => {
    const encoded = encodeSignal({
      version: MULTIPLAYER_PROTOCOL_VERSION,
      kind: 'answer',
      sessionId: 'session-a',
      peerId: 'peer-a',
      description: { type: 'answer', sdp: 'v=0\r\na=fake-test' },
    });
    expect(() => decodeSignal(encoded, 'offer')).toThrow('Expected a offer');
  });
});

describe('multiplayer input normalization', () => {
  it('keeps hostile input packets within the protocol bounds', () => {
    expect(clampInputFrame({
      type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence: -4, clientTime: -10,
      movement: 999, aimAngle: -99, aimPitch: 999999, selectedSlot: 88, firing: 1 as unknown as boolean, sprinting: 1 as unknown as boolean, sliding: 1 as unknown as boolean, reviving: 1 as unknown as boolean, jumpPressed: 1 as unknown as boolean, dashPressed: 0 as unknown as boolean,
    })).toMatchObject({ sequence: 0, clientTime: 0, movement: 15, aimAngle: 0, aimPitch: 65535, selectedSlot: 31, firing: true, sprinting: true, sliding: true, reviving: true, jumpPressed: true, dashPressed: false });
  });
});
