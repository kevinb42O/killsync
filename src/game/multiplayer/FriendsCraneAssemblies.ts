import { friendsShapeBoxes, type FriendsBuildShape, type FriendsBuildPiece, type FriendsBuildPose } from './FriendsBuilding';
import { orientedBuildBox, resolveAssemblyPose, yawPoint, type CraneAttachment } from './FriendsAssemblyPose';
export const CRANE_MAX_PARTS=32, CRANE_MAX_RADIUS=384;
export const isCranePart=(shape:FriendsBuildShape)=>shape==='crane_boom'||shape==='crane_winch';
export function validCraneAttachment(a:unknown):a is CraneAttachment {
  const v=a as CraneAttachment;
  return Boolean(v&&Number.isSafeInteger(v.rootId)&&v.rootId>0&&Number.isSafeInteger(v.parentId)&&v.parentId>0&&[v.x,v.y,v.z,v.rotation].every(Number.isFinite)&&[v.x,v.y,v.z].every(n=>n%4===0)&&Math.hypot(v.x,v.y)<=CRANE_MAX_RADIUS+16&&Math.abs(v.z)<=512&&Number.isInteger(v.rotation)&&v.rotation>=0&&v.rotation<4);
}
export function craneSocketPose(pieces:readonly FriendsBuildPiece[],parent:FriendsBuildPiece,shape:FriendsBuildShape,rotation:number):FriendsBuildPose|undefined {
  if(!isCranePart(shape)||!['crane_joint','crane_boom'].includes(parent.shape))return;
  const root=parent.shape==='crane_joint'?parent:pieces.find(p=>p.id===parent.assembly?.rootId&&p.shape==='crane_joint');
  if(!root||root.attachment||root.assembly)return;
  const a=parent.assembly,base=parent.shape==='crane_joint'?{x:0,y:0,z:128}:{x:a!.x,y:a!.y,z:a!.z};
  const endpoint=parent.shape==='crane_joint'?base:yawPoint(base,(a?.rotation??0)*Math.PI/2,{x:48,y:0,z:0});
  const local=shape==='crane_boom'?yawPoint(endpoint,rotation*Math.PI/2,{x:48,y:0,z:0}):endpoint;
  const assembly={rootId:root.id,parentId:parent.id,...local,rotation};
  return resolveAssemblyPose({...local,rotation,assembly,assemblyFrame:undefined},pieces,new Map([[root.id,parent.assemblyFrame?parent.assemblyFrame.angle-root.rotation*Math.PI/2:root.craneAngle??0]]));
}
export function craneAssemblyError(pieces:readonly FriendsBuildPiece[],shape:FriendsBuildShape,pose:FriendsBuildPose,ignoringId?:number) {
  const a=pose.assembly;if(!a)return shape==='crane_boom'?'Snap a boom section onto a slewing joint or the end of another boom.':undefined;
  if(!isCranePart(shape)||pose.attachment||!validCraneAttachment(a))return 'Choose a valid crane socket.';
  const root=pieces.find(p=>p.id===a.rootId&&p.shape==='crane_joint'&&!p.attachment&&!p.assembly),parent=pieces.find(p=>p.id===a.parentId&&p.id!==ignoringId);
  if(!root||!parent||parent.id!==root.id&&parent.assembly?.rootId!==root.id)return 'The crane parent or pivot no longer exists.';
  const expected=craneSocketPose(pieces,parent,shape,a.rotation)?.assembly;
  if(!expected||['x','y','z'].some(k=>Math.abs(a[k as 'x']-expected[k as 'x'])>.01))return 'Snap this piece to the free end socket.';
  const members=pieces.filter(p=>p.id!==ignoringId&&p.assembly?.rootId===root.id);
  if(members.length>=CRANE_MAX_PARTS)return 'This crane has reached its arm piece budget.';
  if(Math.hypot(a.x,a.y)+(shape==='crane_boom'?48:0)>CRANE_MAX_RADIUS+.01)return 'Keep the arm within 32m of its pivot.';
  if(members.some(p=>p.assembly?.parentId===a.parentId))return 'That end socket is occupied. Extend the arm from its free end.';
  if(shape==='crane_winch'&&members.some(p=>p.shape==='crane_winch'))return 'One winch per rotating crane. Build another pivot for a second load.';
  return;
}
export function craneTopologyError(pieces:readonly FriendsBuildPiece[]) {
  for(const p of pieces) {
    if(p.assembly){const error=craneAssemblyError(pieces.filter(q=>q.id!==p.id),p.shape,p,p.id);if(error)return error;
      const visited=new Set([p.id]);let parent=pieces.find(q=>q.id===p.assembly!.parentId);
      while(parent?.assembly){if(visited.has(parent.id))return 'Crane connections cannot form a loop.';visited.add(parent.id);parent=pieces.find(q=>q.id===parent!.assembly!.parentId);}
    }
    if(p.craneRootId!==undefined&&(!Number.isSafeInteger(p.craneRootId)||p.shape!=='crane_console'||!pieces.some(q=>q.id===p.craneRootId&&['crane_joint','crane_winch','crane'].includes(q.shape)&&!q.assembly)))return 'A crane console needs an existing fixed crane or pivot.';
  }
}
export function assemblyMemberBoxes(pieces:readonly FriendsBuildPiece[],rootId:number,angle:number) {
  const root=pieces.find(p=>p.id===rootId)!;
  const angles=new Map([[rootId,angle]]),roots=new Map([[rootId,root]]);
  return pieces.filter(p=>p.assembly?.rootId===rootId).flatMap(p=>{
    const pose=resolveAssemblyPose(p,pieces,angles,roots);
    return friendsShapeBoxes(p.shape).map(b=>orientedBuildBox(pose,b));
  });
}
