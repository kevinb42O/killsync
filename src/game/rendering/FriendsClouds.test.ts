import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { FriendsClouds } from './FriendsClouds';
import { createCloudVolume, CLOUD_VOLUME_SIZE, CLOUD_WIND } from './FriendsCloudVolume';
import { createFrontierCloudField, CLOUD_FIELD_MARGIN, CLOUD_FIELD_SPAN } from '../world/FriendsCloudField';
import { applyFriendsCaveLighting } from './FriendsCaveLighting';
import type { FriendsDayNightCycle } from './FriendsDayNightCycle';
describe('moving billowy cloud volumes and optical shadows',()=>{
  it('keeps menu shadow footprints with the same wind when accelerated sunlight moves',()=>{
    const r={getRenderTarget:()=>null,getViewport:(v:THREE.Vector4)=>v.set(0,0,800,600),getScissor:(v:THREE.Vector4)=>v.set(0,0,800,600),getScissorTest:()=>false,getClearColor:(v:THREE.Color)=>v.setHex(0),getClearAlpha:()=>1,
      setRenderTarget:vi.fn(),setViewport:vi.fn(),setScissor:vi.fn(),setScissorTest:vi.fn(),setClearColor:vi.fn(),clear:vi.fn(),render:vi.fn(),autoClear:true,shadowMap:{enabled:false,needsUpdate:false}};
    const clouds=new FriendsClouds(r as unknown as THREE.WebGLRenderer,{stableProjection:true});
    const atmosphere={lightDirection:{value:new THREE.Vector3(.8,.5,.1).normalize()},directStrength:{value:1},cloudColor:{value:new THREE.Color()},horizon:new THREE.Color()} as FriendsDayNightCycle;
    clouds.setAtmosphere(atmosphere);
    const material=new THREE.MeshStandardMaterial();clouds.shade(material);
    const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}} as Parameters<THREE.Material['onBeforeCompile']>[0];
    material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
    clouds.update(.5,1);
    expect(shader.uniforms.frontierCloudWind.value).toBe(clouds.windOffset);
    expect(clouds.windOffset.toArray()).toEqual([21,7]);
    expect(shader.uniforms.frontierCloudSlope.value.toArray()).toEqual([0,0]);
    atmosphere.lightDirection.value.set(-.8,.1,.5).normalize();
    clouds.update(1,2);
    expect(clouds.windOffset.toArray()).toEqual([42,14]);
    expect(shader.uniforms.frontierCloudSlope.value.toArray()).toEqual([0,0]);
    expect(r.render).toHaveBeenCalledTimes(1);
    material.dispose();clouds.release();
  });
  it('bakes padded, varied density and self-lighting into one bounded volume',()=>{
    const data=createCloudVolume();expect(createCloudVolume()).toBe(data);expect(data.length).toBe(CLOUD_VOLUME_SIZE**3*2);
    let filled=0,dim=0;for(let i=0;i<data.length;i+=2){if(data[i]>30)filled++;if(data[i]>30&&data[i+1]<200)dim++;}
    expect(filled).toBeGreaterThan(5000);expect(filled).toBeLessThan(CLOUD_VOLUME_SIZE**3*.5);expect(dim).toBeGreaterThan(1000);
  });
  it('uses exactly the same wind, density, shapes, heights and light for visible clouds and shadows',()=>{
    const clouds=new FriendsClouds(),shadow=clouds['shadowMesh'];
    expect(shadow.material.uniforms.densityMap).not.toBeUndefined();
    expect(shadow.material.uniforms.densityMap.value).toBe(clouds.material.uniforms.densityMap.value);
    // Shadow footprints stay in immutable weather space. Continuous wind is
    // applied by the receiving material, independently of atlas refreshes.
    expect(shadow.count).toBe(clouds.count*9);
    expect(shadow.instanceMatrix.meshPerAttribute).toBe(9);
    expect(Array.from(shadow.instanceMatrix.array)).toEqual(Array.from(clouds.instanceMatrix.array));
    clouds.update(10);expect(clouds.windOffset.toArray()).toEqual([CLOUD_WIND.x*10,CLOUD_WIND.z*10]);
    clouds.update(30);expect(clouds.windOffset.toArray()).toEqual([CLOUD_WIND.x*30,CLOUD_WIND.z*30]);
    expect(clouds.material.fragmentShader).toContain('int steps=a>18000.?6:a>7000.?8:12;');
    clouds.release();
  });
  it('bounds shadow work and restores renderer state even if a shadow pass fails',()=>{
    const r={getRenderTarget:()=>null,getViewport:(v:THREE.Vector4)=>v.set(0,0,800,600),getScissor:(v:THREE.Vector4)=>v.set(0,0,800,600),getScissorTest:()=>true,getClearColor:(v:THREE.Color)=>v.setHex(0x123456),getClearAlpha:()=>1,
      setRenderTarget:vi.fn(),setViewport:vi.fn(),setScissor:vi.fn(),setScissorTest:vi.fn(),setClearColor:vi.fn(),clear:vi.fn(),render:vi.fn(),autoClear:true,shadowMap:{enabled:true,needsUpdate:true}};
    const clouds=new FriendsClouds(r as unknown as THREE.WebGLRenderer);
    clouds.update(0,0);clouds.update(.01,.01);clouds.update(.1,.1);expect(r.render).toHaveBeenCalledTimes(1);
    clouds.update(0,.21);clouds.update(100,100);expect(r.render).toHaveBeenCalledTimes(1);
    clouds.material.uniforms.sunDirection.value.set(.8,.5,.1).normalize();
    clouds.update(100,101);expect(r.render).toHaveBeenCalledTimes(2);
    clouds.material.uniforms.sunDirection.value.set(.3,.8,.1).normalize();
    r.render.mockImplementation(()=>{throw new Error('test render failure');});
    expect(()=>clouds.update(1,1)).toThrow('test render failure');
    expect(r.shadowMap).toEqual({enabled:true,needsUpdate:true});expect(r.autoClear).toBe(true);
    expect(r.setRenderTarget).toHaveBeenLastCalledWith(null);expect(r.setScissorTest).toHaveBeenLastCalledWith(true);
    clouds.release();
  });
  it('shadows only the celestial directional light and composes with cave lighting',()=>{
    const clouds=new FriendsClouds();
    for(const cave of [false,true]){
      const material=new THREE.MeshStandardMaterial();if(cave)applyFriendsCaveLighting(material);clouds.shade(material);
      const shader={vertexShader:THREE.ShaderLib.standard.vertexShader,fragmentShader:THREE.ShaderLib.standard.fragmentShader,uniforms:{}} as Parameters<THREE.Material['onBeforeCompile']>[0];
      material.onBeforeCompile(shader,{} as THREE.WebGLRenderer);
      const fragment=shader.fragmentShader;
      expect(fragment).not.toContain('reflectedLight.directDiffuse*=');
      expect(fragment).not.toContain('reflectedLight.directSpecular*=');
      const point=THREE.ShaderChunk.lights_fragment_begin.split('#if ( NUM_POINT_LIGHTS')[1].split('#if ( NUM_DIR_LIGHTS')[0];
      expect(fragment).toContain(point); // Point/spot light accumulation is intact.
      if(cave)expect(fragment).not.toContain('frontierCloudShadow');
      else expect(fragment).toContain('cloudSurface.xz-frontierCloudWind-frontierCloudSlope*cloudSurface.y');
      expect(fragment).toContain(cave?'directLight.color *= 0.':'directLight.color*=mix(1.,cloudSun,cloudAlignment)');
      material.dispose();
    }
    clouds.release();
  });
  it('culls offscreen volumes and packs overlapping clouds from far to near without changing the shadow field',()=>{
    const clouds=new FriendsClouds(),field=createFrontierCloudField(),camera=new THREE.PerspectiveCamera(55,1,1,110000);
    camera.position.set(6000,800,6000);camera.lookAt(9000,4000,12000);
    const original=Array.from(clouds['shadowMesh'].instanceMatrix.array);
    clouds.update(120,120,camera);
    expect(clouds.count).toBeGreaterThan(0);expect(clouds.count).toBeLessThan(field.length);
    const frustum=new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    let previousDepth=Infinity;
    for(let i=0;i<clouds.count;i++){
      const matrix=new THREE.Matrix4();clouds.getMatrixAt(i,matrix);
      const centre=new THREE.Vector3().setFromMatrixPosition(matrix);
      centre.x=(centre.x+clouds.windOffset.x+CLOUD_FIELD_MARGIN)%CLOUD_FIELD_SPAN-CLOUD_FIELD_MARGIN;
      centre.z=(centre.z+clouds.windOffset.y+CLOUD_FIELD_MARGIN)%CLOUD_FIELD_SPAN-CLOUD_FIELD_MARGIN;
      expect(frustum.intersectsSphere(new THREE.Sphere(centre,new THREE.Vector3().setFromMatrixScale(matrix).length()))).toBe(true);
      const depth=-centre.applyMatrix4(camera.matrixWorldInverse).z;
      expect(depth).toBeLessThanOrEqual(previousDepth+1e-6);previousDepth=depth;
    }
    expect(Array.from(clouds['shadowMesh'].instanceMatrix.array)).toEqual(original);
    // Bounded wind coordinates preserve sub-cloud precision after months.
    clouds.update(1e12);expect(clouds.windOffset.x).toBeLessThan(CLOUD_FIELD_SPAN);expect(clouds.windOffset.y).toBeLessThan(CLOUD_FIELD_SPAN);
    clouds.release();
  });
});
