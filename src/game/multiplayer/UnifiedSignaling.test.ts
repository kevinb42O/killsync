import { describe, expect, it } from 'vitest';
import {
  generateRoomCode,
  normalizeRoomCode,
  LobbyDiscovery,
  PublicLobbyInfo,
} from './UnifiedSignaling';

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
      maxPlayers: 4,
      playerCount: 1,
      state: 'waiting',
      updatedAt: Date.now(),
    };
    const mockLobby2: PublicLobbyInfo = {
      id: 'room-2',
      code: 'TITAN-99',
      hostName: 'SARAH',
      maxPlayers: 4,
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
