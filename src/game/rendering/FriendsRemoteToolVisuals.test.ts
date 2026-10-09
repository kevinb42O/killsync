import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FriendsRemoteToolVisuals } from './FriendsRemoteToolVisuals';
import type { PlayerVisualRig } from './coopOperatorVisuals';
import { getCoopSkin } from '../multiplayer/CoopSkins';
vi.mock('./FriendsAssets',()=>({loadFriendsAsset:vi.fn(async()=>new THREE.Group()),fitFriendsAsset:(source:THREE.Group)=>source}));
const rig=():PlayerVisualRig=>({root:new THREE.Group(),avatar:new THREE.Group(),nameplate:new THREE.Sprite(),nameplateScale:new THREE.Vector3(1,1,1),skin:getCoopSkin(undefined)});
const action={actor:'guest',serial:1,targetId:'tree',tool:1,start:0,contact:50,end:100} as const;
describe('Friends tool rendering without survival equipment',()=>{
  it('renders a swing with no firearm, then puts the tool away after the action expires',async()=>{
    const r=rig(),tools=new FriendsRemoteToolVisuals();tools.update('guest',r,action,25);
    await Promise.resolve();await Promise.resolve();
    expect(r.firearm).toBeUndefined();expect(r.root.children[0].visible).toBe(true);
    tools.update('guest',r,action,250);expect(r.root.children[0].visible).toBe(false);
    tools.dispose();expect(r.root.children).toHaveLength(0);
  });
  it('hides a tool when seating or other equipment occupies the hands, and removes disconnected actors',()=>{
    const r=rig(),tools=new FriendsRemoteToolVisuals();tools.update('guest',r,action,25);
    tools.update('guest',r,action,30,false);expect(r.root.children[0].visible).toBe(false);
    tools.prune(new Set());expect(r.root.children).toHaveLength(0);
  });
});
