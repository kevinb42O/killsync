import { DEFAULT_PUBLIC_STUN_SERVERS, ManualWebRTCSession, decodeSignal } from './ManualWebRTCSession';
import { multiplayerPlayerLimit } from './protocol';
import type { CoopGameMode } from './CoopGameMode';
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
  gameMode?: CoopGameMode;
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

export function friendsUsesHttp() { return import.meta.env.VITE_FRIENDS_SIGNALING_MODE !== 'broker'; }

function hasHttpSignalingFallback() {
  return Boolean(import.meta.env.VITE_MULTIPLAYER_SIGNALING_URL?.trim());
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const signal = init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000);
  const response = await fetch(apiUrl(path), {
    ...init, signal,
    headers: { 'Content-Type': 'application/json', ...init.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(playerMessage(body?.error, response.status));
  }
  return response.status === 204 ? undefined as T : response.json() as Promise<T>;
}

function auth(token: string) { return { Authorization: `Bearer ${token}` }; }

export async function listPublicLobbies(gameMode: CoopGameMode = 'survival'): Promise<PublicLobby[]> {
  if (gameMode === 'friends' && friendsUsesHttp()) return (await request<{rooms:PublicLobby[]}>('/rooms?mode=friends')).rooms.filter(r=>r.gameMode==='friends');
  ensureLobbyDiscoveryStarted();
  const brokerLobbies: PublicLobby[] = globalLobbyDiscovery.getLobbies().map(l => ({
    id: l.id,
    code: l.code,
    hostName: l.hostName,
    maxPlayers: l.maxPlayers,
    playerCount: l.playerCount,
    state: l.state,
    gameMode: l.gameMode,
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

export async function fetchIceServers(gameMode: CoopGameMode = 'survival'): Promise<RTCIceServer[]> {
  if (gameMode === 'friends' && friendsUsesHttp()) {
    const r=await request<{iceServers:RTCIceServer[]}>('/ice-servers?mode=friends');
    if(!Array.isArray(r.iceServers)||!r.iceServers.length)throw new Error('The island connection service is unavailable.');
    return r.iceServers;
  }
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
  private offerTasks = new Map<string, Promise<string>>();
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

  static async create(hostName: string, customCode?: string, gameMode: CoopGameMode = 'survival') {
    const code = customCode ? normalizeRoomCode(customCode) : generateRoomCode();
    const roomId = `room-${code.toLowerCase()}`;
    const auto = new AutoHostedLobby(hostName, code, roomId, undefined, gameMode);

    let localToken: string | undefined;
    if (gameMode === 'friends' && friendsUsesHttp() || hasHttpSignalingFallback()) {
      try {
        const response = await request<{ room: PublicLobby; hostToken: string }>('/rooms', {
          method: 'POST',
          body: JSON.stringify({ id: roomId, hostName, maxPlayers: multiplayerPlayerLimit(gameMode), code, gameMode }),
        });
        localToken = response.hostToken;
      } catch (error) {
        if(gameMode === 'friends' && friendsUsesHttp())throw error;
        // Local backend optional; broker carries the squad
      }
    }

    const room: PublicLobby = {
      id: roomId,
      code,
      hostName,
      maxPlayers: multiplayerPlayerLimit(gameMode),
      playerCount: 1,
      state: 'waiting',
      gameMode,
    };

    return new HostedLobby(room, auto, localToken);
  }

  setStatusListener(listener?: (status: string) => void) {
    this.statusListener = listener;
    this.autoLobby.setStatusListener(listener);
  }

  start(session: ManualWebRTCSession) {
    // 1. Start real-time broker signaling
    if (!(this.room.gameMode === 'friends' && friendsUsesHttp())) this.autoLobby.start(
      async (requestId, guestName) => {
        return this.offerFor(session, requestId);
      },
      async (requestId, answer) => {
        if (this.completed.has(requestId)) return;
        await session.acceptAnswer(answer);
        this.completed.add(requestId);
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
        const activeRequests=new Set(joins.map(j=>j.requestId));
        for(const [id,offer] of this.offers) if(!activeRequests.has(id)){ const peerId=decodeSignal(offer).peerId; if(!session.peerInfo.some(p=>p.peerId===peerId&&p.state==='connected'))session.disconnectPeer(peerId);this.offers.delete(id);this.busy.delete(id);this.completed.delete(id);this.offerTasks.delete(id); }
        await Promise.all(joins.map(async join => {
          if (join.answer && this.busy.has(join.requestId) && !this.completed.has(join.requestId)) {
            await session.acceptAnswer(join.answer);
            this.completed.add(join.requestId);
            if (this.closed) return;
            this.busy.delete(join.requestId);
            // Friends retains the offer until its join reservation expires so
            // the cleanup pass also releases completed deduplication entries.
            if (this.room.gameMode !== 'friends') this.offers.delete(join.requestId);
            this.statusListener?.(`${join.guestName} joined squad.`);
          } else if (!join.offer && !this.busy.has(join.requestId)) {
            if (session.occupiedPeerSlots >= multiplayerPlayerLimit(this.room.gameMode) - 1) {
              this.busy.add(join.requestId);
              this.statusListener?.('This squad is full.');
              return;
            }
            this.busy.add(join.requestId);
            this.statusListener?.(`${join.guestName} joining…`);
            try {
              const offer = await this.offerFor(session, join.requestId);
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
        }));
      } catch {
        if (!this.closed) this.statusListener?.('Reconnecting squad signal…');
      } finally {
        this.requests.delete(controller);
        if (!this.closed) this.timer = window.setTimeout(() => void poll(), POLL_MS);
      }
    };
    void poll();
  }

  private offerFor(session: ManualWebRTCSession, requestId: string): Promise<string> {
    const existing=this.offerTasks.get(requestId);if(existing)return existing;
    if(session.occupiedPeerSlots>=multiplayerPlayerLimit(this.room.gameMode)-1)return Promise.reject(new Error('This squad is full.'));
    const task=session.createOffer().then(offer=>{if(this.closed){session.disconnectPeer(decodeSignal(offer).peerId);throw new Error('Room closed');}this.offers.set(requestId,offer);return offer;}).catch(error=>{this.offerTasks.delete(requestId);throw error;});
    this.offerTasks.set(requestId,task);return task;
  }

  update(playerCount: number, state: 'waiting' | 'in_game') {
    if (this.closed) return;
    this.playerCount = playerCount;
    this.state = state;
    if (!(this.room.gameMode === 'friends' && friendsUsesHttp())) this.autoLobby.update(playerCount, state);
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
    this.offerTasks.clear();this.offers.clear();this.busy.clear();this.completed.clear();
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

  static async create(roomId: string, guestName: string, spectate: boolean = false, gameMode: CoopGameMode = 'survival') {
    if(gameMode==='friends' && friendsUsesHttp()){
      const {room}=await request<{room:PublicLobby}>(`/rooms/${encodeURIComponent(roomId)}?mode=friends`);
      if(room.gameMode!=='friends')throw new Error('That code opens a Survival room.');
      const r=await request<{requestId:string;joinToken:string}>(`/rooms/${room.id}/joins`,{method:'POST',body:JSON.stringify({guestName,spectate:false})});
      return new LobbyJoin(room.id,r.requestId,r.joinToken);
    }
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
  return serverMessage || 'Couldn’t reach the squad frequency. Try again.';
}
