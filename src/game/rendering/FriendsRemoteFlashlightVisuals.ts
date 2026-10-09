import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { CoopPlayerSnapshot } from '../multiplayer/CoopSimulation';
import type { PlayerVisualRig } from './coopOperatorVisuals';
import { friendsCharacterHandPoint } from './FriendsCharacterVisuals';

const FORWARD=new THREE.Vector3(0,0,-1);
type Torch={group:THREE.Group;lens:THREE.Object3D;owner:THREE.Object3D};

/** Visible left-hand torch. Its lens socket is also the world beam and flare
 * origin: one transform follows the animated palm, body turn and camera aim.
 * Three shared draws per torch, with no textures or extra lights. */
export class FriendsRemoteFlashlightVisuals {
  private template=new THREE.Group();
  private actors=new Map<string,Torch>();
  private hand=new THREE.Vector3();
  private direction=new THREE.Vector3();
  private rotation=new THREE.Quaternion();
  private parentRotation=new THREE.Quaternion();
  private disposed=false;

  constructor(){
    this.template.name='friends-remote-flashlight';
    const metal=new THREE.MeshStandardMaterial({color:0x425e58,metalness:.55,roughness:.32});
    const rubber=new THREE.MeshStandardMaterial({color:0x20312c,roughness:.9});
    const glass=new THREE.MeshBasicMaterial({color:0xf2f7ff,toneMapped:false});
    const cylinder=(radius:number,length:number,z:number)=>{
      const geometry=new THREE.CylinderGeometry(radius,radius,length,16);
      geometry.rotateX(Math.PI/2);geometry.translate(0,0,z);return geometry;
    };
    const add=(parts:THREE.BufferGeometry[],material:THREE.Material,name:string)=>{
      const geometry=mergeGeometries(parts)!;parts.forEach(part=>part.dispose());
      const mesh=new THREE.Mesh(geometry,material);mesh.name=name;mesh.receiveShadow=true;this.template.add(mesh);
    };
    add([cylinder(1.05,8.8,0),cylinder(2.2,2,-4.6),cylinder(1.25,.5,4.4)],metal,'flashlight-metal');
    add(Array.from({length:5},(_,i)=>cylinder(1.17,.4,.5+i*.95)),rubber,'flashlight-grip');
    const lensGeometry=new THREE.CircleGeometry(1.83,24);lensGeometry.rotateY(Math.PI);lensGeometry.translate(0,0,-5.61);
    const lens=new THREE.Mesh(lensGeometry,glass);lens.name='flashlight-lit-lens';this.template.add(lens);
    const socket=new THREE.Object3D();socket.name='flashlight-emission';socket.position.z=-5.64;this.template.add(socket);
  }

  update(player:CoopPlayerSnapshot,rig:PlayerVisualRig){
    if(this.disposed)return;
    let entry=this.actors.get(player.id);
    if(entry&&entry.owner!==rig.root){entry.group.removeFromParent();this.actors.delete(player.id);entry=undefined;}
    const state=player.friendsFlashlight;
    if(!state||player.lifeState!=='alive'||!rig.root.visible||!friendsCharacterHandPoint(rig,this.hand,false,'left')){
      if(entry)entry.group.visible=false;return;
    }
    if(!entry){
      const group=this.template.clone(true);rig.root.add(group);
      entry={group,lens:group.getObjectByName('flashlight-emission')!,owner:rig.root};this.actors.set(player.id,entry);
    }
    const yaw=state.yaw??player.angle,pitch=THREE.MathUtils.clamp(state.pitch,-1.45,1.45),cp=Math.cos(pitch);
    this.direction.set(Math.cos(yaw)*cp,Math.sin(pitch),Math.sin(yaw)*cp);
    this.rotation.setFromUnitVectors(FORWARD,this.direction);
    rig.root.getWorldQuaternion(this.parentRotation).invert();
    entry.group.position.copy(this.hand);
    entry.group.quaternion.copy(this.parentRotation).multiply(this.rotation);
    entry.group.visible=true;entry.group.updateWorldMatrix(true,true);
  }

  emission(id:string,out:THREE.Vector3){
    const entry=this.actors.get(id);
    if(!entry||!entry.group.visible||!entry.owner.visible)return false;
    entry.lens.getWorldPosition(out);return true;
  }

  prune(ids:ReadonlySet<string>){
    for(const [id,entry]of this.actors)if(!ids.has(id)){entry.group.removeFromParent();this.actors.delete(id);}
  }

  dispose(){
    if(this.disposed)return;this.disposed=true;this.prune(new Set());
    this.template.traverse(node=>{if(node instanceof THREE.Mesh){node.geometry.dispose();(node.material as THREE.Material).dispose();}});
    this.template.clear();
  }
}
