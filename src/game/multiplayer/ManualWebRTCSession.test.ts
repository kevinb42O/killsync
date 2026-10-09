import { FriendsSimulation } from './FriendsSimulation';
import { SnapshotDecoder, SnapshotReplicator } from './snapshotReplication';
import { encodeSnapshotPackets } from './snapshotTransport';
import { describe, expect, it, vi } from 'vitest';
import { clampInputFrame, MULTIPLAYER_PROTOCOL_VERSION } from './protocol';
import { decodeSignal, encodeSignal, ManualWebRTCSession } from './ManualWebRTCSession';

describe('manual WebRTC signaling codes', () => {
  it('rejects mixed-mode or obsolete Friends offers before allocating a connection', async () => {
    const signal={version:MULTIPLAYER_PROTOCOL_VERSION,kind:'offer' as const,sessionId:'session',peerId:'peer',description:{type:'offer' as const,sdp:'v=0'}};
    await expect(new ManualWebRTCSession({role:'guest',friends:true}).acceptOffer(encodeSignal(signal))).rejects.toThrow('Both friends should reload');
    await expect(new ManualWebRTCSession({role:'guest'}).acceptOffer(encodeSignal({...signal,friendsProtocol:1}))).rejects.toThrow('belongs to Friends mode');
    await expect(new ManualWebRTCSession({role:'guest',friends:true}).acceptOffer(encodeSignal({...signal,friendsProtocol:99}))).rejects.toThrow('Both friends should reload');
  });
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
  it('releases failed connection attempts from the host roster budget', () => {
    const session = new ManualWebRTCSession({ role: 'host' });
    session['peers'].set('connected', { peerId: 'connected', connection: { connectionState: 'connected' } } as never);
    session['peers'].set('connecting', { peerId: 'connecting', connection: { connectionState: 'connecting' } } as never);
    session['peers'].set('failed', { peerId: 'failed', connection: { connectionState: 'failed' } } as never);
    session['peers'].set('closed', { peerId: 'closed', connection: { connectionState: 'closed' } } as never);

    expect(session.occupiedPeerSlots).toBe(2);
  });

  it('targets reliable owner replies and disconnects only the selected peer', () => {
    const session = new ManualWebRTCSession({ role: 'host' });
    const sendA = vi.fn(), sendB = vi.fn(), close = vi.fn();
    const peer = (send: ReturnType<typeof vi.fn>) => ({
      peerId: 'peer',
      connection: { close, connectionState: 'connected' },
      reliableChannel: { readyState: 'open', label: 'reliable', bufferedAmount: 0, send, close },
      estimatedOneWayMs: 0,
      latencySampledAt: 0,
    });
    session['peers'].set('a', { ...peer(sendA), peerId: 'a' } as never);
    session['peers'].set('b', { ...peer(sendB), peerId: 'b' } as never);
    const event = { type: 'event', version: MULTIPLAYER_PROTOCOL_VERSION, event: 'admin_result', payload: { requestId: 'x', ok: true, message: 'done' } } as const;
    expect(session.sendEventTo('a', event)).toBe(true);
    expect(sendA).toHaveBeenCalledOnce();
    expect(sendB).not.toHaveBeenCalled();
    expect(session.disconnectPeer('a')).toBe(true);
    expect(session.peerInfo.map(info => info.peerId)).toEqual(['b']);
  });

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


describe('Friends congestion and unordered delivery', () => {
  it('recovers from a delta arriving between keyframe fragments through the actual transport', () => {
    const simulation = new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]);
    const decoder = new SnapshotDecoder(), replicator = new SnapshotReplicator();
    const accepted: number[] = [];
    const session = new ManualWebRTCSession({role:'guest', onState: frame => {
      const snapshot = decoder.decode(frame.payload, frame.tick);
      if (!snapshot) return false;
      accepted.push(frame.tick); return true;
    }});
    const base = simulation.createSnapshot(); base.players[0].label = 'Host'.repeat(7000);
    const packet = (snapshot: typeof base, tick: number) => encodeSnapshotPackets(JSON.stringify({type:'state',version:MULTIPLAYER_PROTOCOL_VERSION,tick,sentAt:0,payload:replicator.payloadFor('guest',snapshot,tick)}),tick);
    const keyframe = packet(base,10);
    const next = {...base,tick:base.tick+1,elapsedMs:base.elapsedMs+50};
    const delta = packet(next,11);
    expect(keyframe.length).toBeGreaterThan(1);expect(delta).toHaveLength(1);
    const receive = (p: ArrayBuffer) => session['receiveMessage']('host','state',p);
    receive(keyframe[0]);delta.forEach(receive);expect(accepted).toEqual([]);
    keyframe.slice(1).forEach(receive);expect(accepted).toEqual([10]);
    packet({...next,tick:next.tick+1,elapsedMs:next.elapsedMs+50},12).forEach(receive);
    expect(accepted).toEqual([10,12]);
    delta.forEach(receive);expect(accepted).toEqual([10,12]);
  });

  it('recovers the same reordered motion on Friends channels after durable island sync', () => {
    const accepted: number[] = [], packets: ArrayBuffer[] = [];
    const host = new ManualWebRTCSession({role:'host',friends:true});
    const guest = new ManualWebRTCSession({role:'guest',friends:true,onState:frame=>{accepted.push(frame.tick);}});
    host['peers'].set('guest',{
      peerId:'guest',friendsAdmitted:true,
      stateChannel:{readyState:'open',label:'state',bufferedAmount:0,send:(p:ArrayBuffer)=>packets.push(p)},
      worldChannel:{readyState:'open',label:'friends-world',bufferedAmount:0,send:(p:ArrayBuffer)=>guest['receiveMessage']('host','friends-world',p)},
    } as never);
    guest['peers'].set('host',{peerId:'host',reliableChannel:{readyState:'open',label:'reliable',bufferedAmount:0,send:(p:string)=>host['receiveMessage']('guest','reliable',p)}} as never);
    const simulation = new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]);
    const send = (tick:number) => {
      const snapshot=simulation.createSnapshot();snapshot.players[0].label='Host'.repeat(7000);
      host.broadcastState({type:'state',version:MULTIPLAYER_PROTOCOL_VERSION,tick,sentAt:0,payload:snapshot});
      return packets.splice(0);
    };
    const keyframe=send(10);expect(keyframe.length).toBeGreaterThan(1);
    simulation.tick(50);const delta=send(11);expect(delta).toHaveLength(1);
    guest['receiveMessage']('host','state',keyframe[0]);
    delta.forEach(p=>guest['receiveMessage']('host','state',p));expect(accepted).toEqual([]);
    keyframe.slice(1).forEach(p=>guest['receiveMessage']('host','state',p));expect(accepted).toEqual([10]);
    simulation.tick(50);send(12).forEach(p=>guest['receiveMessage']('host','state',p));expect(accepted).toEqual([10,12]);
  });

  it('bounds Friends input queues including the incoming UTF-8 packet and resumes after drainage', () => {
    const session = new ManualWebRTCSession({role:'guest',friends:true});
    const send = vi.fn();
    const channel = {readyState:'open',label:'input',bufferedAmount:3990,send} as unknown as RTCDataChannel;
    expect(session['send'](channel,'é'.repeat(6))).toBe(false);
    expect(send).not.toHaveBeenCalled();
    Object.assign(channel,{bufferedAmount:0});expect(session['send'](channel,'latest input')).toBe(true);
    // Existing survival input budget remains available.
    expect(new ManualWebRTCSession({role:'guest'})['send']({...channel,bufferedAmount:5000} as RTCDataChannel,'input')).toBe(true);
  });

  it('skips per-peer snapshot preparation when the Friends state queue is already full', () => {
    const session = new ManualWebRTCSession({role:'host',friends:true});
    session['peers'].set('guest',{peerId:'guest',friendsAdmitted:true,worldChannel:{readyState:'open'},stateChannel:{readyState:'open',bufferedAmount:64000}} as never);
    vi.spyOn(session['friendsHost'],'pump').mockImplementation(()=>{});
    const motion = vi.spyOn(session['friendsHost'],'motion');
    const interest = vi.fn();
    session.broadcastState({type:'state',version:MULTIPLAYER_PROTOCOL_VERSION,tick:1,sentAt:0,payload:new FriendsSimulation([{id:'host',label:'Host',color:'#fff'}]).createSnapshot()},interest);
    expect(interest).not.toHaveBeenCalled();expect(motion).not.toHaveBeenCalled();
  });
});
