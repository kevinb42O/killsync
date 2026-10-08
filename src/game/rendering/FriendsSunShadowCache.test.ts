import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FriendsSunShadowCache } from './FriendsSunShadowCache';

function fixture() {
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera();
  const sun=new THREE.DirectionalLight();sun.position.set(3,6,4);sun.castShadow=true;
  Object.assign(sun.shadow.camera,{left:-10,right:10,top:10,bottom:-10,near:.1,far:50});sun.shadow.camera.updateProjectionMatrix();
  const caster=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial());caster.castShadow=true;
  scene.add(sun,sun.target,caster);
  const renderer={shadowMap:{enabled:true,autoUpdate:false,needsUpdate:false,type:THREE.PCFShadowMap},localClippingEnabled:false,clippingPlanes:[]} as THREE.WebGLRenderer;
  const cache=new FriendsSunShadowCache(scene,renderer,sun);
  let renders=0;
  const render=(scheduled=true)=>{
    renderer.shadowMap.needsUpdate=scheduled;
    scene.updateMatrixWorld();camera.updateMatrixWorld();scene.onBeforeRender(renderer,scene,camera,null,null,null);
    if(scheduled&&(sun.shadow.autoUpdate||sun.shadow.needsUpdate)){
      renders++;sun.shadow.map??=new THREE.WebGLRenderTarget(32,32);sun.shadow.needsUpdate=false;
    }
    renderer.shadowMap.needsUpdate=false;scene.onAfterRender(renderer,scene,camera,null,null,null);
    return renders;
  };
  return{scene,camera,sun,caster,renderer,cache,render};
}

describe('exact sun shadow reuse',()=>{
  it('retains its snapshot between scheduled updates and restores per-light flags',()=>{
    const f=fixture();expect(f.render()).toBe(1);
    for(let i=0;i<5;i++)expect(f.render(false)).toBe(1);
    for(let i=0;i<5;i++)expect(f.render()).toBe(1);
    expect(f.cache.reuses).toBe(5);expect(f.sun.shadow.autoUpdate).toBe(true);
    expect(f.renderer.shadowMap.autoUpdate).toBe(false);
    f.cache.dispose();f.sun.shadow.dispose();
  });
  it('refreshes for transforms, geometry, eligibility, instance data and projection',()=>{
    const f=fixture();f.render();
    const edits=[
      ()=>f.caster.position.x+=.0000001,
      ()=>f.caster.geometry.getAttribute('position').needsUpdate=true,
      ()=>f.caster.material.alphaTest=.3,
      ()=>f.caster.material.side=THREE.DoubleSide,
      ()=>f.caster.visible=false,
      ()=>f.caster.visible=true,
      ()=>f.caster.castShadow=false,
      ()=>f.caster.castShadow=true,
      ()=>{f.sun.shadow.camera.right+=.01;f.sun.shadow.camera.updateProjectionMatrix();},
      ()=>f.sun.target.position.x+=.001,
      ()=>f.sun.shadow.mapSize.x=64,
    ];
    for(const edit of edits){const before=f.render();edit();expect(f.render()).toBe(before+1);f.render();const stable=f.render();expect(f.render()).toBe(stable);}
    const instances=new THREE.InstancedMesh(new THREE.BoxGeometry(),new THREE.MeshStandardMaterial(),2);instances.castShadow=true;instances.frustumCulled=false;f.scene.add(instances);
    let before=f.render();instances.instanceMatrix.needsUpdate=true;expect(f.render()).toBe(before+1);
    before=f.render();instances.count=1;expect(f.render()).toBe(before+1);
    f.cache.dispose();f.sun.shadow.dispose();
  });
  it('tracks alpha maps, texture transforms and clipping, and honours explicit invalidation',()=>{
    const f=fixture();f.caster.material.map=new THREE.Texture();f.caster.material.alphaTest=.5;f.render();
    const edits=[
      ()=>f.caster.material.map!.offset.x+=.01,
      ()=>f.caster.material.map!.needsUpdate=true,
      ()=>f.caster.material.map!.source.needsUpdate=true,
      ()=>f.caster.material.clippingPlanes=[new THREE.Plane(new THREE.Vector3(1,0,0),1)],
      ()=>f.caster.material.clippingPlanes![0].constant=2,
      ()=>f.sun.shadow.needsUpdate=true,
      ()=>f.cache.invalidate(),
    ];
    for(const edit of edits){const before=f.render();edit();expect(f.render()).toBe(before+1);}
    f.cache.dispose();f.sun.shadow.dispose();
  });
  it('never caches custom depth or shadow hooks and leaves other shadow lights eligible',()=>{
    const f=fixture();f.render();
    f.caster.customDepthMaterial=new THREE.MeshDepthMaterial();expect(f.render()).toBe(2);expect(f.render()).toBe(3);
    f.caster.customDepthMaterial=undefined;f.caster.onBeforeShadow=()=>{};
    expect(f.render()).toBe(4);expect(f.render()).toBe(5);
    f.caster.onBeforeShadow=THREE.Object3D.prototype.onBeforeShadow;
    f.render();const spot=new THREE.SpotLight();spot.castShadow=true;spot.shadow.needsUpdate=true;f.scene.add(spot);
    const before=f.render();expect(f.render()).toBe(before);expect(spot.shadow.needsUpdate).toBe(true);expect(spot.shadow.autoUpdate).toBe(true);
    f.cache.dispose();f.sun.shadow.dispose();
  });
  it('invalidates for attribute semantics, draw groups and map disposal',()=>{
    const f=fixture();f.render();
    const uv=f.caster.geometry.getAttribute('uv');
    let before=f.render();
    f.caster.geometry.deleteAttribute('uv');f.caster.geometry.setAttribute('uv1',uv);
    expect(f.render()).toBe(before+1);
    before=f.render();f.caster.geometry.groups[0].count--;
    expect(f.render()).toBe(before+1);
    before=f.render();f.sun.shadow.map!.dispose();
    expect(f.render()).toBe(before+1);
    f.cache.dispose();f.sun.shadow.dispose();
  });
  it('falls back for GPU-owned textures and unsupported animation paths',()=>{
    const f=fixture();f.caster.material.alphaMap=new THREE.Texture();
    f.caster.material.alphaMap.isRenderTargetTexture=true;
    expect(f.render()).toBe(1);expect(f.render()).toBe(2);
    f.caster.material.alphaMap=null;
    const batched=new THREE.BatchedMesh(2,24,36,new THREE.MeshStandardMaterial());
    batched.frustumCulled=false;batched.castShadow=true;f.scene.add(batched);
    expect(f.render()).toBe(3);expect(f.render()).toBe(4);
    f.cache.dispose();batched.dispose();f.sun.shadow.dispose();
  });
  it('chains scene hooks and releases retained state and hooks on disposal',()=>{
    const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),sun=new THREE.DirectionalLight();
    let calls=0;const before=()=>{calls++;},after=()=>{calls++;};scene.onBeforeRender=before;scene.onAfterRender=after;
    const renderer={shadowMap:{enabled:false}} as THREE.WebGLRenderer;
    const cache=new FriendsSunShadowCache(scene,renderer,sun);
    scene.onBeforeRender(renderer,scene,camera,null,null,null);scene.onAfterRender(renderer,scene,camera,null,null,null);expect(calls).toBe(2);
    cache.dispose();expect(scene.onBeforeRender).toBe(before);expect(scene.onAfterRender).toBe(after);
  });
});
