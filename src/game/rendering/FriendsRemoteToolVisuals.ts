import * as THREE from 'three';
import { fitFriendsAsset, loadFriendsAsset, type FriendsAssetId } from './FriendsAssets';
import type { CoopOperatorRig } from './coopOperatorVisuals';
import type { ToolAction } from '../multiplayer/FriendsToolActions';
import { friendsCharacterHandPoint } from './FriendsCharacterVisuals';

// One immutable model per tool, shared by all teammates. No per-contact loads.
const models = new Map<FriendsAssetId, Promise<THREE.Group>>();
export class FriendsRemoteToolVisuals {
  private handPoint=new THREE.Vector3();
  private actors = new Map<string, {group:THREE.Group;tool:number;owner:THREE.Object3D}>();
  update(id:string,rig:CoopOperatorRig,action:ToolAction|undefined,now:number) {
    let entry=this.actors.get(id);
    if(entry&&entry.owner!==rig.root){entry.group.removeFromParent();this.actors.delete(id);entry=undefined;}
    if(!action||now>action.end+100||!rig.firearm.group.visible){if(entry)entry.group.visible=false;return;}
    if(!entry){entry={group:new THREE.Group(),tool:0,owner:rig.root};rig.root.add(entry.group);this.actors.set(id,entry);}
    if(entry.tool!==action.tool){
      entry.tool=action.tool;entry.group.clear();
      const asset:FriendsAssetId=action.tool===1?'toolAxe':action.tool===2?'toolPickaxe':'toolShovel';
      let model=models.get(asset);if(!model){model=loadFriendsAsset(asset).then(source=>fitFriendsAsset(source,{x:22,y:38,z:12},0,'contain'));models.set(asset,model);}
      const current=entry,tool=action.tool;
      void model.then(source=>{if(this.actors.get(id)===current&&current.tool===tool){const copy=source.clone(true);copy.position.y=-15;copy.rotation.y=-Math.PI/2;current.group.add(copy);}}).catch(()=>{});
    }
    entry.group.visible=true;rig.firearm.group.visible=false;
    const windup=Math.max(0,Math.min(1,(now-action.start)/(action.contact-action.start))),recovery=Math.max(0,Math.min(1,(now-action.contact)/(action.end-action.contact)));
    const swing=now<action.contact?-.55*Math.sin(windup*Math.PI/2):1.1*(1-recovery)**2;
    if(friendsCharacterHandPoint(rig,this.handPoint))entry.group.position.copy(this.handPoint);
    else entry.group.position.set(15,30,-18);
    entry.group.rotation.set(-.3+swing,.2,-.25+swing*.25);
  }
  prune(ids:ReadonlySet<string>) {for(const [id,entry]of this.actors)if(!ids.has(id)){entry.group.removeFromParent();this.actors.delete(id);}}
  dispose(){this.prune(new Set());}
}
