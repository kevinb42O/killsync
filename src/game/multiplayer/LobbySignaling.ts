import { ManualWebRTCSession } from './ManualWebRTCSession';

export type PublicLobby = {
  id: string;
  hostName: string;
  maxPlayers: number;
  playerCount: number;
  state: 'waiting' | 'in_game';
};

const POLL_MS = 600;
const JOIN_TIMEOUT_MS = 25_000;

function apiUrl(path: string) {
  const configured = import.meta.env.VITE_MULTIPLAYER_SIGNALING_URL?.replace(/\/$/, '');
  return `${configured || ''}/api/multiplayer${path}`;
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
  const response = await request<{ rooms: PublicLobby[] }>('/rooms');
  return response.rooms;
}

export async function fetchIceServers(): Promise<RTCIceServer[]> {
  try {
    const response = await request<{ iceServers: RTCIceServer[] }>('/ice-servers');
    return response.iceServers;
  } catch {
    return [{ urls: 'stun:stun.l.google.com:19302' }];
  }
}

export class HostedLobby {
  readonly room: PublicLobby;
  private readonly token: string;
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

  private constructor(room: PublicLobby, token: string) { this.room = room; this.token = token; }

  static async create(hostName: string) {
    const response = await request<{ room: PublicLobby; hostToken: string }>('/rooms', { method: 'POST', body: JSON.stringify({ hostName, maxPlayers: 4 }) });
    return new HostedLobby(response.room, response.hostToken);
  }

  setStatusListener(listener?: (status: string) => void) { this.statusListener = listener; }

  start(session: ManualWebRTCSession) {
    const poll = async () => {
      if (this.closed) return;
      const controller = new AbortController();
      this.requests.add(controller);
      try {
        if (Date.now() - this.lastHeartbeat > 10_000) this.update(this.playerCount, this.state);
        const { joins } = await request<{ joins: Array<{ requestId: string; guestName: string; offer?: string; answer?: string }> }>(`/rooms/${this.room.id}/joins`, { headers: auth(this.token), signal: controller.signal });
        if (this.closed) return;
        for (const join of joins) {
          if (join.answer && this.busy.has(join.requestId) && !this.completed.has(join.requestId)) {
            this.completed.add(join.requestId);
            await session.acceptAnswer(join.answer);
            if (this.closed) return;
            this.busy.delete(join.requestId);
            this.offers.delete(join.requestId);
            this.statusListener?.(`${join.guestName} is joining…`);
          } else if (!join.offer && !this.busy.has(join.requestId)) {
            this.busy.add(join.requestId);
            this.statusListener?.(`${join.guestName} is joining…`);
            try {
              const offer = this.offers.get(join.requestId) || await session.createOffer();
              this.offers.set(join.requestId, offer);
              if (this.closed) return;
              await request(`/rooms/${this.room.id}/joins/${join.requestId}/offer`, { method: 'POST', headers: auth(this.token), body: JSON.stringify({ offer }), signal: controller.signal });
            } catch (error) {
              this.busy.delete(join.requestId);
              throw error;
            }
          }
        }
      } catch (error) {
        if (!this.closed) this.statusListener?.('Server is reconnecting…');
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
    this.lastHeartbeat = Date.now();
    void request(`/rooms/${this.room.id}`, { method: 'PATCH', headers: auth(this.token), body: JSON.stringify({ playerCount, state }) }).catch(() => undefined);
  }

  close() {
    this.closed = true;
    window.clearTimeout(this.timer);
    for (const controller of this.requests) controller.abort();
    this.requests.clear();
    void request(`/rooms/${this.room.id}`, { method: 'DELETE', headers: auth(this.token) }).catch(() => undefined);
  }
}

export class LobbyJoin {
  private closed = false;
  private timer = 0;
  private acceptedOffer = false;
  private activeRequest?: AbortController;
  private constructor(private readonly roomId: string, private readonly requestId: string, private readonly token: string) {}

  static async create(roomId: string, guestName: string, spectate: boolean = false) {
    const response = await request<{ requestId: string; joinToken: string }>(`/rooms/${roomId}/joins`, { method: 'POST', body: JSON.stringify({ guestName, spectate }) });
    return new LobbyJoin(roomId, response.requestId, response.joinToken);
  }

  waitForHost(session: ManualWebRTCSession, onStatus: (status: string) => void, onError: (message: string) => void, onTimeout: () => void) {
    const startedAt = Date.now();
    const poll = async () => {
      if (this.closed || this.acceptedOffer) return;
      if (Date.now() - startedAt >= JOIN_TIMEOUT_MS) {
        this.close();
        onError('Couldn’t connect to this server. Try another one.');
        onTimeout();
        return;
      }
      const controller = new AbortController();
      this.activeRequest = controller;
      try {
        const data = await request<{ offer?: string }>(`/rooms/${this.roomId}/joins/${this.requestId}`, { headers: auth(this.token), signal: controller.signal });
        if (this.closed) return;
        if (!data.offer) return;
        this.acceptedOffer = true;
        onStatus('Joining match…');
        const answer = await session.acceptOffer(data.offer);
        if (this.closed) return;
        await request(`/rooms/${this.roomId}/joins/${this.requestId}/answer`, { method: 'POST', headers: auth(this.token), body: JSON.stringify({ answer }), signal: controller.signal });
        if (this.closed) return;
        onStatus('Ready — waiting for the host to start.');
      } catch (error) {
        this.acceptedOffer = false;
        if (!this.closed) onError('Couldn’t join this server. Try another one.');
      } finally {
        if (this.activeRequest === controller) this.activeRequest = undefined;
        if (!this.closed && !this.acceptedOffer) this.timer = window.setTimeout(() => void poll(), POLL_MS);
      }
    };
    void poll();
  }

  close() {
    this.closed = true;
    window.clearTimeout(this.timer);
    this.activeRequest?.abort();
    this.activeRequest = undefined;
    void request(`/rooms/${this.roomId}/joins/${this.requestId}`, { method: 'DELETE', headers: auth(this.token) }).catch(() => undefined);
  }
}

function playerMessage(serverMessage: string | undefined, status: number) {
  if (serverMessage === 'This squad is full.') return 'This server is full.';
  if (serverMessage === 'This squad is no longer online.') return 'This server is no longer available.';
  if (status >= 500) return 'Servers are busy right now. Try again in a moment.';
  return 'Couldn’t reach the server. Try again.';
}
