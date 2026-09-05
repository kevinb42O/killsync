import { describe, expect, it, vi } from 'vitest';
import { clampInputFrame, MULTIPLAYER_PROTOCOL_VERSION } from './protocol';
import { decodeSignal, encodeSignal, ManualWebRTCSession } from './ManualWebRTCSession';

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
  it('normalizes non-finite and missing numbers without propagating NaN', () => {
    const normalized = clampInputFrame({ movement: NaN, aimAngle: Infinity, sequence: -Infinity } as Parameters<typeof clampInputFrame>[0]);
    expect(normalized).toMatchObject({ movement: 0, aimAngle: 0, aimPitch: 0, sequence: 0, selectedSlot: 0, clientTime: 0 });
  });
  it('keeps hostile input packets within the protocol bounds', () => {
    expect(clampInputFrame({
      type: 'input', version: MULTIPLAYER_PROTOCOL_VERSION, sequence: -4, clientTime: -10,
      movement: 999, aimAngle: -99, aimPitch: 999999, selectedSlot: 88, firing: 1 as unknown as boolean, sprinting: 1 as unknown as boolean, sliding: 1 as unknown as boolean, reviving: 1 as unknown as boolean, jumpPressed: 1 as unknown as boolean, dashPressed: 0 as unknown as boolean,
    })).toMatchObject({ sequence: 0, clientTime: 0, movement: 15, aimAngle: 0, aimPitch: 65535, selectedSlot: 31, firing: true, sprinting: true, sliding: true, reviving: true, jumpPressed: true, dashPressed: false });
  });
});

describe('gameplay transport', () => {
  it('ignores reordered snapshots while accepting a retry with a newer transport tick', () => {
    const onState = vi.fn();
    const session = new ManualWebRTCSession({ role: 'guest', onState });
    const receive = (tick: number, simulationTick: number) => session['receiveMessage']('host', 'state', JSON.stringify({ type: 'state', version: MULTIPLAYER_PROTOCOL_VERSION, tick, sentAt: 0, payload: { tick: simulationTick } }));
    receive(10, 100);
    receive(9, 90);
    receive(10, 100);
    receive(11, 0);
    expect(onState.mock.calls.map(([frame]) => frame.payload.tick)).toEqual([100, 0]);
  });

  it('drops congested replaceable traffic and tolerates a channel closing during send', () => {
    const session = new ManualWebRTCSession({ role: 'host' });
    const send = vi.fn();
    const channel = { readyState: 'open', label: 'state', bufferedAmount: 65_000, send } as unknown as RTCDataChannel;
    expect(session['send'](channel, '{}')).toBe(false);
    expect(send).not.toHaveBeenCalled();
    Object.assign(channel, { bufferedAmount: 0 });
    expect(session['send'](channel, '{}')).toBe(true);
    send.mockImplementation(() => { throw new Error('closed'); });
    expect(session['send'](channel, '{}')).toBe(false);
  });
});
