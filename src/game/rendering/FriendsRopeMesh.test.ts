import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FriendsRopeMesh, HAULING_ROPE_RADIUS, ropeFibreTextures } from './FriendsRopeMesh';

describe('braided hauling rope',()=>{
  it.each([
    [new THREE.Vector3(0,0,0),new THREE.Vector3(400,0,0),440],
    [new THREE.Vector3(16000,700,-2000),new THREE.Vector3(16000,1100,-2000),420],
    [new THREE.Vector3(0,0,0),new THREE.Vector3(0,-400,0),420],
    [new THREE.Vector3(1,2,3),new THREE.Vector3(1.01,2,3),.01],
  ] as const)('keeps lit geometry finite, outward facing and bounded at difficult orientations', (start,end,length)=>{
    const mesh=new FriendsRopeMesh(new THREE.MeshStandardMaterial());mesh.update(start,end,length,.5);
    const p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal'),index=mesh.geometry.getIndex()!;
    const ids=new Set<number>();for(let i=0;i<mesh.geometry.drawRange.count;i++)ids.add(index.getX(i));
    for(const i of ids){
      const vertex=new THREE.Vector3().fromBufferAttribute(p,i),normal=new THREE.Vector3().fromBufferAttribute(n,i);
      expect(Number.isFinite(vertex.lengthSq())).toBe(true);expect(normal.length()).toBeCloseTo(1,4);
      expect(mesh.geometry.boundingSphere!.containsPoint(vertex)).toBe(true);
    }
    // Winding matters: a rope with reversed faces disappears with front-face materials.
    const a=new THREE.Vector3().fromBufferAttribute(p,index.getX(0)),b=new THREE.Vector3().fromBufferAttribute(p,index.getX(1)),c=new THREE.Vector3().fromBufferAttribute(p,index.getX(2));
    expect(b.sub(a).cross(c.sub(a)).dot(new THREE.Vector3().fromBufferAttribute(n,index.getX(0)))).toBeGreaterThan(0);
    expect(mesh.geometry.drawRange.count).toBeLessThanOrEqual(256*3*8*6);mesh.dispose();
  });
  it('has substantial world thickness and distinct twisted strands, while reusing every GPU buffer',()=>{
    const mesh=new FriendsRopeMesh(new THREE.MeshStandardMaterial()),start=new THREE.Vector3(),end=new THREE.Vector3(400,0,0);
    mesh.update(start,end,400,1);const p=mesh.geometry.getAttribute('position'),before=p.array,uv=mesh.geometry.getAttribute('uv');
    const first=new THREE.Vector3().fromBufferAttribute(p,0),second=new THREE.Vector3().fromBufferAttribute(p,9);
    expect(first.distanceTo(second)).toBeGreaterThan(HAULING_ROPE_RADIUS*.7);
    const radius=Math.hypot(first.y,first.z);expect(radius).toBeGreaterThan(1);
    expect(uv.getY(27*128)).toBeGreaterThan(15);
    mesh.update(new THREE.Vector3(40,50,60),new THREE.Vector3(440,70,80),450,.4,.15);
    expect(mesh.geometry.getAttribute('position').array).toBe(before);expect(mesh.geometry.getAttribute('uv')).toBe(uv);
    mesh.update(start,start,0,0);expect(mesh.geometry.drawRange.count).toBe(0);mesh.dispose();
  });
  it('uses reusable tileable colour and normal textures for fine fibres',()=>{
    const {map,normalMap}=ropeFibreTextures();expect(map.image.width).toBe(128);expect(map.wrapS).toBe(THREE.RepeatWrapping);
    expect(map.colorSpace).toBe(THREE.SRGBColorSpace);expect(normalMap.image.data[2]).toBeGreaterThan(200);
    expect(new Set(map.image.data).size).toBeGreaterThan(20);map.dispose();normalMap.dispose();
  });
  it('keeps bent and reversing paths lit without collapsed normals',()=>{
    const mesh=new FriendsRopeMesh(new THREE.MeshStandardMaterial());
    mesh.update(new THREE.Vector3(),new THREE.Vector3(20,0,0),100,1,1.45,[new THREE.Vector3(60,0,0),new THREE.Vector3(60,0,0)]);
    const p=mesh.geometry.getAttribute('position'),n=mesh.geometry.getAttribute('normal'),index=mesh.geometry.getIndex()!;
    for(let i=0;i<mesh.geometry.drawRange.count;i+=3){const id=index.getX(i);
      expect(Number.isFinite(new THREE.Vector3().fromBufferAttribute(p,id).lengthSq())).toBe(true);
      expect(new THREE.Vector3().fromBufferAttribute(n,id).length()).toBeCloseTo(1,4);
    }
    mesh.dispose();
  });
});
