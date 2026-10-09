import { describe,expect,it } from 'vitest';
import * as THREE from 'three';
import { FriendsFishingLine } from './FriendsFishingLine';

describe('bounded fishing filament',()=>{
  it('lets slack float on the surface and follows a moving rod without changing its buffers',()=>{
    const line=new FriendsFishingLine(),from=new THREE.Vector3(0,50,0),end=new THREE.Vector3(160,0,0),camera=from.clone();
    for(let i=0;i<240;i++){from.z=Math.sin(i*.03)*35;line.update(from,end,35,16,camera,0);}
    expect(line.points.slice(1,-1).every(p=>p.y>=0)).toBe(true);
    expect(line.points[0].distanceTo(from)).toBeLessThan(1e-6);expect(line.points.at(-1)!.distanceTo(end)).toBeLessThan(1e-6);line.dispose();
  });
  it('keeps its anchors pinned, reuses buffers and stays finite through slack, retrieval and teleports',()=>{
    const line=new FriendsFishingLine(),from=new THREE.Vector3(0,40,0),end=new THREE.Vector3(200,0,-50),camera=new THREE.Vector3(0,35,6),buffer=line.geometry.getAttribute('position').array;
    for(let i=0;i<300;i++){if(i===100)from.x=5000;if(i===200)end.copy(from);line.update(from,end,i<150?20:1,i===120?5000:16,camera);expect(line.points[0].distanceTo(from)).toBeLessThan(1e-6);expect(line.points.at(-1)!.distanceTo(end)).toBeLessThan(1e-6);}
    expect(line.geometry.getAttribute('position').array).toBe(buffer);expect([...buffer].every(Number.isFinite)).toBe(true);expect(line.points).toHaveLength(25);line.dispose();
  });
});
