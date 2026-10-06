import type { FriendsBuildPiece, FriendsBuildPose } from '../multiplayer/FriendsBuilding';
export const PLAYER_TRAIN_COST = { wood: 8, planks: 12, ingots: 4 };
export const isPlayerRail = (shape: string) => shape === 'rail_straight' || shape === 'rail_curve';
export type RailPiece = FriendsBuildPose & { shape: string; id?: number };
export type RailPoint = { x: number; y: number; z: number; angle: number };
export function railLength(piece: RailPiece) { return piece.shape === 'rail_curve' ? Math.PI * 128 : 256; }
export function sampleRail(piece: RailPiece, t: number): RailPoint {
  t = Math.max(0, Math.min(1, t));
  const curve = piece.shape === 'rail_curve', theta = -Math.PI / 2 + t * Math.PI / 2;
  const x = curve ? -128 + Math.cos(theta) * 256 : -128 + t * 256;
  const y = curve ? 128 + Math.sin(theta) * 256 : 0;
  const a = piece.rotation * Math.PI / 2, c = Math.round(Math.cos(a)), s = Math.round(Math.sin(a));
  return { x: piece.x + x * c - y * s, y: piece.y + x * s + y * c, z: piece.z, angle: a + (curve ? t * Math.PI / 2 : 0) };
}
/** Distance to the continuous track centreline, including curved sections. */
export function railClearance(piece: RailPiece, x: number, y: number) {
  const a=piece.rotation*Math.PI/2,c=Math.round(Math.cos(a)),s=Math.round(Math.sin(a));
  const lx=(x-piece.x)*c+(y-piece.y)*s,ly=-(x-piece.x)*s+(y-piece.y)*c;
  if(piece.shape==='rail_straight')return Math.hypot(lx-Math.max(-128,Math.min(128,lx)),ly);
  const theta=Math.atan2(ly-128,lx+128);
  return theta>=-Math.PI/2 && theta<=0 ? Math.abs(Math.hypot(lx+128,ly-128)-256) : Math.min(Math.hypot(lx+128,ly+128),Math.hypot(lx-128,ly-128));
}
export function railSamples(piece: RailPiece, spacing = 32) {
  const n = Math.ceil(railLength(piece) / spacing);
  return Array.from({ length: n + 1 }, (_, i) => sampleRail(piece, i / n));
}
export function railEndpoints(piece: RailPiece) { const a = sampleRail(piece, 0), b = sampleRail(piece, 1); return [{ ...a, angle: a.angle + Math.PI }, b]; }
const distance = (a: RailPoint, b: RailPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export function railJoined(a: RailPoint, b: RailPoint) { return distance(a,b) < .1 && Math.cos(a.angle - b.angle) < -.999; }
/** Endpoint magnet preserves tangency, so the locomotive never jumps at a joint. */
export function snapRailPose(pieces: readonly FriendsBuildPiece[], shape: string, pose: FriendsBuildPose): FriendsBuildPose {
  let best = 220, result = { ...pose, x: Math.round(pose.x / 128) * 128, y: Math.round(pose.y / 128) * 128 };
  for (const p of pieces) if (isPlayerRail(p.shape)) for (const end of railEndpoints(p)) for (const own of railEndpoints({ ...pose, shape })) {
    if (Math.cos(end.angle - own.angle) > -.999 || Math.abs(end.z - own.z) > 32) continue;
    const d = distance(end, own);
    if (d < best) { best = d; result = { ...pose, x: Math.round((pose.x + end.x - own.x) / 4) * 4, y: Math.round((pose.y + end.y - own.y) / 4) * 4, z: end.z }; }
  }
  return result;
}
export function railOverlapError(pieces: readonly FriendsBuildPiece[], candidate: RailPiece, ignoringId?: number) {
  const ends = railEndpoints(candidate), points = railSamples(candidate, 24);
  for (const p of pieces) if (p.id !== ignoringId && isPlayerRail(p.shape)) {
    const otherEnds = railEndpoints(p), joins = ends.flatMap(a => otherEnds.filter(b => railJoined(a,b)).map(() => a));
    for (const a of points) for (const b of railSamples(p,24)) {
      if (distance(a,b) >= 72) continue;
      if (joins.some(j => distance(a,j) < 96 && distance(b,j) < 96)) continue;
      return 'Tracks cannot cross or branch. Connect matching ends, or build a separate line.';
    }
  }
}
export type PlayerRailRoute = { entries: { piece: FriendsBuildPiece; reversed: boolean; start: number; length: number }[]; length: number; closed: boolean };
const nodeKey = (p: RailPoint) => `${Math.round(p.x)},${Math.round(p.y)},${p.z}`;
export function playerRailRoute(pieces: readonly FriendsBuildPiece[], anchor: number): PlayerRailRoute | undefined {
  const rails = pieces.filter(p => isPlayerRail(p.shape)), first = rails.find(p => p.id === anchor);
  if (!first) return;
  const nodes = new Map<string, { piece: FriendsBuildPiece; end: number; point: RailPoint }[]>();
  for (const piece of rails) railEndpoints(piece).forEach((point,end) => { const key = nodeKey(point), list = nodes.get(key) || []; list.push({ piece,end,point }); nodes.set(key,list); });
  const component = new Set<number>(), queue = [first];
  for (let i=0;i<queue.length;i++) { const p = queue[i]; if (component.has(p.id)) continue; component.add(p.id); for (const end of railEndpoints(p)) for (const neighbor of nodes.get(nodeKey(end)) || []) if (!component.has(neighbor.piece.id)) queue.push(neighbor.piece); }
  const relevant = rails.filter(p => component.has(p.id)).sort((a,b) => a.id-b.id);
  let start: string | undefined;
  for (const p of relevant) for (const end of railEndpoints(p)) { const key=nodeKey(end), list=nodes.get(key)!; if (list.length > 2 || list.length === 2 && !railJoined(list[0].point,list[1].point)) return; if (list.length === 1 && start === undefined) start=key; }
  const closed = start === undefined; start ??= nodeKey(railEndpoints(relevant[0])[0]);
  const entries: PlayerRailRoute['entries'] = [], visited=new Set<number>(); let cursor=start, length=0;
  while (entries.length < relevant.length) {
    const next=nodes.get(cursor)?.find(e => !visited.has(e.piece.id)); if (!next) break;
    const l=railLength(next.piece); entries.push({piece:next.piece,reversed:next.end===1,start:length,length:l}); length+=l; visited.add(next.piece.id); cursor=nodeKey(railEndpoints(next.piece)[1-next.end]);
  }
  return entries.length === relevant.length ? { entries,length,closed } : undefined;
}
export function samplePlayerRail(route: PlayerRailRoute, distance: number): RailPoint {
  const d=route.closed ? (distance%route.length+route.length)%route.length : Math.max(0,Math.min(route.length,distance));
  let lo=0,hi=route.entries.length-1;
  while(lo<hi) { const mid=(lo+hi+1)>>1; if(route.entries[mid].start<=d)lo=mid;else hi=mid-1; }
  const e=route.entries[lo], t=(d-e.start)/e.length, p=sampleRail(e.piece,e.reversed?1-t:t); return {...p,angle:p.angle+(e.reversed?Math.PI:0)};
}
export function nearestRailDistance(route: PlayerRailRoute, point: {x:number;y:number;z:number}) {
  let best=Infinity,distance=0;
  for(const e of route.entries) {
    const n=Math.ceil(e.length/16);
    for(let i=0;i<n;i++) {
      const d0=e.start+i/n*e.length,d1=e.start+(i+1)/n*e.length;
      const a=samplePlayerRail(route,d0),b=samplePlayerRail(route,d1),dx=b.x-a.x,dy=b.y-a.y;
      const t=Math.max(0,Math.min(1,((point.x-a.x)*dx+(point.y-a.y)*dy)/(dx*dx+dy*dy||1)));
      const d=d0+(d1-d0)*t,p=samplePlayerRail(route,d),error=Math.hypot(p.x-point.x,p.y-point.y,p.z-point.z);
      if(error<best){best=error;distance=d;}
    }
  }
  return { distance,error:best };
}
