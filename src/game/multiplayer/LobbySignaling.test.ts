import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const broker = vi.hoisted(() => ({
  start: vi.fn(), update: vi.fn(), close: vi.fn(), connect: vi.fn(),
  join: vi.fn(), discover: vi.fn(), find: vi.fn(), lobbies: vi.fn(),
}));

vi.mock('./UnifiedSignaling', () => ({
  AutoHostedLobby: class {
    start = broker.start; update = broker.update; close = broker.close;
    setStatusListener = vi.fn();
  },
  AutoLobbyJoin: class {
    constructor(...args: unknown[]) { broker.join(...args); }
    connect = broker.connect; close = broker.close;
  },
  LobbyDiscovery: class {
    start = broker.discover; getLobbies = broker.lobbies;
    findLobbyByCode = broker.find;
  },
  generateRoomCode: () => 'VIPER-04',
  normalizeRoomCode: (code: string) => code.trim().toUpperCase().replace(/[^A-Z0-9-]/g, ''),
  getSharedMqttClient: () => ({}),
}));

import { fetchIceServers, friendsUsesHttp, HostedLobby, listPublicLobbies, LobbyJoin } from './LobbySignaling';
import { DEFAULT_PUBLIC_STUN_SERVERS, type ManualWebRTCSession } from './ManualWebRTCSession';

describe('Friends lobby signaling across deployment types', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('VITE_MULTIPLAYER_SIGNALING_URL', '');
    vi.stubEnv('VITE_FRIENDS_SIGNALING_MODE', '');
    vi.stubGlobal('window', globalThis);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('No HTTP service')));
    broker.find.mockReturnValue(undefined);
    broker.lobbies.mockReturnValue([]);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

  it('uses shared broker discovery and ICE on static hosts and separate local servers', async () => {
    broker.lobbies.mockReturnValue([
      { id: 'room-viper-04', gameMode: 'friends' },
      { id: 'room-titan-99', gameMode: 'survival' },
      { id: 'legacy-survival' },
    ]);
    expect(friendsUsesHttp()).toBe(false);
    expect(await listPublicLobbies('friends')).toEqual([{ id: 'room-viper-04', gameMode: 'friends' }]);
    expect(await fetchIceServers('friends')).toEqual(DEFAULT_PUBLIC_STUN_SERVERS);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('advertises and updates a Friends host on the shared broker without an HTTP service', async () => {
    const lobby = await HostedLobby.create('Friend', 'VIPER-04', 'friends');
    lobby.start({} as ManualWebRTCSession);
    lobby.update(2, 'waiting');
    expect(lobby.room.id).toBe('room-viper-04');
    expect(broker.start).toHaveBeenCalledOnce();
    expect(broker.update).toHaveBeenCalledWith(2, 'waiting');
    expect(fetch).not.toHaveBeenCalled();
    lobby.close();
  });

  it.each([' viper-04 ', 'room-viper-04', 'ROOM-VIPER-04'])('joins %s before discovery receives the host heartbeat', async code => {
    const join = await LobbyJoin.create(code, 'Guest', false, 'friends');
    expect(broker.join).toHaveBeenCalledWith('room-viper-04', 'Guest', false);
    expect(fetch).not.toHaveBeenCalled();
    join.close();
  });

  it('uses discovered room IDs and rejects Survival codes in Friends', async () => {
    broker.find.mockReturnValue({ id: 'custom-id', gameMode: 'friends' });
    const join = await LobbyJoin.create('VIPER-04', 'Guest', false, 'friends');
    expect(broker.join).toHaveBeenCalledWith('custom-id', 'Guest', false);
    join.close();
    broker.find.mockReturnValue({ id: 'survival-id', gameMode: 'survival' });
    await expect(LobbyJoin.create('TITAN-99', 'Guest', false, 'friends')).rejects.toThrow('Survival');
  });

  it('preserves Survival direct room identifiers', async () => {
    const join = await LobbyJoin.create('legacy-custom-id', 'Guest', false, 'survival');
    expect(broker.join).toHaveBeenCalledWith('legacy-custom-id', 'Guest', false);
    join.close();
  });

  it('defaults to HTTP when a shared service URL is configured', async () => {
    vi.stubEnv('VITE_MULTIPLAYER_SIGNALING_URL', 'https://lobbies.example.com');
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ rooms: [{ id: 'shared', gameMode: 'friends' }] })));
    expect(friendsUsesHttp()).toBe(true);
    expect(await listPublicLobbies('friends')).toEqual([{ id: 'shared', gameMode: 'friends' }]);
    expect(fetch).toHaveBeenCalledWith('https://lobbies.example.com/api/multiplayer/rooms?mode=friends', expect.anything());
  });

  it('supports explicit same-origin HTTP and broker overrides', () => {
    vi.stubEnv('VITE_FRIENDS_SIGNALING_MODE', 'http');
    expect(friendsUsesHttp()).toBe(true);
    vi.stubEnv('VITE_MULTIPLAYER_SIGNALING_URL', 'https://lobbies.example.com');
    vi.stubEnv('VITE_FRIENDS_SIGNALING_MODE', 'broker');
    expect(friendsUsesHttp()).toBe(false);
  });

  it('keeps configured HTTP failures visible instead of silently splitting lobby discovery', async () => {
    vi.stubEnv('VITE_FRIENDS_SIGNALING_MODE', 'http');
    await expect(listPublicLobbies('friends')).rejects.toThrow('No HTTP service');
    await expect(HostedLobby.create('Friend', 'VIPER-04', 'friends')).rejects.toThrow('No HTTP service');
    expect(broker.start).not.toHaveBeenCalled();
  });
});
