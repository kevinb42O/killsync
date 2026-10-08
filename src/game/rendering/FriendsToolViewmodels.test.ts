import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FriendsToolViewmodels } from './FriendsToolViewmodels';
import { acquireEquipmentLighting } from './FriendsHeldEquipment';

vi.mock('./FriendsHeldEquipment',async importOriginal=>{
  const actual=await importOriginal<typeof import('./FriendsHeldEquipment')>();
  return {...actual,loadFriendsGrip:vi.fn(async(_side:string,hold='tool')=>{const mesh=new THREE.Mesh(new THREE.BoxGeometry(.08,.08,.5));mesh.name='premade-right-arm';mesh.userData.armHold=hold;return mesh;}),loadFinishedFriendsTool:vi.fn(async(asset:string)=>{const group=new THREE.Group();group.name=asset;return group;})};
});
function fixture(){const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(98,16/9,.025,1000);scene.add(camera);return {scene,camera,tools:new FriendsToolViewmodels(scene)};}
const loaded=async()=>{await Promise.resolve();await Promise.resolve();await Promise.resolve();};

describe('Friends existing tool viewmodels',()=>{
  it('uses the existing base/upgraded tools and a premade connected arm, without adding a shovel to Rope',async()=>{
    const {tools,camera}=fixture();
    for(const [id,name,asset]of [[1,'axe','toolAxe'],[2,'pickaxe','toolPickaxe'],[3,'shovel','toolShovel']] as const){
      tools.update(id,1000,false,false);await loaded();const model=tools.root.getObjectByName(`held-${name}`)!;
      expect(model.visible).toBe(true);expect(tools.root.parent).toBe(camera);expect(model.getObjectByName(asset)).toBeTruthy();expect(model.getObjectByName('premade-right-arm')).toBeTruthy();expect(model.getObjectByName('premade-right-arm')!.userData.armHold).toBe(id===1?'tool':'inward');
    }
    tools.update(1,1500,false,true);await loaded();expect(tools.root.getObjectByName('toolAxeUpgraded')).toBeTruthy();
    for(const id of [0,5] as const){tools.update(id,2000,false,false);expect(tools.root.visible).toBe(false);}
    tools.dispose();
  });
  it('reuses assemblies across tool switches and poses the tool and its arm together at contact',async()=>{
    const {tools}=fixture();tools.update(1,1000,false,false);await loaded();tools.update(1,1500,false,false);
    const axe=tools.root.getObjectByName('held-axe')!,arm=axe.getObjectByName('premade-right-arm')!,idle=axe.rotation.x;
    const action={actor:'p',tool:1 as const,serial:1,targetId:'tree',start:2000,contact:2200,end:2480};
    tools.setAction(action,2190);expect(axe.rotation.x).toBeGreaterThan(idle);tools.setAction(action,2200);expect(axe.rotation.x).toBeLessThan(idle);expect(arm.parent).toBe(axe);
    tools.update(2,3000,false,false);tools.update(1,3500,false,false);expect(tools.root.getObjectByName('held-axe')).toBe(axe);
    tools.dispose();expect(tools.root.parent).toBeNull();
  });
  it('does not attach an asset that completes after disposal',async()=>{
    const {tools}=fixture();tools.update(1,1000,false,false);const assembly=tools.root.children[0];tools.dispose();await loaded();expect(assembly.children).toHaveLength(0);
  });
  it('shares and releases equipment lighting, hiding it when only Rope is equipped',()=>{
    const {scene,tools}=fixture(),torchLight=acquireEquipmentLighting(scene),rig=scene.getObjectByName('friends-equipment-lighting')!;
    tools.update(1,1000,false,false);expect(rig.visible).toBe(true);torchLight.setVisible(true);
    tools.update(5,1500,false,false);expect(rig.visible).toBe(true);torchLight.setVisible(false);expect(rig.visible).toBe(false);
    tools.update(2,2000,false,false);tools.hide();expect(rig.visible).toBe(false);tools.dispose();expect(rig.parent).not.toBeNull();torchLight.dispose();expect(rig.parent).toBeNull();
  });
});
