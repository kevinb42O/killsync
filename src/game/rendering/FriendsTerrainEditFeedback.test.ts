import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FriendsTerrain } from '../world/FriendsTerrain';
import { FriendsTerrainEditFeedback } from './FriendsTerrainEditFeedback';

describe('immediate excavation presentation',()=>{
  it('supplies only exposed neighboring faces and keeps a seam patch until both chunks install',()=>{
    const terrain=new FriendsTerrain();terrain.addGrade([8000,8000,0,512]);
    const source=Array.from({length:5},()=>new THREE.MeshStandardMaterial()),patch=new FriendsTerrainEditFeedback(new THREE.Group(),source);
    terrain.set(255,250,-1,0);patch.add(255,250,-1);patch.refresh(terrain);
    expect(patch.stats).toMatchObject({pendingVoxels:1,patchDraws:1});
    expect(patch['batches'].reduce((sum,m)=>sum+m.count,0)).toBe(5);
    patch.installed(15,15);patch.refresh(terrain);expect(patch.stats.pendingVoxels).toBe(1);
    patch.installed(16,15);patch.refresh(terrain);expect(patch.stats).toEqual({pendingVoxels:0,patchDraws:0});
    patch.dispose();source.forEach(m=>m.dispose());
  });
  it('bounds bursts and clears pending geometry immediately when a voxel is replaced',()=>{
    const terrain=new FriendsTerrain(),source=Array.from({length:5},()=>new THREE.MeshStandardMaterial()),patch=new FriendsTerrainEditFeedback(new THREE.Group(),source);
    for(let i=0;i<100;i++){terrain.set(300+i,300,200,0);patch.add(300+i,300,200);}
    patch.refresh(terrain);expect(patch.stats.pendingVoxels).toBe(16);
    for(let i=84;i<100;i++)terrain.set(300+i,300,200,2);
    patch.refresh(terrain);expect(patch.stats.pendingVoxels).toBe(0);
    patch.dispose();source.forEach(m=>m.dispose());
  });
});
