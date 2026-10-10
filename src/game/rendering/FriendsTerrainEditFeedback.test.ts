import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FriendsTerrain } from '../world/FriendsTerrain';
import { FriendsTerrainEditFeedback } from './FriendsTerrainEditFeedback';
import { createTerrainShadowMaterials } from './FriendsTerrainCoverage';

describe('immediate excavation presentation',()=>{
  it('supplies only exposed neighboring faces and keeps a seam patch until both chunks install',()=>{
    const terrain=new FriendsTerrain();terrain.addGrade([8000,8000,0,512]);
    const source=Array.from({length:5},()=>new THREE.MeshStandardMaterial()),patch=new FriendsTerrainEditFeedback(new THREE.Group(),source);
    terrain.set(255,250,-1,0);patch.add(255,250,-1);patch.refresh(terrain);
    expect(patch.stats).toMatchObject({pendingVoxels:1,patchDraws:1});
    expect(patch['batches'].reduce((sum,m)=>sum+m.count,0)).toBe(5);
    expect(patch['batches'].every(m=>m.castShadow&&m.receiveShadow)).toBe(true);
    patch.installed(15,15);patch.refresh(terrain);expect(patch.stats.pendingVoxels).toBe(1);
    patch.installed(16,15);patch.refresh(terrain);expect(patch.stats).toEqual({pendingVoxels:0,patchDraws:0});
    patch.dispose();source.forEach(m=>m.dispose());
  });
  it('shares live excavation uniforms across visible, depth and distance shaders',()=>{
    const terrain=new FriendsTerrain();terrain.addGrade([8000,8000,0,512]);
    const visible=new THREE.MeshStandardMaterial(),shadows=createTerrainShadowMaterials(new THREE.DataTexture(),94,'surface');
    const sources=[visible,...Array.from({length:4},()=>new THREE.MeshStandardMaterial())];
    const patch=new FriendsTerrainEditFeedback(new THREE.Group(),sources);
    const shaders=[visible,shadows.depth,shadows.distance].map(material=>{
      patch.mask(material);
      const source=material===visible?THREE.ShaderLib.standard:material===shadows.depth?THREE.ShaderLib.depth:THREE.ShaderLib.distance;
      const shader={vertexShader:source.vertexShader,fragmentShader:source.fragmentShader,uniforms:{}} as Parameters<THREE.Material['onBeforeCompile']>[0];
      material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);return shader;
    });
    terrain.set(250,250,-1,0);patch.add(250,250,-1);patch.refresh(terrain);
    for(const shader of shaders){
      expect(shader.vertexShader).toContain('editWorld=(modelMatrix*editPosition).xyz');
      expect(shader.vertexShader).not.toContain('editN=objectNormal');
      expect(shader.uniforms.editCount).toBe(shaders[0].uniforms.editCount);
      expect(shader.uniforms.editCount.value).toBe(1);
      expect(shader.uniforms.editCells.value[0].toArray()).toEqual([250,-1,250]);
    }
    patch.installed(15,15);patch.refresh(terrain);
    expect(shaders.every(shader=>shader.uniforms.editCount.value===0)).toBe(true);
    patch.dispose();sources.forEach(m=>m.dispose());shadows.depth.dispose();shadows.distance.dispose();
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
