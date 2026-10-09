import * as THREE from 'three';
import { loadFriendsCharacterModel, cloneFriendsCharacterModel, type FriendsCharacterModel } from './FriendsCharacterModel';
import { applyFriendsArmPose } from './FriendsGesturePose';
import { acquireEquipmentLighting } from './FriendsHeldEquipment';

export class FriendsGestureViewmodels {
  readonly root=new THREE.Group();
  private model?:FriendsCharacterModel;
  private blend=[0,0,0,0];
  private disposed=false;
  private camera?:THREE.PerspectiveCamera;
  private lighting:ReturnType<typeof acquireEquipmentLighting>;
  constructor(scene:THREE.Scene){
    this.root.name='friends-empty-hands';this.root.visible=false;
    const parent=scene.getObjectByProperty('type','PerspectiveCamera')||scene;parent.add(this.root);if(parent instanceof THREE.PerspectiveCamera)this.camera=parent;
    this.lighting=acquireEquipmentLighting(scene);
    void loadFriendsCharacterModel().then(source=>{
      if(this.disposed)return;
      const model=cloneFriendsCharacterModel(source);this.model=model;this.root.add(model.root);
      model.basis.position.set(0,0,0);model.basis.scale.setScalar(.075);model.root.rotation.y=Math.PI;
      model.parts.forEach((p,i)=>{p.visible=i===2||i===3;});
      model.parts[2].position.set(5.2,0,0);model.parts[3].position.set(-5.2,0,0);
      model.basePositions=model.parts.map(p=>p.position.clone());
    }).catch(error=>console.warn('Empty hands could not load',error));
  }
  update(mask:number,pitch:number,dt:number,visible:boolean){
    this.root.visible=visible;this.lighting.setVisible(visible);
    if(!visible){this.blend.fill(0);return;}
    const tangent=Math.tan(THREE.MathUtils.degToRad((this.camera?.fov??98)/2)),scale=tangent/Math.tan(THREE.MathUtils.degToRad(49)),narrow=Math.min(1,(this.camera?.aspect??16/9)/1.25);
    // Keep the real shoulders at the body, behind the camera. At rest the
    // authored arms hang down; forward gestures can enter the local view.
    this.root.position.set(0,-.40*scale*narrow,.20);this.root.scale.set(scale*narrow,scale*narrow,1);
    const model=this.model;if(!model)return;
    for(let i=2;i<=3;i++){model.parts[i].position.copy(model.basePositions[i]);model.parts[i].rotation.copy(model.baseRotations[i]);}
    // Camera owns local pitch already; pointing remains forward in its frame.
    applyFriendsArmPose(model,mask,0,dt,this.blend,true);
    // Lean raised hands slightly into the local view. This camera-only pose
    // leaves the authored remote raise and the fixed shoulder attachments intact.
    for(let side=0;side<2;side++){
      const part=model.parts[side+2],up=this.blend[side]*(1-this.blend[side+2]);
      const pivot=new THREE.Vector3().fromArray(part.userData.shoulderPivot);
      const attachment=pivot.clone().applyQuaternion(part.quaternion).add(part.position);
      part.rotation.x+=1.15*up;
      part.position.copy(attachment).sub(pivot.applyQuaternion(part.quaternion));
    }
  }
  dispose(){this.disposed=true;this.root.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.skeleton.dispose();});this.lighting.dispose();this.root.removeFromParent();this.root.clear();}
}
