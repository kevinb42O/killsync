import * as THREE from 'three';

export const HAULING_ROPE_RADIUS = 1.45;
const MAX_SEGMENTS = 256, SIDES = 8, STRANDS = 3, PITCH = 14;
const PALETTES = [[1,.93,.79],[.87,.76,.59],[.96,.84,.67]] as const;
/** One draw call per rope. The three helices share fixed, reusable buffers. */
export class FriendsRopeMesh extends THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial> {
  private centres = Array.from({length:MAX_SEGMENTS+1},()=>new THREE.Vector3());
  private frames = Array.from({length:MAX_SEGMENTS+1},()=>new THREE.Vector3());
  private strand = Array.from({length:MAX_SEGMENTS+1},()=>new THREE.Vector3());
  private arc = new Float32Array(MAX_SEGMENTS+1);
  private tangent = new THREE.Vector3();
  private normal = new THREE.Vector3();
  private binormal = new THREE.Vector3();
  private radial = new THREE.Vector3();
  private point = new THREE.Vector3();
  private previousStartNormal = new THREE.Vector3(0,1,0);
  private setTangent(points:THREE.Vector3[],i:number,last:number){
    this.tangent.subVectors(points[Math.min(last,i+1)],points[Math.max(0,i-1)]);
    if(this.tangent.lengthSq()<1e-10)this.tangent.subVectors(points[Math.min(last,i+1)],points[i]);
    if(this.tangent.lengthSq()<1e-10)this.tangent.subVectors(points[i],points[Math.max(0,i-1)]);
    if(this.tangent.lengthSq()<1e-10)this.tangent.set(0,0,1);
    this.tangent.normalize();
  }
  private orthogonalizeNormal(){
    this.normal.addScaledVector(this.tangent,-this.normal.dot(this.tangent));
    if(this.normal.lengthSq()<.001)this.normal.set(Math.abs(this.tangent.x)<.9?1:0,0,Math.abs(this.tangent.x)<.9?0:1).addScaledVector(this.tangent,-this.normal.dot(this.tangent));
    this.normal.normalize();
  }
  constructor(material:THREE.MeshStandardMaterial) {
    const geometry=new THREE.BufferGeometry(),vertices=(MAX_SEGMENTS+1)*STRANDS*(SIDES+1);
    for(const [name,size]of [['position',3],['normal',3],['uv',2],['color',3]] as const)
      geometry.setAttribute(name,new THREE.BufferAttribute(new Float32Array(vertices*size),size).setUsage(THREE.DynamicDrawUsage));
    const indices=[];
    const index=(i:number,strand:number,side:number)=>(i*STRANDS+strand)*(SIDES+1)+side;
    for(let i=0;i<MAX_SEGMENTS;i++)for(let strand=0;strand<STRANDS;strand++)for(let side=0;side<SIDES;side++) {
      const a=index(i,strand,side),b=index(i+1,strand,side),c=a+1,d=b+1;
      indices.push(a,c,b,c,d,b);
    }
    geometry.setIndex(indices);super(geometry,material);
    this.name='braided-hauling-rope';this.frustumCulled=false;this.castShadow=true;
  }
  update(start:THREE.Vector3,end:THREE.Vector3,restLength:number,tension:number,startRadius=HAULING_ROPE_RADIUS,bends:readonly THREE.Vector3[] = [],endRadius=HAULING_ROPE_RADIUS) {
    const path=[start,...bends,end],lengths=path.slice(1).map((p,i)=>p.distanceTo(path[i])),distance=lengths.reduce((sum,n)=>sum+n,0);
    if(distance<.001){this.geometry.setDrawRange(0,0);return;}
    const sag=Math.min(55,Math.max(0,restLength-distance)*.5)*(1-THREE.MathUtils.clamp(tension,0,1));
    const segments=Math.max(24,Math.min(MAX_SEGMENTS,Math.ceil((distance+sag)*.6)));
    const position=this.geometry.getAttribute('position') as THREE.BufferAttribute,normal=this.geometry.getAttribute('normal') as THREE.BufferAttribute;
    const uv=this.geometry.getAttribute('uv') as THREE.BufferAttribute,color=this.geometry.getAttribute('color') as THREE.BufferAttribute;
    let leg=0,legStart=0;
    for(let i=0;i<=segments;i++) {
      const travel=i/segments*distance;
      while(leg<lengths.length-1&&travel>legStart+lengths[leg]){legStart+=lengths[leg];leg++;}
      const t=THREE.MathUtils.clamp((travel-legStart)/Math.max(.0001,lengths[leg]),0,1);
      this.centres[i].lerpVectors(path[leg],path[leg+1],t);this.centres[i].y-=Math.sin(Math.PI*t)*sag*lengths[leg]/distance;
      this.arc[i]=i?this.arc[i-1]+this.centres[i].distanceTo(this.centres[i-1]):0;
    }
    for(let i=0;i<=segments;i++) {
      this.setTangent(this.centres,i,segments);
      // Parallel transport avoids sudden twists when aiming up or down.
      this.normal.copy(i?this.frames[i-1]:this.previousStartNormal);
      this.orthogonalizeNormal();this.frames[i].copy(this.normal);if(!i)this.previousStartNormal.copy(this.normal);
    }
    for(let strand=0;strand<STRANDS;strand++) {
      const [red,green,blue]=PALETTES[strand];
      for(let i=0;i<=segments;i++) {
        this.normal.copy(this.frames[i]);this.setTangent(this.centres,i,segments);
        this.binormal.crossVectors(this.tangent,this.normal).normalize();
        const radius=Math.min(THREE.MathUtils.lerp(startRadius,HAULING_ROPE_RADIUS,THREE.MathUtils.smootherstep(this.arc[i],0,60)),THREE.MathUtils.lerp(endRadius,HAULING_ROPE_RADIUS,THREE.MathUtils.smootherstep(this.arc[segments]-this.arc[i],0,60)));
        const phase=this.arc[i]/PITCH*Math.PI*2+strand*Math.PI*2/STRANDS;
        this.strand[i].copy(this.centres[i]).addScaledVector(this.normal,Math.cos(phase)*radius*.56).addScaledVector(this.binormal,Math.sin(phase)*radius*.56);
      }
      for(let i=0;i<=segments;i++) {
        this.setTangent(this.strand,i,segments);
        this.normal.copy(this.frames[i]);this.orthogonalizeNormal();this.binormal.crossVectors(this.tangent,this.normal).normalize();
        const radius=Math.min(THREE.MathUtils.lerp(startRadius,HAULING_ROPE_RADIUS,THREE.MathUtils.smootherstep(this.arc[i],0,60)),THREE.MathUtils.lerp(endRadius,HAULING_ROPE_RADIUS,THREE.MathUtils.smootherstep(this.arc[segments]-this.arc[i],0,60)))*.48;
        for(let side=0;side<=SIDES;side++) {
          const theta=side/SIDES*Math.PI*2,id=(i*STRANDS+strand)*(SIDES+1)+side;
          this.radial.copy(this.normal).multiplyScalar(Math.cos(theta)).addScaledVector(this.binormal,Math.sin(theta));this.point.copy(this.strand[i]).addScaledVector(this.radial,radius);
          position.setXYZ(id,this.point.x,this.point.y,this.point.z);normal.setXYZ(id,this.radial.x,this.radial.y,this.radial.z);
          uv.setXY(id,side/SIDES,this.arc[i]/8);color.setXYZ(id,red,green,blue);
        }
      }
    }
    for(const a of [position,normal,uv,color])a.needsUpdate=true;
    this.geometry.setDrawRange(0,segments*STRANDS*SIDES*6);
    this.geometry.boundingSphere ??= new THREE.Sphere();
    this.geometry.boundingSphere.center.lerpVectors(start,end,.5);
    this.geometry.boundingSphere.radius=distance/2+sag+Math.max(startRadius,HAULING_ROPE_RADIUS)*2;
  }
  dispose(){this.geometry.dispose();this.material.dispose();}
}

/** Tileable colour and tangent-space normals: fine fibres sit on the real braid. */
export function ropeFibreTextures() {
  const size=128,colour=new Uint8Array(size*size*4),normal=new Uint8Array(size*size*4);
  const height=(u:number,v:number)=>.5+.20*Math.cos(u*Math.PI*20+Math.sin(v*Math.PI*2)*.3)+.035*Math.cos(u*Math.PI*64+v*Math.PI*16);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
    const u=x/size,v=y/size,h=height(u,v),i=(y*size+x)*4;
    const grain=.95+.035*Math.sin(x*2.4+y*1.73),shade=(.76+h*.28)*grain;
    colour[i]=Math.round(245*shade);colour[i+1]=Math.round(221*shade);colour[i+2]=Math.round(182*shade);colour[i+3]=255;
    const nx=(height(u-1/size,v)-height(u+1/size,v))*2,ny=(height(u,v-1/size)-height(u,v+1/size))*2,len=Math.hypot(nx,ny,1);
    normal[i]=Math.round((nx/len*.5+.5)*255);normal[i+1]=Math.round((ny/len*.5+.5)*255);normal[i+2]=Math.round((1/len*.5+.5)*255);normal[i+3]=255;
  }
  const map=new THREE.DataTexture(colour,size,size),normalMap=new THREE.DataTexture(normal,size,size);
  for(const t of [map,normalMap]){t.wrapS=t.wrapT=THREE.RepeatWrapping;t.magFilter=THREE.LinearFilter;t.minFilter=THREE.LinearMipmapLinearFilter;t.generateMipmaps=true;t.anisotropy=4;t.needsUpdate=true;}
  map.colorSpace=THREE.SRGBColorSpace;return {map,normalMap};
}
