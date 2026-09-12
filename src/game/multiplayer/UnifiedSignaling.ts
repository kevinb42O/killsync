import { COOP_MAX_PLAYERS } from './protocol';

/**
 * Unified real-time WebRTC signaling broker for KILLSYNC.
 * 
 * Provides zero-config, serverless public matchmaking over secure WebSockets
 * (using public MQTT 3.1.1 brokers with failover), allowing players anywhere on
 * the internet (localhost, Vercel, AI Studio, mobile) to discover lobbies and
 * auto-negotiate WebRTC data channels without manual SDP code copy-pasting.
 */

export interface PublicLobbyInfo {
  id: string;
  code: string;
  hostName: string;
  maxPlayers: number;
  playerCount: number;
  state: 'waiting' | 'in_game';
  updatedAt: number;
  pingMs?: number;
}

const PUBLIC_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

const TOPIC_LOBBY_LIST = 'killsync/v1/lobbies';
const ROOM_TOPIC_PREFIX = 'killsync/v1/rooms/';
const LOBBY_EXPIRE_MS = 9_000;
const HEARTBEAT_INTERVAL_MS = 2_500;
const MAX_QUEUED_SIGNAL_MESSAGES = 256;

function encodeRemainingLength(len: number): number[] {
  const bytes: number[] = [];
  do {
    let byte = len % 128;
    len = Math.floor(len / 128);
    if (len > 0) byte |= 0x80;
    bytes.push(byte);
  } while (len > 0);
  return bytes;
}

function stringToUtf8Bytes(str: string): Uint8Array {
  return new TextEncoder().encode(str);
}

function utf8BytesToString(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

/** Lightweight zero-dependency MQTT 3.1.1 over WebSocket client */
export class MqttWsSignalingClient {
  private ws: WebSocket | null = null;
  private connected = false;
  private connecting = false;
  private brokerIndex = 0;
  private readonly subscriptions = new Map<string, Set<(payload: string, topic: string) => void>>();
  private readonly messageQueue: Array<{ topic: string; payload: string }> = [];
  private packetIdCounter = 1;
  private pingTimer: number | NodeJS.Timeout = 0;
  private reconnectTimer: number | NodeJS.Timeout = 0;
  private closed = false;

  constructor(private readonly brokerUrls: string[] = PUBLIC_BROKERS) {}

  connect(): Promise<boolean> {
    if (this.connected) return Promise.resolve(true);
    if (this.connecting) return Promise.resolve(false);
    this.closed = false;
    this.connecting = true;

    return new Promise((resolve) => {
      let settled = false;
      const settle = (connected: boolean) => {
        if (settled) return;
        settled = true;
        resolve(connected);
      };
      const url = this.brokerUrls[this.brokerIndex % this.brokerUrls.length];
      
      const globalWithWs = typeof globalThis !== 'undefined' ? (globalThis as Record<string, any>) : null;
      const WSClass: typeof WebSocket | null = typeof WebSocket !== 'undefined'
        ? WebSocket
        : (globalWithWs && (globalWithWs.WebSocket || globalWithWs._WebSocket)) || null;

      if (!WSClass) {
        this.connecting = false;
        settle(false);
        return;
      }

      try {
        const ws = new WSClass(url, ['mqtt']);
        ws.binaryType = 'arraybuffer';
        this.ws = ws;

        const timeout = setTimeout(() => {
          if (this.connecting && this.ws === ws) {
            ws.close();
            this.tryNextBroker();
            settle(false);
          }
        }, 5_000);

        ws.onopen = () => {
          const clientId = 'ks_' + Math.random().toString(36).slice(2, 10);
          const clientBytes = stringToUtf8Bytes(clientId);
          const varHeader = [0x00, 0x04, 0x4d, 0x51, 0x54, 0x54, 0x04, 0x02, 0x00, 0x3c]; // MQTT, 3.1.1, clean, 60s
          const payload = [0x00, clientBytes.length, ...clientBytes];
          const rem = varHeader.length + payload.length;
          const packet = new Uint8Array([0x10, ...encodeRemainingLength(rem), ...varHeader, ...payload]);
          ws.send(packet);
        };

        ws.onmessage = (event) => {
          const buffer = event.data instanceof ArrayBuffer
            ? new Uint8Array(event.data)
            : new Uint8Array(event.data.buffer || event.data);
          if (buffer.length === 0) return;

          const packetType = buffer[0] >> 4;
          if (packetType === 2) { // CONNACK
            clearTimeout(timeout);
            this.connected = true;
            this.connecting = false;
            this.startPing();
            this.resubscribeAll();
            this.flushQueue();
            settle(true);
          } else if (packetType === 3) { // PUBLISH
            this.handlePublishPacket(buffer);
          }
        };

        ws.onerror = () => {
          // Handled in onclose
        };

        ws.onclose = () => {
          clearTimeout(timeout);
          const failedBeforeConnect = !this.connected && this.ws === ws;
          this.connected = false;
          this.connecting = false;
          this.stopPing();
          // Previously this path left `connect()` pending until its timeout
          // when a broker rejected/closes before CONNACK. A lobby could then
          // wait needlessly even though the failover was already scheduled.
          if (failedBeforeConnect) settle(false);
          if (!this.closed) {
            this.scheduleReconnect();
          }
        };
      } catch {
        this.connecting = false;
        settle(false);
      }
    });
  }

  private tryNextBroker() {
    this.brokerIndex++;
  }

  private scheduleReconnect() {
    clearTimeout(this.reconnectTimer as number);
    this.reconnectTimer = setTimeout(() => {
      if (!this.closed && !this.connected && !this.connecting) {
        this.tryNextBroker();
        void this.connect();
      }
    }, 2_500);
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.connected && this.ws?.readyState === 1) {
        this.ws.send(new Uint8Array([0xc0, 0x00])); // PINGREQ
      }
    }, 25_000);
  }

  private stopPing() {
    clearInterval(this.pingTimer as number);
  }

  private handlePublishPacket(buffer: Uint8Array) {
    let offset = 1;
    let multiplier = 1;
    let length = 0;
    while (offset < buffer.length) {
      const byte = buffer[offset++];
      length += (byte & 0x7f) * multiplier;
      if ((byte & 0x80) === 0) break;
      multiplier *= 128;
    }

    if (offset + 2 > buffer.length) return;
    const topicLen = (buffer[offset] << 8) | buffer[offset + 1];
    offset += 2;
    if (offset + topicLen > buffer.length) return;
    const topic = utf8BytesToString(buffer.subarray(offset, offset + topicLen));
    offset += topicLen;

    const payload = utf8BytesToString(buffer.subarray(offset));

    for (const [subTopic, handlers] of this.subscriptions.entries()) {
      if (this.topicMatches(subTopic, topic)) {
        handlers.forEach(fn => fn(payload, topic));
      }
    }
  }

  private topicMatches(pattern: string, topic: string): boolean {
    if (pattern === topic || pattern === '#') return true;
    const patternParts = pattern.split('/');
    const topicParts = topic.split('/');
    for (let i = 0; i < patternParts.length; i++) {
      if (patternParts[i] === '#') return true;
      if (patternParts[i] === '+') continue;
      if (patternParts[i] !== topicParts[i]) return false;
    }
    return patternParts.length === topicParts.length;
  }

  subscribe(topic: string, handler: (payload: string, topic: string) => void): () => void {
    let handlers = this.subscriptions.get(topic);
    if (!handlers) {
      handlers = new Set();
      this.subscriptions.set(topic, handlers);
      if (this.connected && this.ws?.readyState === 1) {
        this.sendSubscribePacket(topic);
      }
    }
    handlers.add(handler);

    return () => {
      const set = this.subscriptions.get(topic);
      if (set) {
        set.delete(handler);
        if (set.size === 0) {
          this.subscriptions.delete(topic);
        }
      }
    };
  }

  publish(topic: string, message: string): void {
    if (!this.connected || !this.ws || this.ws.readyState !== 1) {
      this.enqueueMessage({ topic, payload: message });
      if (!this.connecting && !this.closed) void this.connect();
      return;
    }

    const topicBytes = stringToUtf8Bytes(topic);
    const payloadBytes = stringToUtf8Bytes(message);
    const varHeader = [0x00, topicBytes.length, ...topicBytes];
    const rem = varHeader.length + payloadBytes.length;
    const packet = new Uint8Array([0x30, ...encodeRemainingLength(rem), ...varHeader, ...payloadBytes]);
    try {
      this.ws.send(packet);
    } catch {
      this.enqueueMessage({ topic, payload: message });
    }
  }

  private sendSubscribePacket(topic: string) {
    const topicBytes = stringToUtf8Bytes(topic);
    const packetId = this.packetIdCounter++ % 65535 + 1;
    const varHeader = [(packetId >> 8) & 0xff, packetId & 0xff];
    const payload = [0x00, topicBytes.length, ...topicBytes, 0x00]; // QoS 0
    const rem = varHeader.length + payload.length;
    const packet = new Uint8Array([0x82, ...encodeRemainingLength(rem), ...varHeader, ...payload]);
    try {
      this.ws?.send(packet);
    } catch {
      // Ignore
    }
  }

  private resubscribeAll() {
    for (const topic of this.subscriptions.keys()) {
      this.sendSubscribePacket(topic);
    }
  }

  private flushQueue() {
    while (this.messageQueue.length > 0 && this.connected && this.ws?.readyState === 1) {
      const item = this.messageQueue.shift();
      if (item) this.publish(item.topic, item.payload);
    }
  }

  private enqueueMessage(message: { topic: string; payload: string }) {
    // Presence heartbeats are replaceable; keeping their latest version is
    // more useful than retaining stale traffic through a long offline spell.
    if (message.topic === TOPIC_LOBBY_LIST) {
      const index = this.messageQueue.findIndex(item => item.topic === message.topic);
      if (index >= 0) this.messageQueue.splice(index, 1);
    }
    if (this.messageQueue.length >= MAX_QUEUED_SIGNAL_MESSAGES) this.messageQueue.shift();
    this.messageQueue.push(message);
  }

  close() {
    this.closed = true;
    this.stopPing();
    clearTimeout(this.reconnectTimer as number);
    this.subscriptions.clear();
    this.messageQueue.length = 0;
    this.connected = false;
    this.connecting = false;
    if (this.ws) {
      try { this.ws.close(); } catch { /* ignore */ }
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.connected;
  }
}

/** Global shared instance for public signaling */
let sharedMqttClient: MqttWsSignalingClient | null = null;

export function getSharedMqttClient(): MqttWsSignalingClient {
  if (!sharedMqttClient) {
    sharedMqttClient = new MqttWsSignalingClient();
  }
  return sharedMqttClient;
}

/** Generates clean, memorable tactical room codes like 'VIPER-04' or 'TITAN-88' */
export function generateRoomCode(): string {
  const WORDS = [
    'VIPER', 'TITAN', 'CYBER', 'GHOST', 'NEXUS', 'STRIKE', 'RAVEN',
    'PHANTOM', 'SPECTRE', 'BLADE', 'APEX', 'NOVA', 'VORTEX', 'SYNAPSE'
  ];
  const word = WORDS[Math.floor(Math.random() * WORDS.length)];
  const num = Math.floor(10 + Math.random() * 90);
  return `${word}-${num}`;
}

export function normalizeRoomCode(code: string): string {
  return code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '');
}

/** Active lobby tracking and discovery */
export class LobbyDiscovery {
  private lobbies = new Map<string, PublicLobbyInfo>();
  private unsubscribe?: () => void;
  private listeners = new Set<(lobbies: PublicLobbyInfo[]) => void>();
  private pruneTimer: number | NodeJS.Timeout = 0;

  start(client: MqttWsSignalingClient = getSharedMqttClient()): () => void {
    void client.connect();
    this.unsubscribe = client.subscribe(TOPIC_LOBBY_LIST, (payload) => {
      try {
        const info: PublicLobbyInfo & { closed?: boolean } = JSON.parse(payload);
        if (info.closed || (info as any).state === 'closed') {
          let removed = false;
          if (info.id && this.lobbies.has(info.id)) { this.lobbies.delete(info.id); removed = true; }
          if (info.code) {
            for (const [id, l] of this.lobbies.entries()) {
              if (l.code === info.code) { this.lobbies.delete(id); removed = true; }
            }
          }
          if (removed) this.notify();
          return;
        }
        if (!info.id || !info.hostName) return;
        info.updatedAt = Date.now();
        // Overwrite any older lobby with same code or hostName to prevent ghost duplicates
        for (const [id, l] of this.lobbies.entries()) {
          if (id !== info.id && (l.code === info.code || l.hostName === info.hostName)) {
            this.lobbies.delete(id);
          }
        }
        this.lobbies.set(info.id, info);
        this.notify();
      } catch {
        // Ignore unreadable payload
      }
    });

    this.pruneTimer = setInterval(() => {
      const now = Date.now();
      let changed = false;
      for (const [id, lobby] of this.lobbies.entries()) {
        if (now - lobby.updatedAt > LOBBY_EXPIRE_MS) {
          this.lobbies.delete(id);
          changed = true;
        }
      }
      if (changed) this.notify();
    }, 2_000);

    return () => this.stop();
  }

  stop() {
    this.unsubscribe?.();
    clearInterval(this.pruneTimer as number);
    this.lobbies.clear();
    this.listeners.clear();
  }

  onLobbiesChange(listener: (lobbies: PublicLobbyInfo[]) => void): () => void {
    this.listeners.add(listener);
    listener(this.getLobbies());
    return () => { this.listeners.delete(listener); };
  }

  getLobbies(): PublicLobbyInfo[] {
    const now = Date.now();
    return [...this.lobbies.values()]
      .filter(l => now - l.updatedAt <= LOBBY_EXPIRE_MS)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  findLobbyByCode(code: string): PublicLobbyInfo | undefined {
    const normalized = normalizeRoomCode(code);
    return this.getLobbies().find(l => normalizeRoomCode(l.code) === normalized || normalizeRoomCode(l.id) === normalized);
  }

  private notify() {
    const list = this.getLobbies();
    this.listeners.forEach(fn => fn(list));
  }
}

/** Hosted Lobby Session over Public WebSocket Signaling */
export class AutoHostedLobby {
  readonly id: string;
  readonly code: string;
  readonly hostName: string;
  private maxPlayers = COOP_MAX_PLAYERS;
  private playerCount = 1;
  private state: 'waiting' | 'in_game' = 'waiting';
  private heartbeatTimer: number | NodeJS.Timeout = 0;
  private unsubs: Array<() => void> = [];
  private closed = false;
  private statusListener?: (status: string) => void;

  constructor(
    hostName: string,
    code?: string,
    id?: string,
    private readonly client: MqttWsSignalingClient = getSharedMqttClient()
  ) {
    this.code = code ? normalizeRoomCode(code) : generateRoomCode();
    this.id = id || `room-${this.code.toLowerCase()}`;
    this.hostName = hostName;
  }

  setStatusListener(listener?: (status: string) => void) {
    this.statusListener = listener;
  }

  start(
    onJoinRequest: (requestId: string, guestName: string, spectate: boolean) => Promise<string>, // returns SDP offer
    onAnswerReceived: (requestId: string, answer: string) => Promise<void>
  ) {
    void this.client.connect().then(() => {
      if (this.closed) return;

      const handleJoinPayload = async (payload: string, originId: string) => {
        if (this.closed) return;
        try {
          const req: { requestId: string; guestName: string; spectate?: boolean } = JSON.parse(payload);
          if (!req.requestId || !req.guestName) return;
          this.statusListener?.(`Operative ${req.guestName} is connecting…`);

          // Create or retrieve offer via WebRTC session
          const offer = await onJoinRequest(req.requestId, req.guestName, Boolean(req.spectate));
          if (this.closed) return;

          // Publish offer to both origin and room identifiers
          const offerPayload = JSON.stringify({ offer });
          const targetIds = new Set([originId, this.id, this.code]);
          for (const targetId of targetIds) {
            this.client.publish(`${ROOM_TOPIC_PREFIX}${targetId}/joins/${req.requestId}/offer`, offerPayload);
          }
        } catch {
          this.statusListener?.('Failed to negotiate peer connection.');
        }
      };

      // Listen for incoming join requests on both room ID and room code
      const unsubJoin1 = this.client.subscribe(`${ROOM_TOPIC_PREFIX}${this.id}/join`, (p) => void handleJoinPayload(p, this.id));
      this.unsubs.push(unsubJoin1);

      if (this.code !== this.id) {
        const unsubJoin2 = this.client.subscribe(`${ROOM_TOPIC_PREFIX}${this.code}/join`, (p) => void handleJoinPayload(p, this.code));
        this.unsubs.push(unsubJoin2);
      }

      // Listen for guests' answers on both room ID and code topics
      const handleAnswer = async (payload: string, topic: string) => {
        if (this.closed) return;
        try {
          const match = topic.match(/\/joins\/([^/]+)\/answer$/);
          const requestId = match ? match[1] : '';
          const { answer } = JSON.parse(payload);
          if (!requestId || !answer) return;

          await onAnswerReceived(requestId, answer);
          this.statusListener?.('Operative connected to squad!');
        } catch {
          // Handled in WebRTC session
        }
      };

      this.unsubs.push(this.client.subscribe(`${ROOM_TOPIC_PREFIX}${this.id}/joins/+/answer`, handleAnswer));
      if (this.code !== this.id) {
        this.unsubs.push(this.client.subscribe(`${ROOM_TOPIC_PREFIX}${this.code}/joins/+/answer`, handleAnswer));
      }

      // Start broadcasting lobby presence
      this.broadcastHeartbeat();
      this.heartbeatTimer = setInterval(() => this.broadcastHeartbeat(), HEARTBEAT_INTERVAL_MS);
    });
  }

  update(playerCount: number, state: 'waiting' | 'in_game') {
    this.playerCount = playerCount;
    this.state = state;
    this.broadcastHeartbeat();
  }

  private broadcastHeartbeat() {
    if (this.closed) return;
    const info: PublicLobbyInfo = {
      id: this.id,
      code: this.code,
      hostName: this.hostName,
      maxPlayers: this.maxPlayers,
      playerCount: this.playerCount,
      state: this.state,
      updatedAt: Date.now(),
    };
    this.client.publish(TOPIC_LOBBY_LIST, JSON.stringify(info));
  }

  close() {
    this.closed = true;
    clearInterval(this.heartbeatTimer as number);
    try {
      this.client.publish(TOPIC_LOBBY_LIST, JSON.stringify({ id: this.id, code: this.code, closed: true }));
    } catch { /* ignore */ }
    this.unsubs.forEach(u => u());
    this.unsubs = [];
  }
}

/** Auto Guest Join Session over Public WebSocket Signaling */
export class AutoLobbyJoin {
  private unsubs: Array<() => void> = [];
  private closed = false;
  private readonly requestId: string;

  constructor(
    private readonly roomId: string,
    private readonly guestName: string,
    private readonly spectate: boolean = false,
    private readonly client: MqttWsSignalingClient = getSharedMqttClient()
  ) {
    this.requestId = 'join-' + Math.random().toString(36).slice(2, 10);
  }

  async connect(
    onOfferReceived: (offer: string) => Promise<string | undefined>, // returns SDP answer, or undefined when another signaling path won
    onStatus: (status: string) => void,
    onError: (err: string) => void,
    timeoutMs = 25_000
  ): Promise<void> {
    await this.client.connect();
    if (this.closed) return;

    return new Promise<void>((resolve, reject) => {
      let resolved = false;
      let retryInterval: any = 0;

      const timer = setTimeout(() => {
        if (!resolved) {
          this.close();
          clearInterval(retryInterval);
          const msg = 'Connection timed out. Squad leader may be unreachable.';
          onError(msg);
          reject(new Error(msg));
        }
      }, timeoutMs);

      onStatus('Pinging squad frequency…');

      // Subscribe to receive host's offer
      const offerTopic = `${ROOM_TOPIC_PREFIX}${this.roomId}/joins/${this.requestId}/offer`;
      const unsubOffer = this.client.subscribe(offerTopic, async (payload) => {
        if (this.closed || resolved) return;
        try {
          const { offer } = JSON.parse(payload);
          if (!offer) return;
          resolved = true;
          clearInterval(retryInterval as number);
          onStatus('Negotiating direct peer link…');

          const answer = await onOfferReceived(offer);
          if (this.closed) return;
          if (!answer) {
            clearTimeout(timer);
            resolve();
            return;
          }

          // Send answer back to host with an immediate burst for WAN packet-loss protection
          const answerTopic = `${ROOM_TOPIC_PREFIX}${this.roomId}/joins/${this.requestId}/answer`;
          const answerPayload = JSON.stringify({ answer });
          this.client.publish(answerTopic, answerPayload);
          setTimeout(() => {
            if (!this.closed) this.client.publish(answerTopic, answerPayload);
          }, 600);

          clearTimeout(timer);
          onStatus('Link verified — syncing tactical mesh…');
          resolve();
        } catch {
          clearTimeout(timer);
          clearInterval(retryInterval as number);
          const msg = 'Failed to establish peer connection with host.';
          onError(msg);
          reject(new Error(msg));
        }
      });
      this.unsubs.push(unsubOffer);

      // Send join request repeatedly every 1.2s until offer is received
      const sendJoin = () => {
        if (this.closed || resolved) return;
        const joinTopic = `${ROOM_TOPIC_PREFIX}${this.roomId}/join`;
        this.client.publish(joinTopic, JSON.stringify({
          requestId: this.requestId,
          guestName: this.guestName,
          spectate: this.spectate,
        }));
      };

      sendJoin();
      retryInterval = setInterval(sendJoin, 1_200);
      this.unsubs.push(() => clearInterval(retryInterval));
    });
  }

  close() {
    this.closed = true;
    this.unsubs.forEach(u => u());
    this.unsubs = [];
  }
}
