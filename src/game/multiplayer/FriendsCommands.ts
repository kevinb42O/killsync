import { validCraneDimensions } from './FriendsTelescopicCrane';
import { validCraneAttachment } from './FriendsCraneAssemblies';
import type { MultiplayerReliableEvent } from './protocol';
import { MULTIPLAYER_PROTOCOL_VERSION } from './protocol';
const ACTIONS = new Set(['campfire_fuel','campfire_fresh','campfire_eat','airwinch_hook_connect','airwinch_hook_release','crane_stabilize','crane_precision','crane_mast_up','crane_mast_down','crane_stop_mast','crane_extend','crane_retract','crane_stop_boom','crane_hook_connect','crane_hook_release','crane_left','crane_right','crane_stop_arm','crane_stop_all','crane_takeover','crane_heartbeat','crane_connect','crane_raise','crane_lower','crane_hold','crane_release','train_horn','scenic_speed','scenic_hold','scenic_depart','train_place','train_remove','train_hold','train_depart','planks','smelt_copper','smelt_iron','upgrade','deposit','withdraw','load','unload','contract','plant','home']);
const BUILDS = new Set(['place','place_group','remove','paint','move','undo','redo','permissions']);
const REQUEST_KEY = 'killsync.friends.request-id.v1';
let lastRequestId = 0;
export function nextFriendsRequestId() {
  let saved = 0;
  try { const n = Number(localStorage.getItem(REQUEST_KEY)); if (Number.isSafeInteger(n) && n > 0 && n < Number.MAX_SAFE_INTEGER - 1) saved = n; } catch { /* Private sessions retain their in-memory counter. */ }
  lastRequestId = Math.max(lastRequestId, saved, Date.now() * 100) + 1;
  try { localStorage.setItem(REQUEST_KEY, String(lastRequestId)); } catch { /* Persistent identity is also unavailable in this case. */ }
  return lastRequestId;
}
export function validFriendsCommand(value: unknown, build: boolean): boolean {
  const r = value as Record<string, unknown>;
  if (!r || typeof r !== 'object' || !Number.isSafeInteger(r.requestId) || Number(r.requestId) < 1 || !(build ? BUILDS : ACTIONS).has(String(r.action))) return false;
  if (build && r.action === 'place_group') {
    if (!Array.isArray(r.poses) || !r.poses.length || r.poses.length > 64 || !r.poses.every(p => validFriendsCommand({requestId:1,action:'place',pose:p},true))) return false;
  }
  if (build && r.pose !== undefined) { const p=r.pose as Record<string,unknown>; if (!p || !['x','y','z','rotation'].every(k=>typeof p[k]==='number' && Number.isFinite(p[k])) || !Number.isInteger(p.rotation) || Number(p.rotation)<0 || Number(p.rotation)>3) return false; }
  if(build&&(r.pose as any)?.cranePartBox!==undefined)return false;
  if(build&&r.pose&&!validCraneDimensions(r.pose as any))return false;
  if(build&&(r.pose as any)?.craneAngle!==undefined&&(!Number.isFinite((r.pose as any).craneAngle)||Math.abs((r.pose as any).craneAngle)>Math.PI*2))return false;
  if(build&&(r.pose as any)?.assembly!==undefined&&!validCraneAttachment((r.pose as any).assembly))return false;
  if(build&&(r.pose as any)?.craneRootId!==undefined&&(!Number.isSafeInteger((r.pose as any).craneRootId)||(r.pose as any).craneRootId<1))return false;
  if(build&&(r.pose as any)?.attachment!==undefined){const a=(r.pose as any).attachment;if(!a||typeof a!=='object'||typeof a.vehicleId!=='string'||a.vehicleId.length>32||!['x','y','z'].every(k=>typeof a[k]==='number'&&Number.isFinite(a[k])))return false;}
  if(!build&&r.action==='scenic_speed'&&(!(typeof r.speedKmh==='number')||!Number.isFinite(r.speedKmh)||r.speedKmh<6||r.speedKmh>360||typeof r.stopAtStations!=='boolean'))return false;
  if(!build && String(r.action).startsWith('crane_') && (!Number.isSafeInteger(r.pieceId) || Number(r.pieceId)<1)) return false;
  return true;
}
/** Result replay prevents a lost acknowledgement from turning a successful
 * operation into another spend or an ambiguous duplicate rejection. */
export class FriendsCommandResults {
  private results = new Map<string, unknown>();
  private latest = new Map<string, number>();
  run<T>(playerId: string, kind: string, requestId: number, execute: () => T): T | undefined {
    const scope=`${playerId}:${kind}`, key=`${scope}:${requestId}`;
    if (this.results.has(key)) return this.results.get(key) as T;
    if (requestId <= (this.latest.get(scope) || 0)) return;
    const result=execute(); this.latest.set(scope, requestId); this.results.set(key, structuredClone(result));
    while(this.results.size>512) this.results.delete(this.results.keys().next().value!);
    return result;
  }
  clear() { this.results.clear(); this.latest.clear(); }
}
export class FriendsCommandOutbox {
  private pending = new Map<string, { event: MultiplayerReliableEvent; at: number; last: number }>();
  private unresolved = false;
  constructor(private send: (event: MultiplayerReliableEvent)=>boolean, private notice: (message:string)=>void) {}
  submit(kind: 'friends_build'|'friends_action', payload: Record<string,unknown>, epoch: string, now: number) {
    if(this.unresolved) { this.notice('Rejoin to confirm the unresolved island operation before making another edit.'); return false; }
    if(!epoch) { this.notice('Waiting for the island to synchronize.'); return false; }
    if(this.pending.size>=32) { this.notice('Waiting for earlier island operations.'); return false; }
    const key=`${kind}:${payload.requestId}`;
    const event: MultiplayerReliableEvent={type:'event',version:MULTIPLAYER_PROTOCOL_VERSION,event:kind,payload:{...payload,friendsEpoch:epoch}};
    this.pending.set(key,{event,at:now,last:now}); this.send(event); return true;
  }
  acknowledge(kind:string, requestId:number) { this.pending.delete(`${kind}:${requestId}`); }
  tick(now:number) { for(const p of this.pending.values()) { if(now-p.at>30000) { this.unresolved=true;this.pending.clear(); this.notice('Island operation is unresolved. Rejoin to synchronize before repeating it.'); return; } else if(now-p.last>=1000) { p.last=now;this.send(p.event); } } }
  clear() { if(this.pending.size) this.notice('World changed. Pending island operations were cancelled.'); this.pending.clear();this.unresolved=false; }
  get requiresRejoin(){return this.unresolved;}
  get size(){return this.pending.size;}
}
