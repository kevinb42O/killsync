import type { FriendsBuildPiece, FriendsBuildPose, BuildBox } from './FriendsBuilding';
export type CraneAttachment = { rootId:number; parentId:number; x:number; y:number; z:number; rotation:number };
export type AssemblyFrame = { angle:number; pitch:0 };
export function yawPoint(origin:{x:number;y:number;z:number},angle:number,p:{x:number;y:number;z:number}) {
  const c=Math.cos(angle),s=Math.sin(angle);
  return {x:origin.x+p.x*c-p.y*s,y:origin.y+p.x*s+p.y*c,z:origin.z+p.z};
}
export function resolveAssemblyPose<T extends FriendsBuildPose>(p:T,pieces:readonly FriendsBuildPiece[],angles:ReadonlyMap<number,number>=new Map(),roots?:ReadonlyMap<number,FriendsBuildPiece>):T {
  const a=p.assembly,root=a&&(roots?.get(a.rootId)??pieces.find(q=>q.id===a.rootId&&q.shape==='crane_joint'&&!q.assembly&&!q.attachment));
  if(!a||!root)return p;
  const angle=root.rotation*Math.PI/2+(angles.get(root.id)??root.craneAngle??0);
  return {...p,...yawPoint(root,angle,a),rotation:a.rotation,assemblyFrame:{angle,pitch:0}};
}
/** Broad phase only. Keep exact orientation for contact and sweep queries. */
export function orientedBuildBox(p:FriendsBuildPiece,b:BuildBox) {
  const angle=p.rotation*Math.PI/2+(p.assemblyFrame?.angle??p.vehicleFrame?.angle??0);
  const point=yawPoint(p,angle,b);
  return {...point,w:b.w,d:b.d,h:b.h,angle,buildId:p.id};
}
export function durableBuildPieces(pieces:readonly FriendsBuildPiece[]) {
  return pieces.map(p=>p.assembly?{...p,x:p.assembly.x,y:p.assembly.y,z:p.assembly.z,assemblyFrame:undefined,vehicleFrame:undefined}:p);
}
