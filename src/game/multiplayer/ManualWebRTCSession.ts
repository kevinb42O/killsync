import { FriendsWorldHost, FriendsWorldGuest } from './FriendsWorldReplication';
import { FRIENDS_SESSION_PROTOCOL } from './FriendsCrewIdentity';
import { compactSnapshotWirePayload, expandSnapshotWirePayload, SnapshotReplicator, SnapshotDecoder } from './snapshotReplication';
import type { CoopSnapshot } from './CoopSimulation';
import {
  clampInputFrame,
  isMultiplayerWireMessage,
  ManualSignal,
  MultiplayerInputFrame,
  MultiplayerPeerInfo,
  MultiplayerReliableEvent,
  MultiplayerRole,
  MultiplayerStateFrame,
  MultiplayerWireMessage,
  MULTIPLAYER_PROTOCOL_VERSION,
} from './protocol';
import { encodeSnapshotPackets, MAX_SNAPSHOT_BYTES, SnapshotAssembler } from './snapshotTransport';

const MAX_SIGNAL_BYTES = 48_000;
const ICE_GATHER_TIMEOUT_MS = 7_000;
const MAX_STATE_QUEUE_BYTES = MAX_SNAPSHOT_BYTES + 16_000;
const STATE_SEND_HIGH_WATER_BYTES = 64_000;
const FRIENDS_STATE_QUEUE_BYTES = 64_000;
// Inputs are replaceable and sent at 20 Hz. A large queued history only adds
// latency: keep a few frames, while reliable commands use their own channel.
const FRIENDS_INPUT_QUEUE_BYTES = 4_000;
const MAX_RELIABLE_QUEUE_BYTES = 256_000;
const wireTextEncoder = new TextEncoder();

export const DEFAULT_PUBLIC_STUN_SERVERS: RTCIceServer[] = [
  {
    urls: [
      'stun:stun.l.google.com:19302',
      'stun:stun1.l.google.com:19302',
      'stun:stun2.l.google.com:19302',
      'stun:stun3.l.google.com:19302',
      'stun:stun4.l.google.com:19302',
      'stun:stun.cloudflare.com:3478',
    ],
  },
];

type ManagedPeer = {
  peerId: string;
  connection: RTCPeerConnection;
  inputChannel?: RTCDataChannel;
  stateChannel?: RTCDataChannel;
  reliableChannel?: RTCDataChannel;
  worldChannel?: RTCDataChannel;
  negotiationTimer?: ReturnType<typeof setTimeout>;
  friendsAdmitted?: boolean;
  estimatedOneWayMs: number;
  latencySampledAt: number;
  disconnectTimer?: number | NodeJS.Timeout;
};
const DISCONNECTED_PEER_GRACE_MS = 12_000;

export interface ManualWebRTCSessionOptions {
  role: MultiplayerRole;
  friends?: boolean;
  relayOnly?: boolean;
  sessionId?: string;
  iceServers?: RTCIceServer[];
  onPeerChange?: (peers: MultiplayerPeerInfo[]) => void;
  onInput?: (peerId: string, frame: MultiplayerInputFrame, estimatedOneWayMs: number) => void;
  /** Return false when an unordered delta cannot yet be reconstructed. The
   * adapter then leaves its transport watermark unchanged so its keyframe can
   * still be accepted if it arrives immediately afterwards. */
  onState?: (frame: MultiplayerStateFrame) => boolean | void;
  onEvent?: (peerId: string, event: MultiplayerReliableEvent) => void;
  onError?: (message: string) => void;
}

/**
 * WebRTC gameplay transport. It can be driven by the public lobby signaling
 * service or by the legacy encode/decode helpers below; gameplay traffic stays
 * on the peer connection, with TURN used only when direct routes are blocked.
 */
export class ManualWebRTCSession {
  readonly role: MultiplayerRole;
  readonly sessionId: string;
  private readonly iceServers: RTCIceServer[];
  readonly friends: boolean;
  private readonly relayOnly: boolean;
  private readonly friendsHost = new FriendsWorldHost();
  private readonly friendsReplicator = new SnapshotReplicator();
  private readonly friendsDecoder = new SnapshotDecoder();
  private readonly friendsGuest = new FriendsWorldGuest(message=>{this.sendEvent({type:'event',version:MULTIPLAYER_PROTOCOL_VERSION,event:'friends_sync',payload:message});},()=>{this.friendsDecoder.reset();this.latestStateTick=-1;this.friendsStateReceivedAt=0;this.snapshotAssemblers.clear();});
  friendsStateReceivedAt = 0;
  get friendsEpoch() { return this.role==='host'?this.friendsHost.epoch:this.friendsGuest.epoch; }
  get friendsSyncProgress() { return this.friendsGuest.assembler.progress; }
  admitFriendsPeer(peerId:string) { const p=this.peers.get(peerId);if(p)p.friendsAdmitted=true; }
  resetFriendsWorld() { this.friendsHost.reset();this.friendsReplicator.reset(); }
  private readonly peers = new Map<string, ManagedPeer>();
  private onPeerChange?: ManualWebRTCSessionOptions['onPeerChange'];
  private onInput?: ManualWebRTCSessionOptions['onInput'];
  private onState?: ManualWebRTCSessionOptions['onState'];
  private onEvent?: ManualWebRTCSessionOptions['onEvent'];
  private onError?: ManualWebRTCSessionOptions['onError'];
  private latestStateTick = -1;
  private remoteSessionId?: string;
  private readonly snapshotAssemblers = new Map<string, SnapshotAssembler>();

  constructor(options: ManualWebRTCSessionOptions) {
    this.role = options.role;
    this.friends = options.friends === true;
    this.relayOnly = options.relayOnly === true;
    this.sessionId = options.sessionId || createId('session');
    // The lobby service may provide short-lived TURN credentials. Redundant STUN
    // ensures WAN traversal succeeds without requiring a private server.
    this.iceServers = options.iceServers || DEFAULT_PUBLIC_STUN_SERVERS;
    this.onPeerChange = options.onPeerChange;
    this.onInput = options.onInput;
    this.onState = options.onState;
    this.onEvent = options.onEvent;
    this.onError = options.onError;
  }

  get connectedPeerCount(): number {
    return [...this.peers.values()].filter(peer => peer.connection.connectionState === 'connected').length;
  }

  /** Connected and in-flight peers reserve a roster slot; failed/closed
   * negotiations do not prevent the host from inviting a replacement. */
  get occupiedPeerSlots(): number {
    return [...this.peers.values()].filter(peer => peer.connection.connectionState !== 'failed' && peer.connection.connectionState !== 'closed').length;
  }

  /** Session id controlled by the authoritative host. Owner-signed commands
   * bind to this value so they cannot be replayed into another match. */
  get authoritySessionId(): string {
    return this.role === 'host' ? this.sessionId : this.remoteSessionId || this.sessionId;
  }

  get peerInfo(): MultiplayerPeerInfo[] {
    return [...this.peers.values()].map(peer => ({
      peerId: peer.peerId,
      state: peer.connection.connectionState,
    }));
  }

  /** Rebind consumers after the setup UI hands a live peer session to gameplay. */
  setHandlers(handlers: Pick<ManualWebRTCSessionOptions, 'onPeerChange' | 'onInput' | 'onState' | 'onEvent' | 'onError'>) {
    this.onPeerChange = handlers.onPeerChange;
    this.onInput = handlers.onInput;
    this.onState = handlers.onState;
    this.onEvent = handlers.onEvent;
    this.onError = handlers.onError;
  }

  /** Host-only: create one copyable offer for one friend. */
  async createOffer(): Promise<string> {
    this.assertRole('host');
    const peerId = createId('peer');
    const peer = this.createPeer(peerId);
    peer.inputChannel = peer.connection.createDataChannel('input', { ordered: false, maxRetransmits: 0 });
    // Snapshots may be processed out of order by tick, but every fragment of a
    // chosen snapshot must arrive. Unreliable fragmentation made the entire
    // frame unusable when any one packet was lost.
    peer.stateChannel = peer.connection.createDataChannel('state', { ordered: false });
    peer.reliableChannel = peer.connection.createDataChannel('reliable', { ordered: true });
    this.bindChannel(peer, peer.inputChannel, 'input');
    this.bindChannel(peer, peer.stateChannel, 'state');
    this.bindChannel(peer, peer.reliableChannel, 'reliable');
    if(this.friends){peer.worldChannel=peer.connection.createDataChannel('friends-world',{ordered:true});this.bindChannel(peer,peer.worldChannel,'friends-world');}

    try {
    await peer.connection.setLocalDescription(await peer.connection.createOffer());
    await waitForIceGathering(peer.connection, this.friends);
    return encodeSignal({
      version: MULTIPLAYER_PROTOCOL_VERSION,
      ...(this.friends ? {friendsProtocol:FRIENDS_SESSION_PROTOCOL} : {}),
      kind: 'offer',
      sessionId: this.sessionId,
      peerId,
      description: peer.connection.localDescription!.toJSON(),
    });
    } catch(error) {this.disconnectPeer(peerId);throw error;}
  }

  /** Guest-only: accept a host offer and return one copyable answer. */
  async acceptOffer(offerCode: string): Promise<string> {
    this.assertRole('guest');
    const offer = decodeSignal(offerCode, 'offer');
    this.checkFriendsSignal(offer);
    this.remoteSessionId = offer.sessionId;
    const peer = this.createPeer(offer.peerId);
    try {
    await peer.connection.setRemoteDescription(offer.description);
    await peer.connection.setLocalDescription(await peer.connection.createAnswer());
    await waitForIceGathering(peer.connection, this.friends);
    return encodeSignal({
      version: MULTIPLAYER_PROTOCOL_VERSION,
      ...(this.friends ? {friendsProtocol:FRIENDS_SESSION_PROTOCOL} : {}),
      kind: 'answer',
      sessionId: offer.sessionId,
      peerId: offer.peerId,
      description: peer.connection.localDescription!.toJSON(),
    });
    } catch(error) {this.disconnectPeer(peer.peerId);throw error;}
  }

  /** Host-only: finish the connection after a friend returns their answer. */
  async acceptAnswer(answerCode: string): Promise<void> {
    this.assertRole('host');
    const answer = decodeSignal(answerCode, 'answer');
    this.checkFriendsSignal(answer);
    if (answer.sessionId !== this.sessionId) {
      throw new Error('This answer belongs to a different co-op session.');
    }
    const peer = this.peers.get(answer.peerId);
    if (!peer) throw new Error('This answer does not match an offer created in this browser.');
    if(peer.connection.remoteDescription?.sdp===answer.description.sdp)return;
    await peer.connection.setRemoteDescription(answer.description);
  }

  sendInput(frame: MultiplayerInputFrame) {
    const message = JSON.stringify(clampInputFrame(frame));
    for (const peer of this.peers.values()) {
      this.send(peer.inputChannel, message);
    }
  }

  broadcastState(frame: MultiplayerStateFrame, payloadForPeer?: (peerId: string) => unknown) {
    if (this.peers.size === 0) return;
    if(this.friends && (frame.payload as CoopSnapshot)?.friends){
      const snapshot=frame.payload as CoopSnapshot;this.friendsHost.update(snapshot);
      const ids=[...this.peers.values()].filter(p=>p.friendsAdmitted&&p.worldChannel?.readyState==='open').map(p=>p.peerId);
      this.friendsHost.pump(ids,performance.now(),(id,packet)=>this.send(this.peers.get(id)?.worldChannel,packet),m=>this.onError?.(m));
      for(const id of ids){const p=this.peers.get(id)!;if(p.stateChannel?.readyState!=='open'||p.stateChannel.bufferedAmount>=FRIENDS_STATE_QUEUE_BYTES)continue;
        const interest=(payloadForPeer?payloadForPeer(id):snapshot) as CoopSnapshot;
        const motion=this.friendsHost.motion(id,interest) as {snapshot:CoopSnapshot}|undefined;if(!motion)continue;
        const payload=compactSnapshotWirePayload({...motion,snapshot:this.friendsReplicator.payloadFor(id,motion.snapshot,frame.tick)});
        const packets=encodeSnapshotPackets(JSON.stringify({...frame,payload}),frame.tick);
        if(!packets.length||p.stateChannel.bufferedAmount+packets.reduce((a,b)=>a+b.byteLength,0)>FRIENDS_STATE_QUEUE_BYTES){this.friendsReplicator.reset(id);continue;}
        for(const packet of packets)if(!this.send(p.stateChannel,packet,false)){this.friendsReplicator.reset(id);break;}
      }
      return;
    }
    for (const peer of this.peers.values()) {
      if (peer.stateChannel?.readyState !== 'open') continue;
      const peerFrame = payloadForPeer ? { ...frame, payload: payloadForPeer(peer.peerId) } : frame;
      const packets = encodeSnapshotPackets(JSON.stringify(peerFrame), frame.tick);
      const packetBytes = packets.reduce((total, packet) => total + packet.byteLength, 0);
      // State is replaceable. Never let one slow receiver retain more than a
      // small, bounded history of world snapshots. Checking the total before
      // the first fragment closes the old gap where a 50+ KB snapshot could be
      // appended to an already-near-full queue.
      if (!packets.length || peer.stateChannel.bufferedAmount + packetBytes > MAX_STATE_QUEUE_BYTES) continue;
      for (const packet of packets) if (!this.send(peer.stateChannel, packet, false)) break;
    }
  }

  /** Returns whether at least one peer had its reliable channel ready. */
  sendEvent(event: MultiplayerReliableEvent): boolean {
    const message = JSON.stringify(event);
    let sent = false;
    for (const peer of this.peers.values()) {
      sent = this.send(peer.reliableChannel, message) || sent;
    }
    return sent;
  }

  /** Reliable point-to-point delivery for private owner results and notices. */
  sendEventTo(peerId: string, event: MultiplayerReliableEvent): boolean {
    const peer = this.peers.get(peerId);
    return Boolean(peer && this.send(peer.reliableChannel, JSON.stringify(event)));
  }

  /** Close one peer without disbanding the remaining co-op session. */
  disconnectPeer(peerId: string): boolean {
    const peer = this.peers.get(peerId);
    if (!peer) return false;
    clearTimeout(peer.disconnectTimer as number);
    clearTimeout(peer.negotiationTimer);this.friendsHost.remove(peerId);this.friendsReplicator.reset(peerId);
    // Remove before closing: `close()` can synchronously emit another state
    // transition, which must not recursively try to remove the same peer.
    this.peers.delete(peerId);
    this.snapshotAssemblers.delete(peerId);
    peer.inputChannel?.close();
    peer.stateChannel?.close();
    peer.reliableChannel?.close();
    peer.worldChannel?.close();
    peer.connection.close();
    this.notifyPeers();
    return true;
  }

  close() {
    const peers = [...this.peers.values()];
    this.peers.clear();
    this.snapshotAssemblers.clear();
    for (const peer of peers) {
      clearTimeout(peer.disconnectTimer as number);clearTimeout(peer.negotiationTimer);
      peer.inputChannel?.close();
      peer.stateChannel?.close();
      peer.reliableChannel?.close();
    peer.worldChannel?.close();
      peer.connection.close();
    }
    this.notifyPeers();
  }

  private createPeer(peerId: string): ManagedPeer {
    const existing = this.peers.get(peerId);
    if (existing) {
      clearTimeout(existing.disconnectTimer as number);
      clearTimeout(existing.negotiationTimer);
      this.peers.delete(peerId);
      existing.connection.onconnectionstatechange = null;
      existing.connection.close();
    }
    this.snapshotAssemblers.delete(peerId);
    const connection = new RTCPeerConnection({ iceServers: this.iceServers, ...(this.friends&&this.relayOnly?{iceTransportPolicy:'relay' as const}:{}) });
    const peer: ManagedPeer = { peerId, connection, estimatedOneWayMs: 0, latencySampledAt: 0 };
    this.peers.set(peerId, peer);
    if(this.friends)peer.negotiationTimer=setTimeout(()=>{if(this.peers.get(peerId)===peer&&connection.connectionState!=='connected')this.disconnectPeer(peerId);},35000);
    connection.onconnectionstatechange = () => {
      this.notifyPeers();
      if (connection.connectionState === 'connected') {
        clearTimeout(peer.negotiationTimer);
        clearTimeout(peer.disconnectTimer as number);
      } else if (connection.connectionState === 'disconnected') {
        if(!this.friends)this.onError?.(`Connection to ${peerId} was interrupted; attempting to reconnect.`);
        clearTimeout(peer.disconnectTimer as number);
        // Browsers may briefly enter `disconnected` during a route change.
        // Do not evict immediately, but never leave a dead peer occupying a
        // roster slot or receiving snapshot work forever.
        peer.disconnectTimer = setTimeout(() => {
          if (this.peers.get(peerId) === peer && connection.connectionState === 'disconnected') {
            this.onError?.(`Connection to ${peerId} did not recover and was removed from the squad.`);
            this.disconnectPeer(peerId);
          }
        }, DISCONNECTED_PEER_GRACE_MS);
      } else if (connection.connectionState === 'failed' || connection.connectionState === 'closed') {
        clearTimeout(peer.disconnectTimer as number);
        this.onError?.(connection.connectionState === 'failed' ? `Connection to ${peerId} could not be restored.` : `Connection to ${peerId} closed.`);
        if (this.peers.get(peerId) === peer) this.disconnectPeer(peerId);
      }
    };
    connection.oniceconnectionstatechange = () => {
      if (!this.friends && connection.iceConnectionState === 'failed') {
        this.onError?.(`Direct connection to ${peerId} failed. Try a different host network or reconnect.`);
      }
    };
    connection.ondatachannel = (event) => {
      if (event.channel.label === 'input') {
        peer.inputChannel = event.channel;
        this.bindChannel(peer, event.channel, 'input');
      } else if (event.channel.label === 'state') {
        peer.stateChannel = event.channel;
        this.bindChannel(peer, event.channel, 'state');
      } else if (event.channel.label === 'reliable') {
        peer.reliableChannel = event.channel;
        this.bindChannel(peer, event.channel, 'reliable');
      } else if(this.friends && event.channel.label==='friends-world'){
        peer.worldChannel=event.channel;this.bindChannel(peer,event.channel,'friends-world');
      } else {
        event.channel.close();
      }
    };
    this.notifyPeers();
    return peer;
  }

  private bindChannel(peer: ManagedPeer, channel: RTCDataChannel, kind: 'input' | 'state' | 'reliable' | 'friends-world') {
    channel.binaryType = 'arraybuffer';
    channel.onmessage = (event) => this.receiveMessage(peer.peerId, kind, event.data);
    channel.onopen = () => this.notifyPeers();
    channel.onclose = () => {this.notifyPeers();if(this.friends&&this.peers.get(peer.peerId)===peer&&peer.connection.connectionState==='connected'){this.onError?.('The island data channel closed. Rejoin the room.');this.disconnectPeer(peer.peerId);}};
    channel.onerror = () => this.onError?.(`The ${kind} channel with ${peer.peerId} encountered an error.`);
  }

  private receiveMessage(peerId: string, kind: 'input' | 'state' | 'reliable' | 'friends-world', raw: unknown) {
    if(this.friends&&kind==='friends-world'){if(this.role==='guest'&&raw instanceof ArrayBuffer)this.friendsGuest.receive(raw,performance.now());return;}
    if ((kind === 'state' && this.role !== 'guest') || (kind === 'input' && this.role !== 'host')) return;
    if (kind === 'state' && raw instanceof ArrayBuffer) {
      let assembler = this.snapshotAssemblers.get(peerId);
      if (!assembler) {
        assembler = new SnapshotAssembler(true);
        this.snapshotAssemblers.set(peerId, assembler);
      }
      raw = assembler.push(raw, Date.now());
    }
    if (typeof raw !== 'string' || raw.length > (kind === 'state' ? MAX_SNAPSHOT_BYTES : 64_000)) return;
    try {
      const message: unknown = JSON.parse(raw);
      if (!isMultiplayerWireMessage(message)) return;
      if (kind === 'input' && message.type === 'input') {
        const peer = this.peers.get(peerId);
        if (peer) void this.refreshLatency(peer);
        this.onInput?.(peerId, clampInputFrame(message), peer?.estimatedOneWayMs || 0);
      } else if (kind === 'state' && message.type === 'state') {
        if (!Number.isSafeInteger(message.tick) || message.tick <= this.latestStateTick) return;
        let state=message;
        if(this.friends){const motion=expandSnapshotWirePayload(message.payload) as any;const decoded=this.friendsDecoder.decode(motion?.snapshot,message.tick);if(!decoded)return;const snapshot=this.friendsGuest.decode({...motion,snapshot:decoded});if(!snapshot)return;state={...message,payload:snapshot};this.friendsStateReceivedAt=performance.now();}
        const accepted = this.onState?.(state);
        if (accepted !== false) {
          this.latestStateTick = message.tick;
          this.snapshotAssemblers.get(peerId)?.accept(message.tick);
        }
      } else if (kind === 'reliable' && message.type === 'event') {
        if(this.friends && this.role==='host' && message.event==='friends_sync'){const m=message.payload as any;if(m?.kind==='ack')this.friendsHost.acknowledge(peerId,m.epoch,m.revision);else if(m?.kind==='request'){this.friendsHost.request(peerId);this.friendsReplicator.reset(peerId);}return;}
        this.onEvent?.(peerId, message);
      }
    } catch {
      this.onError?.('A peer sent an unreadable network message.');
    }
  }

  private async refreshLatency(peer: ManagedPeer) {
    const now = performance.now();
    if (now - peer.latencySampledAt < 1_000 || peer.connection.connectionState !== 'connected') return;
    peer.latencySampledAt = now;
    try {
      const reports = await peer.connection.getStats();
      reports.forEach(report => {
        if (report.type !== 'candidate-pair' || report.state !== 'succeeded' || !report.nominated || typeof report.currentRoundTripTime !== 'number') return;
        peer.estimatedOneWayMs = Math.max(0, Math.min(150, report.currentRoundTripTime * 500));
      });
    } catch { /* A missing stats sample must never interrupt gameplay input. */ }
  }

  private send(channel: RTCDataChannel | undefined, message: string | ArrayBuffer, checkBackpressure = true): boolean {
    if (channel?.readyState !== 'open') return false;
    const limit = channel.label === 'reliable' ? MAX_RELIABLE_QUEUE_BYTES
      : this.friends && channel.label === 'input' ? FRIENDS_INPUT_QUEUE_BYTES : STATE_SEND_HIGH_WATER_BYTES;
    if (checkBackpressure) {
      const bytes = typeof message === 'string' ? wireTextEncoder.encode(message).byteLength : message.byteLength;
      if (channel.bufferedAmount + bytes > limit) return false;
    }
    try {
      if (typeof message === 'string') channel.send(message);
      else channel.send(message);
      return true;
    } catch {
      return false;
    }
  }

  private notifyPeers() {
    this.onPeerChange?.(this.peerInfo);
  }

  private assertRole(role: MultiplayerRole) {
    if (this.role !== role) throw new Error(`Only the ${role} can perform this action.`);
  }

  private checkFriendsSignal(signal: ManualSignal) {
    if (this.friends && signal.friendsProtocol !== FRIENDS_SESSION_PROTOCOL) {
      throw new Error('Use a Friends connection from the current version. Both friends should reload the game.');
    }
    if (!this.friends && signal.friendsProtocol !== undefined) {
      throw new Error('That connection belongs to Friends mode. Open Friends mode to join.');
    }
  }
}

export function encodeSignal(signal: ManualSignal): string {
  const raw = JSON.stringify(signal);
  if (new TextEncoder().encode(raw).byteLength > MAX_SIGNAL_BYTES) {
    throw new Error('This connection code is unexpectedly large. Please create a fresh offer.');
  }
  const bytes = new TextEncoder().encode(raw);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

export function decodeSignal(code: string, expectedKind?: ManualSignal['kind']): ManualSignal {
  const normalized = code.trim().replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  let raw: string;
  try {
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    raw = new TextDecoder().decode(bytes);
  } catch {
    throw new Error('That connection code is not valid. Copy the complete code and try again.');
  }
  if (new TextEncoder().encode(raw).byteLength > MAX_SIGNAL_BYTES) {
    throw new Error('That connection code is too large to accept.');
  }
  let signal: unknown;
  try {
    signal = JSON.parse(raw);
  } catch {
    throw new Error('That connection code could not be read.');
  }
  if (!isManualSignal(signal) || (expectedKind && signal.kind !== expectedKind)) {
    throw new Error(`Expected a ${expectedKind || 'manual WebRTC'} connection code.`);
  }
  return signal;
}

function isManualSignal(value: unknown): value is ManualSignal {
  if (!value || typeof value !== 'object') return false;
  const signal = value as Partial<ManualSignal>;
  return signal.version === MULTIPLAYER_PROTOCOL_VERSION
    && (signal.kind === 'offer' || signal.kind === 'answer')
    && typeof signal.sessionId === 'string'
    && typeof signal.peerId === 'string'
    && !!signal.description
    && typeof signal.description.type === 'string'
    && typeof signal.description.sdp === 'string';
}

async function waitForIceGathering(connection: RTCPeerConnection, completeGathering = false): Promise<void> {
  if (connection.iceGatheringState === 'complete') return;
  await new Promise<void>((resolve) => {
    let timeout = 0;
    let silenceTimer = 0;
    let hasSrflx = false;

    const finish = () => {
      window.clearTimeout(timeout);
      window.clearTimeout(silenceTimer);
      connection.removeEventListener('icegatheringstatechange', onStateChange);
      connection.removeEventListener('icecandidate', onCandidate);
      resolve();
    };

    const onStateChange = () => {
      if (connection.iceGatheringState === 'complete') finish();
    };

    const onCandidate = (event: RTCPeerConnectionIceEvent) => {
      if (!event.candidate) {
        finish();
        return;
      }
      if (event.candidate.type === 'srflx' || event.candidate.candidate.includes('srflx')) {
        hasSrflx = true;
      }
      // Once we have a public STUN server-reflexive candidate, if gathering quietens for 700ms, finish early
      window.clearTimeout(silenceTimer);
      if (hasSrflx && !completeGathering) {
        silenceTimer = window.setTimeout(finish, 700);
      }
    };

    timeout = window.setTimeout(finish, ICE_GATHER_TIMEOUT_MS);
    connection.addEventListener('icegatheringstatechange', onStateChange);
    connection.addEventListener('icecandidate', onCandidate);
  });
}

function createId(prefix: string): string {
  const bytes = new Uint32Array(2);
  crypto.getRandomValues(bytes);
  return `${prefix}-${bytes[0].toString(36)}${bytes[1].toString(36)}`;
}
