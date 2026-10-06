import { isFrontierSave, type FrontierSnapshot } from './FriendsFrontier';
import { FriendsTerrain, validTerrainEdit } from '../world/FriendsTerrain';
import type { FriendsTransportSave } from './FriendsExpedition';
import { normalizeFriendsProgress, readFriendsProgress, type FriendsProgress } from './FriendsExpedition';
import { FriendsBuilding, type FriendsBuildingSnapshot } from './FriendsBuilding';
import type { FriendsProjectSnapshot } from './FriendsProjects';
export type FriendsWorldSave = { version: 2; savedAt: number; progress: FriendsProgress; building: FriendsBuildingSnapshot; projects?: FriendsProjectSnapshot; frontier?: FrontierSnapshot; transport?: FriendsTransportSave };
export const FRIENDS_WORLD_KEY = 'killsync.friends.world.v2';
// A bounded synchronous mirror lets simulation boot without losing edits to an
// async hydration race. IndexedDB stores the same durable current/previous pair.
export function readFriendsWorld(): FriendsWorldSave | undefined {
  for (const key of [FRIENDS_WORLD_KEY, `${FRIENDS_WORLD_KEY}.previous`]) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); if (validWorld(v)) return v; } catch { /* Try the previous intact save. */ }
  }
  return undefined;
}
function validWorld(v: unknown): v is FriendsWorldSave {
  const w = v as FriendsWorldSave | null; return Boolean(w && w.version === 2 && w.progress && w.building && Array.isArray(w.building.pieces) && w.building.pieces.length <= 1024 && (!w.frontier || isFrontierSave(w.frontier) && w.frontier.terrain.edits.every(validTerrainEdit)));
}
export function initialFriendsWorld() { const world = readFriendsWorld(); return { progress: world ? normalizeFriendsProgress(world.progress) : readFriendsProgress(), building: world?.building, projects: world?.projects, frontier: world?.frontier, transport: world?.transport }; }
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('killsync-sunline', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('world');
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
}
let serial = Promise.resolve();
export function saveFriendsWorld(world: Omit<FriendsWorldSave, 'version' | 'savedAt'>): Promise<void> {
  const value: FriendsWorldSave = { version: 2, savedAt: Date.now(), ...world };
  let old: string | null;
  // The mirror is synchronous even on pagehide or while an earlier database
  // transaction is pending. Closing the tab cannot strand the latest edit.
  try {
    old = localStorage.getItem(FRIENDS_WORLD_KEY);
    localStorage.setItem(FRIENDS_WORLD_KEY, JSON.stringify(value));
    if (old) try { localStorage.setItem(`${FRIENDS_WORLD_KEY}.previous`, old); } catch { /* Current is intact. */ }
  } catch (error) { return Promise.reject(error); }
  const task = async () => {
    if (typeof indexedDB === 'undefined') return;
    const db = await database();
    try { await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('world', 'readwrite'), store = tx.objectStore('world');
      if (old) store.put(JSON.parse(old), 'previous'); store.put(value, 'current');
      tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error);
    }); } finally { db.close(); }
  };
  const run = serial.then(task, task); serial = run.catch(() => {}); return run;
}
export function exportFriendsWorld(world: Omit<FriendsWorldSave, 'version' | 'savedAt'>) {
  return JSON.stringify({ version: 2, savedAt: Date.now(), ...world }, null, 2);
}
export function parseFriendsWorldImport(text: string): FriendsWorldSave {
  if (text.length > 4000000) throw new Error('That world file is too large.');
  const value = JSON.parse(text); if (!validWorld(value)) throw new Error('Choose a Sunline world export.');
  if (new FriendsBuilding(value.building, 0, value.frontier ? new FriendsTerrain(value.frontier.terrain) : undefined).getPieces().length !== value.building.pieces.length) throw new Error('This export contains invalid or overlapping pieces. Your current world was kept.');
  return value;
}
