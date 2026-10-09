import * as THREE from 'three';
import { lengthenFirstPersonArms } from './FriendsFirstPersonArms';
import { loadFriendsCharacterModel, cloneFriendsCharacterModel, type FriendsCharacterModel } from './FriendsCharacterModel';
import { applyFriendsArmPose } from './FriendsGesturePose';
import { acquireEquipmentLighting } from './FriendsHeldEquipment';
import { FRIENDS_ARM } from '../multiplayer/FriendsGestureControls';

export class FriendsGestureViewmodels {
  readonly root=new THREE.Group();
  private model?:FriendsCharacterModel;
  private blend=[0,0,0,0];
  private disposed=false;
  private camera?:THREE.PerspectiveCamera;
  private confettiPile?:THREE.InstancedMesh;
  private lighting:ReturnType<typeof acquireEquipmentLighting>;
  constructor(scene:THREE.Scene){
    this.root.name='friends-empty-hands';this.root.visible=false;
    const parent=scene.getObjectByProperty('type','PerspectiveCamera')||scene;parent.add(this.root);if(parent instanceof THREE.PerspectiveCamera)this.camera=parent;
    this.lighting=acquireEquipmentLighting(scene);
    void loadFriendsCharacterModel().then(source=>{
      if(this.disposed)return;
      const model=cloneFriendsCharacterModel(source);lengthenFirstPersonArms(model);this.model=model;this.root.add(model.root);
      model.basis.position.set(0,0,0);model.basis.scale.setScalar(.075);model.root.rotation.y=Math.PI;
      model.parts.forEach((p,i)=>{p.visible=i===2||i===3;});
      model.parts[2].position.set(5.2,0,0);model.parts[3].position.set(-5.2,0,0);
      model.basePositions=model.parts.map(p=>p.position.clone());
      this.createConfettiPile(model);
    }).catch(error=>console.warn('Empty hands could not load',error));
  }
  private createConfettiPile(model:FriendsCharacterModel){
    const hand=model.parts[3],palm=hand.userData.palm as number[]|undefined;
    if(!palm)return;
    const colors=['#ff4f87','#ffce52','#52e6ca','#70a9ff','#bd79ff','#ff8156','#fff0aa'];
    const pile=new THREE.InstancedMesh(new THREE.SphereGeometry(.2,8,6),new THREE.MeshBasicMaterial({color:'#fff',transparent:true,opacity:.98,depthWrite:false}),24);
    const matrix=new THREE.Matrix4(),position=new THREE.Vector3(),rotation=new THREE.Euler(),quaternion=new THREE.Quaternion(),scale=new THREE.Vector3();
    for(let i=0;i<24;i++){
      const seed=(i*9301+49297)%233280,random=seed/233280;
      pile.setColorAt(i,new THREE.Color(colors[i%colors.length]));
      position.set((random-.5)*1.7,(Math.cos(i*2.4)-.5)*1.3,-.12-((i*7)%5)*.10);
      rotation.set((random-.5)*.75,(i*1.73)%Math.PI,(random-.5)*1.05);quaternion.setFromEuler(rotation);
      scale.set(1.1+random*.3,.9+((i+1)%4)*.1,.34);
      matrix.compose(position,quaternion,scale);pile.setMatrixAt(i,matrix);
    }
    if(pile.instanceColor)pile.instanceColor.needsUpdate=true;
    // In the forward holding pose, local -Z is the palm's upward face.
    // Local Y runs along the arm and would put the pile behind the hand.
    pile.name='friends-held-confetti';pile.position.fromArray(palm);pile.position.z-=1.8;pile.visible=false;hand.add(pile);this.confettiPile=pile;
  }
  update(mask:number,pitch:number,dt:number,visible:boolean,confetti=false,throwAt?:number,now=0){
    this.root.visible=visible;this.lighting.setVisible(visible);
    if(!visible){this.blend.fill(0);return;}
    const tangent=Math.tan(THREE.MathUtils.degToRad((this.camera?.fov??98)/2)),scale=tangent/Math.tan(THREE.MathUtils.degToRad(49)),narrow=Math.min(1,(this.camera?.aspect??16/9)/1.25);
    // Keep the shoulder attachments behind the camera while framing the
    // longer local limbs slightly higher in the view.
    this.root.position.set(0,-.32*scale*narrow,.20);this.root.scale.set(scale*narrow,scale*narrow,1);
    const model=this.model;if(!model)return;
    const throwAge=throwAt===undefined?Infinity:now-throwAt;
    const throwing=confetti&&throwAge>=0&&throwAge<560;
    model.parts[2].visible=!confetti;model.parts[3].visible=true;
    if(this.confettiPile){this.confettiPile.visible=confetti&&(!throwing||throwAge<170);this.confettiPile.rotation.z=confetti?Math.sin(now*.008)*.045:0;}
    for(let i=2;i<=3;i++){model.parts[i].position.copy(model.basePositions[i]);model.parts[i].rotation.copy(model.baseRotations[i]);}
    // Camera owns local pitch already; pointing remains forward in its frame.
    applyFriendsArmPose(model,confetti?(throwing?FRIENDS_ARM.rightRaise:FRIENDS_ARM.rightPoint):mask,0,dt,this.blend,true);
    // Frame relaxed arms down/forward and lean raised arms into the view.
    // Sideways arms keep the shared lateral pose.
    // Re-solve translation around the same fixed shoulder after each rotation.
    for(let side=0;side<2;side++){
      const part=model.parts[side+2],raised=this.blend[side],point=this.blend[side+2],up=raised*(1-point),rest=1-Math.max(raised,point);
      const pivot=new THREE.Vector3().fromArray(part.userData.shoulderPivot);
      const attachment=pivot.clone().applyQuaternion(part.quaternion).add(part.position);
      part.rotation.x+=1.00*up-1.10*rest;
      // Bring the confetti palm inward without moving its shoulder attachment.
      if(confetti&&side===1)part.rotation.y-=.35*point;
      part.rotation.z=model.baseRotations[side+2].z+(part.rotation.z-model.baseRotations[side+2].z)*(1-.45*up);
      part.position.copy(attachment).sub(pivot.applyQuaternion(part.quaternion));
    }
  }
  dispose(){
    this.disposed=true;this.root.traverse(o=>{if(o instanceof THREE.SkinnedMesh){o.skeleton.dispose();if(o.geometry.userData.firstPersonArm)o.geometry.dispose();}});
    this.confettiPile?.dispose();this.confettiPile?.geometry.dispose();
    if(this.confettiPile){const material=this.confettiPile.material;if(Array.isArray(material))material.forEach(item=>item.dispose());else material.dispose();}
    this.lighting.dispose();this.root.removeFromParent();this.root.clear();
  }
}
