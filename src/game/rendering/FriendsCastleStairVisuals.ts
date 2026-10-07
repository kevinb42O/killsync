import * as THREE from 'three';
import { CASTLE_STAIRS, ISLAND_RUINS } from '../world/FriendsTerrain';
import type { StairPoint } from '../world/FriendsCastleStairs';

/** Fan treads share boundary vertices at each join, including the spiral.
 * Exposed skins only: no overlapping rotated boxes or hidden tread faces. */
export class FriendsCastleStairVisuals extends THREE.Group {
  constructor(stone:THREE.MeshStandardMaterial){
    super();this.name='highfall-sweeping-masonry-stairs';
    const treadMaterial=stone.clone(),edgeMaterial=stone.clone();
    for(const m of [treadMaterial,edgeMaterial]){m.onBeforeCompile=stone.onBeforeCompile;m.customProgramCacheKey=stone.customProgramCacheKey;m.vertexColors=false;}
    treadMaterial.color.set('#c6bda4');edgeMaterial.color.set('#9ba2a0');
    // Flush paving at the earthen arrival terrace is an intentional overlay.
    // A depth bias keeps it stable against the matching terrain surface.
    treadMaterial.polygonOffset=true;treadMaterial.polygonOffsetFactor=-1;treadMaterial.polygonOffsetUnits=-1;
    const top={p:[]as number[],n:[]as number[],uv:[]as number[]},side={p:[]as number[],n:[]as number[],uv:[]as number[]};
    type Bucket=typeof top;
    const quad=(bucket:Bucket,points:number[][],normal:number[])=>{
      const a=points[1].map((v,i)=>v-points[0][i]),b=points[2].map((v,i)=>v-points[0][i]),cross=[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
      if(cross.reduce((n,v,i)=>n+v*normal[i],0)<0)points.reverse();
      for(const i of [0,1,2,0,2,3]){const p=points[i];bucket.p.push(...p);bucket.n.push(...normal);bucket.uv.push((Math.abs(normal[0])>.5?p[2]:p[0])/160,(normal[1]>.5?p[2]:p[1])/160);}
    };
    const point=(p:StairPoint,nx:number,ny:number,offset:number,z:number)=>[p.x+nx*offset,z,p.y+ny*offset];
    const treads=CASTLE_STAIRS.treads;
    for(let i=0;i<treads.length;i++){
      const t=treads[i],half=t.width/2,z=t.z,bottom=z-64,previous=treads[i-1],next=treads[i+1];
      const la=point(t.a,t.nxA,t.nyA,half,z),ra=point(t.a,t.nxA,t.nyA,-half,z),lb=point(t.b,t.nxB,t.nyB,half,z),rb=point(t.b,t.nxB,t.nyB,-half,z);
      quad(top,[la,lb,rb,ra],[0,1,0]);
      // A riser appears only where the height changes; long level connections
      // form one continuous landing, without rows of false vertical seams.
      if(!previous||previous.flight!==t.flight||previous.z!==z){
        const low=previous?.flight===t.flight?Math.min(z,previous.z):bottom,high=previous?.flight===t.flight?Math.max(z,previous.z):z;
        const dx=t.b.x-t.a.x,dy=t.b.y-t.a.y,l=Math.hypot(dx,dy)||1,sign=previous&&previous.z>z?1:-1;
        quad(side,[point(t.a,t.nxA,t.nyA,half,low),point(t.a,t.nxA,t.nyA,-half,low),point(t.a,t.nxA,t.nyA,-half,high),point(t.a,t.nxA,t.nyA,half,high)],[dx/l*sign,0,dy/l*sign]);
      }
      if(previous?.flight===t.flight&&previous.z!==z){
        const low=Math.min(bottom,previous.z-64),high=Math.max(bottom,previous.z-64);
        const dx=t.b.x-t.a.x,dy=t.b.y-t.a.y,l=Math.hypot(dx,dy)||1,sign=previous.z>z?-1:1;
        quad(side,[point(t.a,t.nxA,t.nyA,half,low),point(t.a,t.nxA,t.nyA,-half,low),point(t.a,t.nxA,t.nyA,-half,high),point(t.a,t.nxA,t.nyA,half,high)],[dx/l*sign,0,dy/l*sign]);
      }
      for(const direction of [-1,1]){
        const nx=(t.nxA+t.nxB)/2*direction,ny=(t.nyA+t.nyB)/2*direction,l=Math.hypot(nx,ny)||1;
        quad(side,[point(t.a,t.nxA,t.nyA,half*direction,z),point(t.a,t.nxA,t.nyA,half*direction,bottom),point(t.b,t.nxB,t.nyB,half*direction,bottom),point(t.b,t.nxB,t.nyB,half*direction,z)],[nx/l,0,ny/l]);
        // Continuous low parapets follow the curve rather than approximating
        // it with isolated posts, butt joints, or ninety-degree corner blocks.
        const outer=half+16,inner=half,railA=t.a.z+t.railA,railB=t.b.z+t.railB;
        quad(top,[point(t.a,t.nxA,t.nyA,inner*direction,railA),point(t.b,t.nxB,t.nyB,inner*direction,railB),point(t.b,t.nxB,t.nyB,outer*direction,railB),point(t.a,t.nxA,t.nyA,outer*direction,railA)],[0,1,0]);
        for(const [offset,sign]of [[inner,-1],[outer,1]])quad(side,[point(t.a,t.nxA,t.nyA,offset*direction,z),point(t.b,t.nxB,t.nyB,offset*direction,z),point(t.b,t.nxB,t.nyB,offset*direction,railB),point(t.a,t.nxA,t.nyA,offset*direction,railA)],[nx/l*sign,0,ny/l*sign]);
      }
      quad(side,[point(t.a,t.nxA,t.nyA,half,bottom),point(t.a,t.nxA,t.nyA,-half,bottom),point(t.b,t.nxB,t.nyB,-half,bottom),point(t.b,t.nxB,t.nyB,half,bottom)],[0,-1,0]);
      if(t.flight==='approach'){
        // Paired stone arcades carry the viaduct between its piers. A true
        // arched underside and substantial spandrels replace thin stilts.
        const arch=(distance:number,deck:number)=>{const u=(distance%384)/384,span=2*u-1;return deck-164-208*(1-Math.sqrt(Math.max(0,1-span*span)));};
        const lowerA=arch(t.distance,t.a.z),lowerB=arch(t.distance+Math.hypot(t.b.x-t.a.x,t.b.y-t.a.y),t.b.z);
        for(const direction of [-1,1]){
          const inner=68*direction,outer=100*direction,nx=(t.nxA+t.nxB)/2*direction,ny=(t.nyA+t.nyB)/2*direction,l=Math.hypot(nx,ny)||1;
          for(const [offset,sign]of [[outer,1],[inner,-1]])quad(side,[point(t.a,t.nxA,t.nyA,offset,t.a.z-64),point(t.b,t.nxB,t.nyB,offset,t.b.z-64),point(t.b,t.nxB,t.nyB,offset,lowerB),point(t.a,t.nxA,t.nyA,offset,lowerA)],[nx/l*sign,0,ny/l*sign]);
          quad(side,[point(t.a,t.nxA,t.nyA,inner,lowerA),point(t.a,t.nxA,t.nyA,outer,lowerA),point(t.b,t.nxB,t.nyB,outer,lowerB),point(t.b,t.nxB,t.nyB,inner,lowerB)],[0,-1,0]);
        }
      }
      if(!next||next.flight!==t.flight){const dx=t.b.x-t.a.x,dy=t.b.y-t.a.y,l=Math.hypot(dx,dy)||1;quad(side,[lb,rb,point(t.b,t.nxB,t.nyB,-half,bottom),point(t.b,t.nxB,t.nyB,half,bottom)],[dx/l,0,dy/l]);}
    }
    // Bevelled pier heads meet the underside's pitch across the full socket;
    // their uphill corners cannot protrude through the descending treads.
    for(const b of ISLAND_RUINS.filter(b=>b.detail==='stair-pier')){
      const corners=[[-1,-1],[-1,1],[1,1],[1,-1]].map(([dx,dy])=>{
        const x=b.x+dx*b.w/2,y=b.y+dy*b.d/2,z=(CASTLE_STAIRS.floor(x,y)??b.z+b.h+64)-64;
        return [x,Math.max(b.z+b.h,z),y];
      });
      quad(side,corners,[0,1,0]);
      for(let i=0;i<4;i++){const a=corners[i],c=corners[(i+1)%4],dx=c[0]-a[0],dy=c[2]-a[2],l=Math.hypot(dx,dy)||1;quad(side,[a,c,[c[0],b.z+b.h,c[2]],[a[0],b.z+b.h,a[2]]],[dy/l,0,-dx/l]);}
    }
    for(const [bucket,material]of [[top,treadMaterial],[side,edgeMaterial]]as const){
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(bucket.p,3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(bucket.n,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(bucket.uv,2));geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=mesh.castShadow=true;this.add(mesh);
    }
  }
}
