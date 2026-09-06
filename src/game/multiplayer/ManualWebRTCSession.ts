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
  estimatedOneWayMs: number;
  latencySampledAt: number;
};

export interface ManualWebRTCSessionOptions {
  role: MultiplayerRole;
  sessionId?: string;
  iceServers?: RTCIceServer[];
  onPeerChange?: (peers: MultiplayerPeerInfo[]) => void;
  onInput?: (peerId: string, frame: MultiplayerInputFrame, estimatedOneWayMs: number) => void;
  onState?: (frame: MultiplayerStateFrame) => void;
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
  private readonly peers = new Map<string, ManagedPeer>();
  private onPeerChange?: ManualWebRTCSessionOptions['onPeerChange'];
  private onInput?: ManualWebRTCSessionOptions['onInput'];
  private onState?: ManualWebRTCSessionOptions['onState'];
  private onEvent?: ManualWebRTCSessionOptions['onEvent'];
  private onError?: ManualWebRTCSessionOptions['onError'];
  private latestStateTick = -1;
  private readonly snapshotAssemblers = new Map<string, SnapshotAssembler>();

  constructor(options: ManualWebRTCSessionOptions) {
    this.role = options.role;
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

    await peer.connection.setLocalDescription(await peer.connection.createOffer());
    await waitForIceGathering(peer.connection);
    return encodeSignal({
      version: MULTIPLAYER_PROTOCOL_VERSION,
      kind: 'offer',
      sessionId: this.sessionId,
      peerId,
      description: peer.connection.localDescription!.toJSON(),
    });
  }

  /** Guest-only: accept a host offer and return one copyable answer. */
  async acceptOffer(offerCode: string): Promise<string> {
    this.assertRole('guest');
    const offer = decodeSignal(offerCode, 'offer');
    const peer = this.createPeer(offer.peerId);
    await peer.connection.setRemoteDescription(offer.description);
    await peer.connection.setLocalDescription(await peer.connection.createAnswer());
    await waitForIceGathering(peer.connection);
    return encodeSignal({
      version: MULTIPLAYER_PROTOCOL_VERSION,
      kind: 'answer',
      sessionId: offer.sessionId,
      peerId: offer.peerId,
      description: peer.connection.localDescription!.toJSON(),
    });
  }

  /** Host-only: finish the connection after a friend returns their answer. */
  async acceptAnswer(answerCode: string): Promise<void> {
    this.assertRole('host');
    const answer = decodeSignal(answerCode, 'answer');
    if (answer.sessionId !== this.sessionId) {
      throw new Error('This answer belongs to a different co-op session.');
    }
    const peer = this.peers.get(answer.peerId);
    if (!peer) throw new Error('This answer does not match an offer created in this browser.');
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
    for (const peer of this.peers.values()) {
      if (peer.stateChannel?.readyState !== 'open' || peer.stateChannel.bufferedAmount > 64_000) continue;
      const peerFrame = payloadForPeer ? { ...frame, payload: payloadForPeer(peer.peerId) } : frame;
      const packets = encodeSnapshotPackets(JSON.stringify(peerFrame), frame.tick);
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

  close() {
    for (const peer of this.peers.values()) {
      peer.inputChannel?.close();
      peer.stateChannel?.close();
      peer.reliableChannel?.close();
      peer.connection.close();
    }
    this.peers.clear();
    this.snapshotAssemblers.clear();
    this.notifyPeers();
  }

  private createPeer(peerId: string): ManagedPeer {
    const existing = this.peers.get(peerId);
    if (existing) {
      existing.connection.close();
      this.peers.delete(peerId);
    }
    this.snapshotAssemblers.delete(peerId);
    const connection = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer: ManagedPeer = { peerId, connection, estimatedOneWayMs: 0, latencySampledAt: 0 };
    this.peers.set(peerId, peer);
    connection.onconnectionstatechange = () => {
      this.notifyPeers();
      if (connection.connectionState === 'disconnected') this.onError?.(`Connection to ${peerId} was interrupted; attempting to reconnect.`);
      if (connection.connectionState === 'failed') this.onError?.(`Connection to ${peerId} could not be restored.`);
      if (connection.connectionState === 'closed') this.onError?.(`Connection to ${peerId} closed.`);
    };
    connection.oniceconnectionstatechange = () => {
      if (connection.iceConnectionState === 'failed') {
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
      } else {
        event.channel.close();
      }
    };
    this.notifyPeers();
    return peer;
  }

  private bindChannel(peer: ManagedPeer, channel: RTCDataChannel, kind: 'input' | 'state' | 'reliable') {
    channel.binaryType = 'arraybuffer';
    channel.onmessage = (event) => this.receiveMessage(peer.peerId, kind, event.data);
    channel.onopen = () => this.notifyPeers();
    channel.onclose = () => this.notifyPeers();
    channel.onerror = () => this.onError?.(`The ${kind} channel with ${peer.peerId} encountered an error.`);
  }

  private receiveMessage(peerId: string, kind: 'input' | 'state' | 'reliable', raw: unknown) {
    if ((kind === 'state' && this.role !== 'guest') || (kind === 'input' && this.role !== 'host')) return;
    if (kind === 'state' && raw instanceof ArrayBuffer) {
      let assembler = this.snapshotAssemblers.get(peerId);
      if (!assembler) {
        assembler = new SnapshotAssembler();
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
        this.latestStateTick = message.tick;
        this.onState?.(message);
      } else if (kind === 'reliable' && message.type === 'event') {
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
    if (checkBackpressure && channel.label !== 'reliable' && channel.bufferedAmount > 64_000) return false;
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

async function waitForIceGathering(connection: RTCPeerConnection): Promise<void> {
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
      if (hasSrflx) {
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
