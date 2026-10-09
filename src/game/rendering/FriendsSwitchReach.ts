import * as THREE from 'three';
import { loadFriendsGrip } from './FriendsHeldEquipment';
import { RETREAT_SWITCH, STILLWATER } from '../world/FriendsRetreatSites';
import type { CoopOperatorRig } from './coopOperatorVisuals';

type Actor={id:string;x:number;y:number;z:number;angle:number};
const smooth=(t:number)=>{t=Math.max(0,Math.min(1,t));return t*t*(3-2*t);};
export function switchReachBlend(seconds:number){return seconds<.22?smooth(seconds/.22):seconds<.32?1:1-smooth((seconds-.32)/.40);}
export const switchPalmTarget=new THREE.Vector3(RETREAT_SWITCH.x,RETREAT_SWITCH.z,RETREAT_SWITCH.y);
/** An actual world-space hand contacts the rocker, with the existing crew limb.
 * It retains depth testing against the room rather than drawing over the wall. */
export class FriendsSwitchReach {
  readonly group=new THREE.Group();
  private hand?:THREE.Mesh;
  private original?:Float32Array;
  private axis=new THREE.Vector3(.28,-.55,1.35).normalize();
  private shoulderLength=Math.hypot(.28,-.55,1.35);
  private actorId?:string;
  private seconds=1;
  private start=new THREE.Vector3();
  private started=false;
  private clicked=false;
  private disposed=false;
  constructor(scene:THREE.Scene){
    this.group.name='stillwater-switch-reaching-hand';this.group.visible=false;scene.add(this.group);
    void loadFriendsGrip('right','inward').then(source=>{
      if(this.disposed)return;
      const mesh=source.clone();mesh.geometry=source.geometry.clone();mesh.geometry.userData.friendsShared=false;
      this.original=new Float32Array(mesh.geometry.attributes.position.array as Float32Array);mesh.scale.setScalar(12);mesh.frustumCulled=false;this.hand=mesh;this.group.add(mesh);
    }).catch(error=>console.error('Switch hand could not load',error));
  }
  trigger(actorId:string|undefined){if(!actorId)return;this.actorId=actorId;this.seconds=0;this.started=false;this.clicked=false;}
  get active(){return this.seconds<.72;}
  forPlayer(id:string){return this.active&&this.actorId===id;}
  update(dt:number,camera:THREE.Camera,localId:string,players:readonly Actor[],firstPerson=true){
    const actor=players.find(p=>p.id===this.actorId),previous=this.seconds;this.seconds+=Math.max(0,Math.min(dt,100))/1000;
    this.group.visible=this.active&&Boolean(actor)&&this.actorId===localId&&firstPerson&&Boolean(this.hand);
    let click=false;if(!this.clicked&&previous<.22&&this.seconds>=.22){this.clicked=true;click=Boolean(actor&&camera.position.distanceTo(switchPalmTarget)<180);}
    if(!this.group.visible||!this.hand||!this.original||!actor)return click;
    if(!this.started){this.start.set(8,-10,-10).applyMatrix4(camera.matrixWorld);this.started=true;}
    const blend=switchReachBlend(this.seconds),palm=this.start.clone().lerp(switchPalmTarget,blend);
    const shoulder=new THREE.Vector3(actor.x-Math.sin(actor.angle)*8,actor.z+20,actor.y+Math.cos(actor.angle)*8);
    const direction=shoulder.sub(palm),length=direction.length();this.hand.position.copy(palm);this.hand.quaternion.setFromUnitVectors(this.axis,direction.normalize());
    const scale=length/12/this.shoulderLength,position=this.hand.geometry.attributes.position,p=new THREE.Vector3();
    for(let i=0;i<position.count;i++){
      p.fromArray(this.original,i*3);const d=p.dot(this.axis);if(d>.13)p.addScaledVector(this.axis,(d-.13)*(scale-1));position.setXYZ(i,p.x,p.y,p.z);
    }position.needsUpdate=true;
    return click;
  }
  poseRemote(rig:CoopOperatorRig,actor:Actor){
    if(!this.active||actor.id!==this.actorId)return;
    const arm=rig.root.getObjectByName('big-walk-right-arm');if(!arm?.parent||!arm.userData.palm)return;
    rig.root.updateWorldMatrix(true,true);const target=arm.parent.worldToLocal(switchPalmTarget.clone()).sub(arm.position),original=new THREE.Vector3().fromArray(arm.userData.palm);
    const current=original.clone().applyQuaternion(arm.quaternion),turn=new THREE.Quaternion().setFromUnitVectors(current.normalize(),target.clone().normalize());
    const blend=switchReachBlend(this.seconds),rotation=arm.quaternion.clone().premultiply(turn);
    arm.quaternion.slerp(rotation,blend);arm.scale.setScalar(THREE.MathUtils.lerp(1,target.length()/original.length(),blend));
  }
  dispose(){this.disposed=true;this.hand?.geometry.dispose();this.group.removeFromParent();this.group.clear();}
}
