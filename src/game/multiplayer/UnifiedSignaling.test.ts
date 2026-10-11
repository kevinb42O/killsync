import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  generateRoomCode,
  normalizeRoomCode,
  LobbyDiscovery,
  PublicLobbyInfo,
  MqttWsSignalingClient,
} from './UnifiedSignaling';
import { COOP_MAX_PLAYERS } from './protocol';

describe('UnifiedSignaling', () => {
  it('generates valid tactical room codes', () => {
    for (let i = 0; i < 20; i++) {
      const code = generateRoomCode();
      expect(code).toMatch(/^[A-Z]+-\d{2}$/);
      expect(normalizeRoomCode(code)).toBe(code);
    }
  });

  it('normalizes room codes regardless of lowercase or spacing', () => {
    expect(normalizeRoomCode(' viper-04 ')).toBe('VIPER-04');
    expect(normalizeRoomCode('cyber_88')).toBe('CYBER88');
    expect(normalizeRoomCode('Strike-12!')).toBe('STRIKE-12');
  });

  it('tracks, searches, and filters active lobbies', () => {
    const discovery = new LobbyDiscovery();
    // Simulate active lobbies
    const mockLobby1: PublicLobbyInfo = {
      id: 'room-1',
      code: 'VIPER-01',
      hostName: 'KEVIN',
      maxPlayers: COOP_MAX_PLAYERS,
      playerCount: 1,
      state: 'waiting',
      updatedAt: Date.now(),
    };
    const mockLobby2: PublicLobbyInfo = {
      id: 'room-2',
      code: 'TITAN-99',
      hostName: 'SARAH',
      maxPlayers: COOP_MAX_PLAYERS,
      playerCount: 2,
      state: 'waiting',
      updatedAt: Date.now() - 1000,
    };

    // @ts-expect-error accessing private for test
    discovery.lobbies.set(mockLobby1.id, mockLobby1);
    // @ts-expect-error accessing private for test
    discovery.lobbies.set(mockLobby2.id, mockLobby2);

    const lobbies = discovery.getLobbies();
    expect(lobbies.length).toBe(2);
    expect(lobbies[0].id).toBe('room-1');

    const foundByCode = discovery.findLobbyByCode('viper-01');
    expect(foundByCode?.id).toBe('room-1');

    const foundById = discovery.findLobbyByCode('room-2');
    expect(foundById?.code).toBe('TITAN-99');

    discovery.stop();
  });
});

describe('MQTT broker acceptance and failover', () => {
  afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

  it.each(['rejection', 'timeout'])('keeps lobby publications queued on %s and sends them after failover succeeds', async failure => {
    vi.useFakeTimers();
    const sockets: FakeSocket[] = [];
    class FakeSocket {
      readyState = 1;
      binaryType = '';
      onopen?: () => void;
      onmessage?: (event: { data: ArrayBuffer }) => void;
      onclose?: () => void;
      onerror?: () => void;
      send = vi.fn();
      constructor(readonly url: string) { sockets.push(this); }
      close() { this.readyState = 3; this.onclose?.(); }
      acknowledge(code: number) { this.onmessage?.({ data: new Uint8Array([0x20, 2, 0, code]).buffer }); }
    }
    vi.stubGlobal('WebSocket', FakeSocket);
    const client = new MqttWsSignalingClient(['wss://first', 'wss://second']);
    const connection = client.connect();
    client.subscribe('killsync/v1/lobbies', () => {});
    client.publish('killsync/v1/lobbies', '{"id":"room-viper-04"}');
    if (failure === 'rejection') sockets[0].acknowledge(3);
    else await vi.advanceTimersByTimeAsync(5000);
    expect(await connection).toBe(false);
    expect(client.isConnected()).toBe(false);
    expect(sockets[0].send).not.toHaveBeenCalled();
    client.publish('killsync/v1/lobbies', '{"id":"room-viper-04","playerCount":2}');
    expect(sockets).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(2500);
    expect(sockets[1].url).toBe('wss://second');
    sockets[1].acknowledge(0);
    expect(client.isConnected()).toBe(true);
    expect(sockets[1].send.mock.calls.map(([packet]) => packet[0] >> 4)).toEqual([8, 3]);
    client.close();
  });
});
