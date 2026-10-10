import type { BuildBox, FriendsBuildPiece } from './FriendsBuilding';
import type { FriendsCraneState } from './FriendsCrane';

export const CRANE_MAX_MAST_EXTENSION = 256 * 12 - 160;
export const CRANE_MAX_BOOM_EXTENSION = 256 * 12 - 184;
export const CRANE_EXTENSION_SPEED = 240;
export type CraneDimensions = { mastExtension?: number; boomExtension?: number };
export type CraneSection = BuildBox & { angle: number; color: string; moving: boolean; telescopic: boolean };
export function validCraneDimensions(value: CraneDimensions) {
  return (value.mastExtension === undefined || Number.isFinite(value.mastExtension) && value.mastExtension >= 0 && value.mastExtension <= CRANE_MAX_MAST_EXTENSION)
    && (value.boomExtension === undefined || Number.isFinite(value.boomExtension) && value.boomExtension >= 0 && value.boomExtension <= CRANE_MAX_BOOM_EXTENSION);
}
/** Old saves may contain the former 384m arm. Preserve mast and angle while
 * bringing their saved boom into the new range; live commands remain strict. */
export function restoreCraneDimensions(value:CraneDimensions):CraneDimensions {
  const boom=value.boomExtension;
  return {...value,boomExtension:boom!==undefined&&Number.isFinite(boom)&&boom>=0&&boom<=384*12-184?Math.min(boom,CRANE_MAX_BOOM_EXTENSION):boom};
}
/** All coordinates are local to the original placement. Slewing is about the
 * mast at (-64, 0), never about the build piece's bounding-box centre. */
export function telescopicCraneSections(p: CraneDimensions & { craneAngle?: number; angle?: number }): CraneSection[] {
  const mast = p.mastExtension ?? 0, boom = p.boomExtension ?? 0, angle = p.angle ?? p.craneAngle ?? 0;
  const sections: CraneSection[] = [];
  const add = (x:number,y:number,z:number,w:number,d:number,h:number,color:string,moving=false,telescopic=false) => {
    const a=moving?angle:0,c=Math.cos(a),s=Math.sin(a);
    sections.push({x: moving?-64+(x+64)*c-y*s:x,y:moving?(x+64)*s+y*c:y,z,w,d,h,angle:a,color,moving,telescopic});
  };
  add(-64,0,0,80,80,8,'#497c77');
  add(-64,-24,24,48,16,36,'#263f41');
  // Eight nested stages keep geometry and collision cost bounded at giant sizes.
  for(let i=0;i<8;i++) {
    const segment=(136+mast)/8, width=22-i*1.1+Math.min(44,mast/64);
    add(-64,0,8+i*segment,width,width,segment+2,i%2?'#63938b':'#497c77',false,true);
    add(-64,0,8+(i+1)*segment-4,width+4,width+4,4,'#e4b879',false,true);
  }
  add(-64,0,128+mast,36,36,12,'#263f41',true);
  add(-64,0,137+mast,40,40,5,'#e4b879',true);
  // Keep the old outlet and original silhouette at zero extension.
  for(let i=0;i<8;i++) {
    const segment=(224+boom)/8,start=-80+i*segment,width=22-i*.65+Math.min(64,boom/64),height=20-i*.6+Math.min(48,boom/96);
    add(start+segment/2,0,140+mast,segment+2,width,height,i%2?'#63938b':'#497c77',true);
    add(start+segment-3,0,139+mast,5,width+5,height+2,'#e4b879',true);
  }
  const winchScale=1+2*boom/CRANE_MAX_BOOM_EXTENSION;
  add(120+boom,0,138+mast,32*winchScale,40*winchScale,20*winchScale,'#263f41',true);
  return sections;
}
export function telescopicCraneOutlet(p: CraneDimensions & { rotation:number; x:number; y:number; z:number; angle?:number; craneAngle?:number }) {
  const fixed=p.rotation*Math.PI/2,turn=fixed+(p.angle??p.craneAngle??0),reach=184+(p.boomExtension??0);
  return {x:p.x-64*Math.cos(fixed)+reach*Math.cos(turn),y:p.y-64*Math.sin(fixed)+reach*Math.sin(turn),z:p.z+134+(p.mastExtension??0)};
}
/** Live root dimensions travel with motion packets, separate from build revisions. */
export function applyCraneMotion(pieces:readonly FriendsBuildPiece[],cranes:readonly FriendsCraneState[]=[]) {
  const states=new Map(cranes.filter(c=>c.mastExtension!==undefined).map(c=>[c.pieceId,c]));
  return pieces.map(p=>{const c=states.get(p.id);return c&&p.shape==='crane'?{...p,craneAngle:c.angle,mastExtension:c.mastExtension,boomExtension:c.boomExtension}:p;});
}
