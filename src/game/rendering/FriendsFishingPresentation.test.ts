import { readFileSync } from 'node:fs';
import { describe,expect,it } from 'vitest';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { heldFishClip,heldFishFraming } from './FriendsFishingPresentation';

describe('fish presentation',()=>{
  it('keeps the actual asset tail near its straight rest pose through the entire held animation',async()=>{
    const bytes=readFileSync('public/models/friends/fishing/koi.glb');
    const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
    const swim=gltf.animations.find(c=>c.name.endsWith('|Swimming_Normal'))!;
    const bones=['Main1','Main2','Main3','Main4','Main5','Main6'].map(name=>gltf.scene.getObjectByName(name)!);
    const rest=bones.map(b=>b.quaternion.clone()),mixer=new THREE.AnimationMixer(gltf.scene);
    mixer.clipAction(heldFishClip(swim,gltf.scene)).play();let motion=0;
    for(let i=0;i<500;i++){mixer.update(.016);bones.forEach((b,j)=>{const angle=b.quaternion.angleTo(rest[j]);expect(angle).toBeLessThan(.18);motion=Math.max(motion,angle);});}
    expect(motion).toBeGreaterThan(.001);mixer.stopAllAction();
  });
  it('keeps the maximum catch silhouette inside desktop framing and supports small catches with closer hands',()=>{
    for(const aspect of [16/9,2.4])for(const fov of [70,98,120]){
      const p=heldFishFraming(4.2,fov,aspect),camera=new THREE.PerspectiveCamera(fov,aspect,.025,1000);
      const halfWidth=34*p.fishScale*.5*p.scale*p.narrow;
      for(const x of [-halfWidth,halfWidth]){
        const ndc=new THREE.Vector3(x,-.34*p.depth*p.scale*p.narrow+p.lift*p.scale*p.narrow,-p.depth+.20).project(camera);
        expect(Math.abs(ndc.x)).toBeLessThan(.9);expect(Math.abs(ndc.y)).toBeLessThan(.9);
      }
    }
    expect(heldFishFraming(.45).spread).toBeLessThan(heldFishFraming(1).spread);
    expect(heldFishFraming(4.2).depth).toBeGreaterThan(heldFishFraming(1).depth);
  });
});
