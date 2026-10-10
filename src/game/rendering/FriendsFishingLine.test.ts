import { describe,expect,it } from 'vitest';
import * as THREE from 'three';
import { FriendsFishingLine,FISHING_LINE_WIDTH_PX } from './FriendsFishingLine';

describe('bounded fishing filament',()=>{
  it('renders a clearly visible pixel width near the rod and at range across field-of-view and viewport changes',()=>{
    const line=new FriendsFishingLine();
    for(const height of [740,900,1440])for(const fov of [70,85,120])for(const depth of [2,50,600]){
      const camera=new THREE.PerspectiveCamera(fov,16/9,.1,2000),from=new THREE.Vector3(0,-depth*.1,-depth),to=new THREE.Vector3(0,depth*.1,-depth);
      line.update(from,to,0,16,camera.position,undefined,camera,height);
      const vertices=line.geometry.getAttribute('position');
      for(const i of [0,12,24]){
        const a=new THREE.Vector3().fromBufferAttribute(vertices,i*2).project(camera),b=new THREE.Vector3().fromBufferAttribute(vertices,i*2+1).project(camera);
        const width=Math.hypot((a.x-b.x)*height*camera.aspect/2,(a.y-b.y)*height/2);
        expect(width).toBeCloseTo(FISHING_LINE_WIDTH_PX,3);expect(width).toBeGreaterThan(3);
      }
    }line.dispose();
  });
  it('keeps moving strands smooth and untwisted, including when viewed directly along the line',()=>{
    const line=new FriendsFishingLine(),from=new THREE.Vector3(0,50,-5),to=new THREE.Vector3(0,0,-200),camera=new THREE.PerspectiveCamera(85,16/9,.1,2000);
    for(let frame=0;frame<180;frame++){
      from.x=Math.sin(frame*.03)*.5;line.update(from,to,frame<90?30:2,16,camera.position,undefined,camera,900);
      // No backtracking or solver folds along the endpoint axis.
      for(let i=1;i<25;i++)expect(line.points[i].z).toBeLessThan(line.points[i-1].z);
      const positions=line.geometry.getAttribute('position'),edges=[];
      for(let i=0;i<25;i++)edges.push(new THREE.Vector3().fromBufferAttribute(positions,i*2).sub(new THREE.Vector3().fromBufferAttribute(positions,i*2+1)).normalize());
      for(let i=1;i<25;i++)expect(edges[i].dot(edges[i-1])).toBeGreaterThanOrEqual(0);
    }
    from.set(0,0,-2);to.set(0,0,-200);line.update(from,to,0,16,camera.position,undefined,camera,900);
    expect(Array.from(line.geometry.attributes.position.array).every(Number.isFinite)).toBe(true);line.dispose();
  });
  it('settles to the same slack curve at different rendering rates without idle jitter',()=>{
    const from=new THREE.Vector3(0,50,-5),to=new THREE.Vector3(0,0,-200),camera=new THREE.Vector3(),lines=[new FriendsFishingLine(),new FriendsFishingLine()];
    for(const [index,dt] of [10,40].entries()){
      const line=lines[index];line.update(from,to,30,dt,camera);
      for(let t=0;t<400;t+=dt)line.update(from,to,2,dt,camera);
    }
    for(let i=0;i<25;i++)expect(lines[0].points[i].distanceTo(lines[1].points[i])).toBeLessThan(1e-8);
    for(const line of lines){for(let t=0;t<1000;t++)line.update(from,to,2,16,camera);const settled=line.points.map(p=>p.clone());for(let t=0;t<60;t++)line.update(from,to,2,16,camera);expect(line.points.every((p,i)=>p.distanceTo(settled[i])<1e-9)).toBe(true);line.dispose();}
  });
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
