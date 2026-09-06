import { DEFAULT_PUBLIC_STUN_SERVERS, ManualWebRTCSession } from './ManualWebRTCSession';
import {
  AutoHostedLobby,
  AutoLobbyJoin,
  generateRoomCode,
  getSharedMqttClient,
  LobbyDiscovery,
  normalizeRoomCode,
} from './UnifiedSignaling';

export type PublicLobby = {
  id: string;
  code?: string;
  hostName: string;
  maxPlayers: number;
  playerCount: number;
  state: 'waiting' | 'in_game';
  pingMs?: number;
};

const POLL_MS = 600;
const JOIN_TIMEOUT_MS = 25_000;

export const globalLobbyDiscovery = new LobbyDiscovery();
let discoveryStarted = false;

export function ensureLobbyDiscoveryStarted() {
  if (!discoveryStarted) {
    discoveryStarted = true;
    globalLobbyDiscovery.start(getSharedMqttClient());
  }
  return globalLobbyDiscovery;
}

function apiUrl(path: string) {
  const configured = import.meta.env.VITE_MULTIPLAYER_SIGNALING_URL?.replace(/\/$/, '');
  return `${configured || ''}/api/multiplayer${path}`;
}

function hasHttpSignalingFallback() {
  return Boolean(import.meta.env.VITE_MULTIPLAYER_SIGNALING_URL?.trim());
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(apiUrl(path), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(playerMessage(body?.error, response.status));
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

function auth(token: string) { return { Authorization: `Bearer ${token}` }; }

export async function listPublicLobbies(): Promise<PublicLobby[]> {
  ensureLobbyDiscoveryStarted();
  const brokerLobbies: PublicLobby[] = globalLobbyDiscovery.getLobbies().map(l => ({
    id: l.id,
    code: l.code,
    hostName: l.hostName,
    maxPlayers: l.maxPlayers,
    playerCount: l.playerCount,
    state: l.state,
    pingMs: l.pingMs,
  }));

  // Direct browser deployments use MQTT only for signaling. Do not probe a
  // same-origin API that does not exist (and cannot race the broker join).
  if (!hasHttpSignalingFallback()) return brokerLobbies;

  try {
    const response = await request<{ rooms: PublicLobby[] }>('/rooms');
    const localRooms = response.rooms || [];
    
    // Strict deduplication by unique normalized room code
    const seenCodes = new Set<string>();
    const merged: PublicLobby[] = [];

    // Broker lobbies are live real-time heartbeats
    for (const lobby of brokerLobbies) {
      const key = normalizeRoomCode(lobby.code || lobby.id);
      if (!seenCodes.has(key)) {
        seenCodes.add(key);
        merged.push(lobby);
      }
    }

    // Add local rooms only if not already present on broker
    for (const room of localRooms) {
      const key = normalizeRoomCode(room.code || room.id);
      if (!seenCodes.has(key)) {
        seenCodes.add(key);
        merged.push({
          ...room,
          code: room.code || key,
        });
      }
    }
    return merged;
  } catch {
    return brokerLobbies;
  }
}

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  if (!hasHttpSignalingFallback()) return DEFAULT_PUBLIC_STUN_SERVERS;
  try {
    const response = await request<{ iceServers: RTCIceServer[] }>('/ice-servers');
    if (response.iceServers && response.iceServers.length > 0) {
      return response.iceServers;
    }
  } catch {
    // Local endpoint optional; redundant public STUN ensures WAN connectivity
  }
  return DEFAULT_PUBLIC_STUN_SERVERS;
}

export class HostedLobby {
  readonly room: PublicLobby;
  private readonly token?: string;
  private readonly autoLobby: AutoHostedLobby;
  private timer = 0;
  private busy = new Set<string>();
  private completed = new Set<string>();
  private offers = new Map<string, string>();
  private statusListener?: (status: string) => void;
  private closed = false;
  private playerCount = 1;
  private state: 'waiting' | 'in_game' = 'waiting';
  private lastHeartbeat = 0;
  private readonly requests = new Set<AbortController>();

  private constructor(room: PublicLobby, autoLobby: AutoHostedLobby, token?: string) {
    this.room = room;
    this.autoLobby = autoLobby;
    this.token = token;
  }

  static async create(hostName: string, customCode?: string) {
    const code = customCode ? normalizeRoomCode(customCode) : generateRoomCode();
    const roomId = `room-${code.toLowerCase()}`;
    const auto = new AutoHostedLobby(hostName, code, roomId);

    let localToken: string | undefined;
    if (hasHttpSignalingFallback()) {
      try {
        const response = await request<{ room: PublicLobby; hostToken: string }>('/rooms', {
          method: 'POST',
          body: JSON.stringify({ id: roomId, hostName, maxPlayers: 4, code }),
        });
        localToken = response.hostToken;
      } catch {
        // Local backend optional; broker carries the squad
      }
    }

    const room: PublicLobby = {
      id: roomId,
      code,
      hostName,
      maxPlayers: 4,
      playerCount: 1,
      state: 'waiting',
    };

    return new HostedLobby(room, auto, localToken);
  }

  setStatusListener(listener?: (status: string) => void) {
    this.statusListener = listener;
    this.autoLobby.setStatusListener(listener);
  }

  start(session: ManualWebRTCSession) {
    // 1. Start real-time broker signaling
    this.autoLobby.start(
      async (requestId, guestName) => {
        const existing = this.offers.get(requestId);
        if (existing) return existing;
        const offer = await session.createOffer();
        this.offers.set(requestId, offer);
        return offer;
      },
      async (requestId, answer) => {
        if (this.completed.has(requestId)) return;
        this.completed.add(requestId);
        await session.acceptAnswer(answer);
        this.statusListener?.('Operative connected via direct WebRTC link!');
      }
    );

    // 2. Start local HTTP polling if local room was created
    if (!this.token) return;

    const poll = async () => {
      if (this.closed) return;
      const controller = new AbortController();
      this.requests.add(controller);
      try {
        if (Date.now() - this.lastHeartbeat > 10_000) this.update(this.playerCount, this.state);
        const { joins } = await request<{ joins: Array<{ requestId: string; guestName: string; offer?: string; answer?: string }> }>(
          `/rooms/${this.room.id}/joins`,
          { headers: auth(this.token!), signal: controller.signal }
        );
        if (this.closed) return;
        for (const join of joins) {
          if (join.answer && this.busy.has(join.requestId) && !this.completed.has(join.requestId)) {
            this.completed.add(join.requestId);
            await session.acceptAnswer(join.answer);
            if (this.closed) return;
            this.busy.delete(join.requestId);
            this.offers.delete(join.requestId);
            this.statusListener?.(`${join.guestName} joined squad.`);
          } else if (!join.offer && !this.busy.has(join.requestId)) {
            this.busy.add(join.requestId);
            this.statusListener?.(`${join.guestName} joining…`);
            try {
              const offer = this.offers.get(join.requestId) || await session.createOffer();
              this.offers.set(join.requestId, offer);
              if (this.closed) return;
              await request(`/rooms/${this.room.id}/joins/${join.requestId}/offer`, {
                method: 'POST',
                headers: auth(this.token!),
                body: JSON.stringify({ offer }),
                signal: controller.signal,
              });
            } catch (error) {
              this.busy.delete(join.requestId);
              throw error;
            }
          }
        }
      } catch {
        if (!this.closed) this.statusListener?.('Reconnecting squad signal…');
      } finally {
        this.requests.delete(controller);
        if (!this.closed) this.timer = window.setTimeout(() => void poll(), POLL_MS);
      }
    };
    void poll();
  }

  update(playerCount: number, state: 'waiting' | 'in_game') {
    if (this.closed) return;
    this.playerCount = playerCount;
    this.state = state;
    this.autoLobby.update(playerCount, state);
    this.lastHeartbeat = Date.now();
    if (this.token) {
      void request(`/rooms/${this.room.id}`, {
        method: 'PATCH',
        headers: auth(this.token),
        body: JSON.stringify({ playerCount, state }),
      }).catch(() => undefined);
    }
  }

  close() {
    this.closed = true;
    this.autoLobby.close();
    window.clearTimeout(this.timer);
    for (const controller of this.requests) controller.abort();
    this.requests.clear();
    if (this.token) {
      void request(`/rooms/${this.room.id}`, { method: 'DELETE', headers: auth(this.token) }).catch(() => undefined);
    }
  }
}

export class LobbyJoin {
  private closed = false;
  private timer = 0;
  private acceptedOffer = false;
  private acceptedOfferSource?: 'broker' | 'http';
  private activeRequest?: AbortController;
  private readonly autoJoin?: AutoLobbyJoin;

  private constructor(
    private readonly roomId: string,
    private readonly requestId?: string,
    private readonly token?: string,
    autoJoin?: AutoLobbyJoin
  ) {
    this.autoJoin = autoJoin;
  }

  static async create(roomId: string, guestName: string, spectate: boolean = false) {
    ensureLobbyDiscoveryStarted();
    // Check if room exists in broker discovery or matches code
    const lobby = globalLobbyDiscovery.findLobbyByCode(roomId);
    const targetRoomId = lobby ? lobby.id : roomId;

    const autoJoin = new AutoLobbyJoin(targetRoomId, guestName, spectate);

    let localRequestId: string | undefined;
    let localToken: string | undefined;
    if (hasHttpSignalingFallback()) {
      try {
        const response = await request<{ requestId: string; joinToken: string }>(`/rooms/${targetRoomId}/joins`, {
          method: 'POST',
          body: JSON.stringify({ guestName, spectate }),
        });
        localRequestId = response.requestId;
        localToken = response.joinToken;
      } catch {
        // Local backend optional; broker handles connection
      }
    }

    return new LobbyJoin(targetRoomId, localRequestId, localToken, autoJoin);
  }

  waitForHost(
    session: ManualWebRTCSession,
    onStatus: (status: string) => void,
    onError: (message: string) => void,
    onTimeout: () => void
  ) {
    const startedAt = Date.now();

    // 1. Automated broker join
    if (this.autoJoin) {
      this.autoJoin.connect(
        async (offer) => {
          if (!this.claimOffer('broker')) return undefined;
          this.activeRequest?.abort();
          onStatus('Direct peer link established. Finalizing handshake…');
          try {
            return await session.acceptOffer(offer);
          } catch (error) {
            this.releaseOffer('broker');
            throw error;
          }
        },
        onStatus,
        (errMsg) => {
          if (!this.token) {
            onError(errMsg);
            onTimeout();
          }
        }
      ).catch(() => {
        if (!this.token) {
          onError('Couldn’t reach the squad. Try another room or code.');
          onTimeout();
        }
      });
    }

    // 2. Local HTTP fallback polling if token exists
    if (!this.token || !this.requestId) return;

    const poll = async () => {
      if (this.closed || this.acceptedOffer) return;
      if (Date.now() - startedAt >= JOIN_TIMEOUT_MS) {
        this.close();
        onError('Couldn’t connect to this squad. Try another one.');
        onTimeout();
        return;
      }
      const controller = new AbortController();
      this.activeRequest = controller;
      try {
        const data = await request<{ offer?: string }>(`/rooms/${this.roomId}/joins/${this.requestId}`, {
          headers: auth(this.token!),
          signal: controller.signal,
        });
        if (this.closed || this.acceptedOffer) return;
        if (!data.offer) return;
        if (!this.claimOffer('http')) return;
        onStatus('Joining match…');
        const answer = await session.acceptOffer(data.offer);
        if (this.closed) return;
        await request(`/rooms/${this.roomId}/joins/${this.requestId}/answer`, {
          method: 'POST',
          headers: auth(this.token!),
          body: JSON.stringify({ answer }),
          signal: controller.signal,
        });
        if (this.closed) return;
        onStatus('Ready — waiting for the host to deploy.');
      } catch {
        this.releaseOffer('http');
        if (!this.closed) onError('Couldn’t join this squad. Try another one.');
      } finally {
        if (this.activeRequest === controller) this.activeRequest = undefined;
        if (!this.closed && !this.acceptedOffer) this.timer = window.setTimeout(() => void poll(), POLL_MS);
      }
    };
    void poll();
  }

  close() {
    this.closed = true;
    this.autoJoin?.close();
    window.clearTimeout(this.timer);
    this.activeRequest?.abort();
    this.activeRequest = undefined;
    if (this.token && this.requestId) {
      void request(`/rooms/${this.roomId}/joins/${this.requestId}`, {
        method: 'DELETE',
        headers: auth(this.token),
      }).catch(() => undefined);
    }
  }

  private claimOffer(source: 'broker' | 'http') {
    if (this.acceptedOfferSource) return this.acceptedOfferSource === source;
    this.acceptedOfferSource = source;
    this.acceptedOffer = true;
    return true;
  }

  private releaseOffer(source: 'broker' | 'http') {
    if (this.acceptedOfferSource !== source) return;
    this.acceptedOfferSource = undefined;
    this.acceptedOffer = false;
  }
}

function playerMessage(serverMessage: string | undefined, status: number) {
  if (serverMessage === 'This squad is full.') return 'This squad is full.';
  if (serverMessage === 'This squad is no longer online.') return 'This squad is no longer available.';
  if (status >= 500) return 'Signal broker is busy. Try again in a moment.';
  return 'Couldn’t reach the squad frequency. Try again.';
}
