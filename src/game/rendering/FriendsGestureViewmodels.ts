import * as THREE from 'three';
import { loadFriendsCharacterModel, cloneFriendsCharacterModel, type FriendsCharacterModel } from './FriendsCharacterModel';
import { applyFriendsArmPose } from './FriendsGesturePose';
import { acquireEquipmentLighting } from './FriendsHeldEquipment';

const connectorGeometry=new THREE.BoxGeometry(.065,1,.065);
const connectorMaterial=new THREE.MeshStandardMaterial({color:'#dfc650',roughness:.94});
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
      // Continue each shoulder toward the player's body below the camera.
      // This stays fixed while the authored shoulder/elbow/wrist move, so the
      // arm never appears as a detached hand floating in the middle of the view.
      for(const side of [-1,1]){
        const start=new THREE.Vector3(side*.39,0,0),end=new THREE.Vector3(side*.90,-1.3,1.0);
        const delta=end.clone().sub(start),connector=new THREE.Mesh(connectorGeometry,connectorMaterial);
        connector.name=side<0?'left-upper-arm-connection':'right-upper-arm-connection';connector.position.copy(start).add(end).multiplyScalar(.5);
        connector.scale.y=delta.length();connector.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());this.root.add(connector);
      }
    }).catch(error=>console.warn('Empty hands could not load',error));
  }
  update(mask:number,pitch:number,dt:number,visible:boolean){
    this.root.visible=visible;this.lighting.setVisible(visible);
    if(!visible){this.blend.fill(0);return;}
    const tangent=Math.tan(THREE.MathUtils.degToRad((this.camera?.fov??98)/2)),scale=tangent/Math.tan(THREE.MathUtils.degToRad(49)),narrow=Math.min(1,(this.camera?.aspect??16/9)/1.25);
    this.root.position.set(0,-.62*scale,-1.05);this.root.scale.set(scale*narrow,scale*narrow,1);
    const model=this.model;if(!model)return;
    for(let i=2;i<=3;i++){model.parts[i].position.copy(model.basePositions[i]);model.parts[i].rotation.copy(model.baseRotations[i]);}
    // Camera owns local pitch already; pointing remains forward in its frame.
    applyFriendsArmPose(model,mask,0,dt,this.blend,true);
  }
  dispose(){this.disposed=true;this.root.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.skeleton.dispose();});this.lighting.dispose();this.root.removeFromParent();this.root.clear();}
}
