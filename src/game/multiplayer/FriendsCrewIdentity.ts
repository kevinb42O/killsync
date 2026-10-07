import type { CoopPlayerSeed } from './CoopSimulation';

export const FRIENDS_SESSION_PROTOCOL = 1;
export type FriendsCredential = { worldId: string; playerId: string; token: string };
export type FriendsCrewSave = { worldId: string; hostId: string; members: Record<string, { token: string; label: string }> };
const CLIENT_KEY = 'killsync.friends.credentials.v1';
// getRandomValues is also available on an HTTP LAN origin; randomUUID is not.
export const friendsRandomId = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), b=>b.toString(16).padStart(2,'0')).join('');
const id = friendsRandomId;
export function validFriendsCrew(value: unknown): value is FriendsCrewSave {
  const v = value as FriendsCrewSave;
  return !!v && typeof v.worldId === 'string' && /^world-[a-f0-9]{32}$/.test(v.worldId)
    && typeof v.hostId === 'string' && /^friend-[a-f0-9]{32}$/.test(v.hostId)
    && !!v.members && typeof v.members === 'object' && Object.keys(v.members).length <= 128
    && Object.entries(v.members).every(([key,m]) => /^friend-[a-f0-9]{32}$/.test(key) && !!m && typeof m.token === 'string' && /^[a-f0-9]{64}$/.test(m.token) && typeof m.label === 'string' && m.label.length <= 24);
}
export function newFriendsCrew(): FriendsCrewSave { return { worldId: `world-${id()}`, hostId: `friend-${id()}`, members: {} }; }
export function readFriendsCredential(worldId: string): FriendsCredential | undefined {
  try { const c = JSON.parse(localStorage.getItem(CLIENT_KEY) || '{}')[worldId]; return c?.worldId === worldId && typeof c.playerId === 'string' && typeof c.token === 'string' ? c : undefined; } catch { return; }
}
export function rememberFriendsCredential(c: FriendsCredential) {
  try { const all = JSON.parse(localStorage.getItem(CLIENT_KEY) || '{}'); all[c.worldId] = c; const entries=Object.entries(all).slice(-64); localStorage.setItem(CLIENT_KEY, JSON.stringify(Object.fromEntries(entries))); } catch { /* A private session can still play without persistent credentials. */ }
}
export class FriendsCrewRegistry {
  constructor(readonly saved: FriendsCrewSave = newFriendsCrew()) {}
  prepareRestore(imported: FriendsCrewSave, hostId: string): FriendsCrewSave {
    if (!validFriendsCrew(imported)) throw new Error('Invalid island crew identities.');
    const sameWorld = imported.worldId === this.saved.worldId;
    const members = { ...imported.members, ...(sameWorld ? this.saved.members : {}) };
    delete members[hostId];
    if (Object.keys(members).length > 127) throw new Error('This restore exceeds the island crew identity limit. Your current world was kept.');
    return { worldId: imported.worldId, hostId, members };
  }
  restore(imported: FriendsCrewSave, hostId: string) {
    const sameWorld = imported.worldId === this.saved.worldId;
    Object.assign(this.saved, this.prepareRestore(imported, hostId));
    return !sameWorld;
  }
  admit(candidate: CoopPlayerSeed, credential: unknown, activeIds: Iterable<string>): { player: CoopPlayerSeed; credential: FriendsCredential } {
    const c = credential as Partial<FriendsCredential> | undefined;
    let playerId: string;
    if (c?.worldId === this.saved.worldId) {
      if (typeof c.playerId !== 'string' || !this.saved.members[c.playerId] || c.token !== this.saved.members[c.playerId].token) throw new Error('Your island identity could not be verified.');
      playerId = c.playerId;
    } else {
      if (Object.keys(this.saved.members).length >= 127) throw new Error('This island has reached its crew identity limit.');
      playerId = `friend-${id()}`;
      this.saved.members[playerId] = { token: id()+id(), label: candidate.label };
    }
    if (new Set(activeIds).has(playerId)) throw new Error('This friend is already connected. Leave the previous session before rejoining.');
    this.saved.members[playerId].label = candidate.label;
    return { player: { ...candidate, id: playerId }, credential: { worldId: this.saved.worldId, playerId, token: this.saved.members[playerId].token } };
  }
}
