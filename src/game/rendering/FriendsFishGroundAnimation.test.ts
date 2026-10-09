import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { groundedFishClip,groundFishMotion } from './FriendsFishGroundAnimation';

describe('grounded fish flopping',()=>{
  it('keeps the real asset root still while its tail continues to wriggle',async()=>{
    const bytes=readFileSync('public/models/friends/fishing/koi.glb');
    const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const original=gltf.animations.find(clip=>clip.name.endsWith('|Out_Of_Water'))!;
    const clip=groundedFishClip(original),body=gltf.scene.getObjectByName('Main1')!,tail=gltf.scene.getObjectByName('Main6')!;
    const position=body.position.clone(),rotation=body.quaternion.clone(),tailRotation=tail.quaternion.clone();
    const mixer=new THREE.AnimationMixer(gltf.scene);
    mixer.clipAction(clip).setEffectiveWeight(.45).play();
    let tailMovement=0;
    for(let now=0;now<20000;now+=16){
      mixer.timeScale=groundFishMotion(now,1).speed;mixer.update(.016);
      expect(body.position.distanceTo(position)).toBeLessThan(1e-8);
      expect(body.quaternion.angleTo(rotation)).toBeLessThan(1e-6);
      tailMovement=Math.max(tailMovement,tail.quaternion.angleTo(tailRotation));
    }
    expect(tailMovement).toBeGreaterThan(.1);
    expect(tailMovement).toBeLessThan(.6);
    expect(original.tracks.some(track=>track.name==='Main1.position')).toBe(true);
    mixer.stopAllAction();
  });

  it('uses small, slow efforts with rests and offsets each fish',()=>{
    const samples=Array.from({length:1000},(_,i)=>groundFishMotion(i*16,1));
    expect(samples.every(s=>s.speed>=.06&&s.speed<=.44&&Math.abs(s.roll)<=.025)).toBe(true);
    expect(samples.filter(s=>s.speed<.08).length).toBeGreaterThan(500);
    expect(Math.max(...samples.map(s=>s.speed))).toBeGreaterThan(.4);
    expect(groundFishMotion(2000,1)).not.toEqual(groundFishMotion(2000,2));
  });
});
