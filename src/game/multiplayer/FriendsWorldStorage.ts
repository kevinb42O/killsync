import { newFriendsCrew, validFriendsCrew, type FriendsCrewSave } from './FriendsCrewIdentity';
import { isFrontierSave, type FrontierSnapshot } from './FriendsFrontier';
import { FriendsTerrain, validTerrainEdit } from '../world/FriendsTerrain';
import type { FriendsTransportSave } from './FriendsExpedition';
import { normalizeFriendsProgress, readFriendsProgress, type FriendsProgress } from './FriendsExpedition';
import { FriendsBuilding, type FriendsBuildingSnapshot } from './FriendsBuilding';
import type { FriendsProjectSnapshot } from './FriendsProjects';
export type FriendsWorldSave = { crew?: FriendsCrewSave; version: 2; savedAt: number; progress: FriendsProgress; building: FriendsBuildingSnapshot; projects?: FriendsProjectSnapshot; frontier?: FrontierSnapshot; transport?: FriendsTransportSave };
export const FRIENDS_WORLD_KEY = 'killsync.friends.world.v2';
/** The public train's journey is session-only. Older worlds can still contain
 * it, but disk saves and exports retain only whether the service is enabled. */
function persistentWorld<T extends {transport?:FriendsTransportSave}>(world:T):T{
  return world.transport?{...world,transport:{...world.transport,scenicRailway:world.transport.scenicRailway===undefined?undefined:world.transport.scenicRailway!==false}}:world;
}
// A bounded synchronous mirror lets simulation boot without losing edits to an
// async hydration race. IndexedDB stores the same durable current/previous pair.
let cached: FriendsWorldSave | undefined;
let mirrorStamp: string | null | undefined;
let crew: FriendsCrewSave | undefined;
export function friendsWorldCrew(): FriendsCrewSave { return crew ||= readFriendsWorld()?.crew || newFriendsCrew(); }
export function readFriendsWorld(): FriendsWorldSave | undefined {
  try {
    const current = localStorage.getItem(FRIENDS_WORLD_KEY);
    if (cached && current === mirrorStamp) return cached;
    mirrorStamp = current;
  } catch { return cached; }
  for (const key of [FRIENDS_WORLD_KEY, `${FRIENDS_WORLD_KEY}.previous`]) {
    try { const v = JSON.parse(localStorage.getItem(key) || 'null'); if (validWorld(v)) {cached=persistentWorld(v);return cached;} } catch { /* Try the previous intact save. */ }
  }
  cached = undefined;
  return undefined;
}
function validWorld(v: unknown): v is FriendsWorldSave {
  const w = v as FriendsWorldSave | null; return Boolean(w && w.version === 2 && (!w.crew || validFriendsCrew(w.crew)) && w.progress && w.building && Array.isArray(w.building.pieces) && w.building.pieces.length <= 1024 && (!w.frontier || isFrontierSave(w.frontier) && w.frontier.terrain.edits.every(validTerrainEdit)));
}
export function initialFriendsWorld() { const world = readFriendsWorld(); return { progress: world ? normalizeFriendsProgress(world.progress) : readFriendsProgress(), building: world?.building, projects: world?.projects, frontier: world?.frontier, transport: world?.transport }; }
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: unknown) => { if (settled) return; settled = true; clearTimeout(timer); reject(error); };
    const timer=setTimeout(()=>fail(new Error('Island database timed out.')),5000);
    const request = indexedDB.open('killsync-sunline', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('world');
    request.onsuccess = () => {if(settled){request.result.close();return;}settled=true;clearTimeout(timer);resolve(request.result);}; request.onerror = () => fail(request.error); request.onblocked=()=>fail(new Error('Close the other island tab to recover storage.'));
  });
}
let serial = Promise.resolve();
export async function recoverFriendsWorld(): Promise<FriendsWorldSave | undefined> {
  const mirror=readFriendsWorld();
  if(typeof indexedDB==='undefined')return mirror;
  let db:IDBDatabase|undefined;
  try {
    db=await database();
    const values=await new Promise<unknown[]>((resolve,reject)=>{const tx=db!.transaction('world','readonly'),store=tx.objectStore('world');const current=store.get('current'),previous=store.get('previous');tx.oncomplete=()=>resolve([current.result,previous.result]);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);});
    const intact=[mirror,...values.filter(validWorld)] as FriendsWorldSave[];
    const latest=intact.filter(Boolean).sort((a,b)=>b.savedAt-a.savedAt)[0];cached=latest?persistentWorld(latest):undefined;
    return cached;
  } catch(error) { if(mirror)return mirror; throw new Error('Island storage could not be recovered. Retry before starting a new world.'); }
  finally {db?.close();}
}
export type FriendsSaveStatus={mirror:boolean;database:boolean};
export function saveFriendsWorld(world: Omit<FriendsWorldSave, 'version' | 'savedAt'>): Promise<FriendsSaveStatus> {
  const value: FriendsWorldSave = persistentWorld({ ...world, crew:friendsWorldCrew(), version:2, savedAt:Date.now() });
  const text=JSON.stringify(value);let mirror=false;
  try {
    const old=localStorage.getItem(FRIENDS_WORLD_KEY);localStorage.setItem(FRIENDS_WORLD_KEY,text);mirror=true;
    if(old)try { const previous=JSON.parse(old);if(validWorld(previous))localStorage.setItem(`${FRIENDS_WORLD_KEY}.previous`,JSON.stringify(persistentWorld(previous))); } catch { /* Current is intact. */ }
  } catch { /* IndexedDB can still preserve the world. */ }
  cached=JSON.parse(text);
  const task=async():Promise<FriendsSaveStatus>=>{
    let db:IDBDatabase|undefined;
    try {
      if(typeof indexedDB==='undefined'){if(!mirror)throw new Error('No island storage is available.');return {mirror,database:false};}
      db=await database();
      await new Promise<void>((resolve,reject)=>{
        const tx=db!.transaction('world','readwrite'),store=tx.objectStore('world'),old=store.get('current');
        old.onsuccess=()=>{if(validWorld(old.result))store.put(persistentWorld(old.result),'previous');store.put(value,'current');};
        tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error);
      });return {mirror,database:true};
    } catch(error){if(mirror)return {mirror,database:false};throw error;}finally{db?.close();}
  };
  const run=serial.then(task,task);serial=run.then(()=>{},()=>{});return run;
}
export function exportFriendsWorld(world: Omit<FriendsWorldSave, 'version' | 'savedAt'>) {
  return JSON.stringify(persistentWorld({ version: 2, savedAt: Date.now(), ...world, crew:friendsWorldCrew() }), null, 2);
}
export function parseFriendsWorldImport(text: string): FriendsWorldSave {
  if (text.length > 4000000) throw new Error('That world file is too large.');
  const value = JSON.parse(text); if (!validWorld(value)) throw new Error('Choose a Sunline world export.');
  if (new FriendsBuilding(value.building, 0, value.frontier ? new FriendsTerrain(value.frontier.terrain) : undefined).getPieces().length !== value.building.pieces.length) throw new Error('This export contains invalid or overlapping pieces. Your current world was kept.');
  return persistentWorld(value);
}
