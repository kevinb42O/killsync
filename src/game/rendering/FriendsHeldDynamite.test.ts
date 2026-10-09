import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createFriendsCharacterModel, type FriendsCharacterData, type FriendsCharacterModel } from './FriendsCharacterModel';
import { lengthenFirstPersonArms } from './FriendsFirstPersonArms';
import { FriendsGestureViewmodels } from './FriendsGestureViewmodels';
const data=JSON.parse(readFileSync('public/models/friends/big-walk/character.json','utf8')) as FriendsCharacterData;
function fixture(aspect:number,fov:number){
  const model=createFriendsCharacterModel(data,new THREE.MeshStandardMaterial());lengthenFirstPersonArms(model);model.basis.position.set(0,0,0);model.basis.scale.setScalar(.075);model.root.rotation.y=Math.PI;model.parts[2].position.set(5.2,0,0);model.parts[3].position.set(-5.2,0,0);model.basePositions=model.parts.map(p=>p.position.clone());
  const root=new THREE.Group(),camera=new THREE.PerspectiveCamera(fov,aspect,.025,1000);root.add(model.root);camera.add(root);
  const view=Object.assign(Object.create(FriendsGestureViewmodels.prototype),{root,model,camera,blend:[0,0,0,0],lighting:{setVisible(){}}}) as FriendsGestureViewmodels;
  (view as unknown as {createHeldDynamite:(model:FriendsCharacterModel)=>void}).createHeldDynamite(model);
  return {view,camera,bundle:root.getObjectByName('friends-held-dynamite')!};
}
describe('held dynamite',()=>{
  it('shows an unlit red bundle in the palm within desktop and portrait framing',()=>{
    for(const aspect of [16/9,2.4,9/16])for(const fov of [70,98,110]){
      const {view,camera,bundle}=fixture(aspect,fov);view.update(0,0,10000,true,false,undefined,1000,true);camera.updateMatrixWorld(true);
      expect(bundle.visible).toBe(true);expect(bundle.getObjectByName('dynamite-ember')!.visible).toBe(false);
      const bounds=new THREE.Box3().setFromObject(bundle),points=[bounds.min,bounds.max];for(const p of points){const screen=p.clone().project(camera);expect(Math.abs(screen.x),JSON.stringify({aspect,fov,axis:'x',screen})).toBeLessThan(1);expect(Math.abs(screen.y),JSON.stringify({aspect,fov,axis:'y',screen})).toBeLessThan(1);expect(screen.z).toBeGreaterThan(-1);expect(screen.z).toBeLessThan(1);}
    }
  });
  it('releases the bundle with the throw gesture and puts the next one back in the hand',()=>{
    const {view,bundle}=fixture(16/9,98);for(const [age,visible] of [[0,true],[99,true],[100,false],[559,false],[560,true]] as const){view.update(0,0,1000,true,false,1000,1000+age,true);expect(bundle.visible).toBe(visible);}view.update(0,0,1000,true,false,undefined,2000,false);expect(bundle.visible).toBe(false);
  });
});
